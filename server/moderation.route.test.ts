import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPubliclyVisible, MAX_REPORTS_PER_DAY } from "@shared/moderation";

/**
 * Receipts the fake database holds. `getPublicReceipt` below applies the same
 * rule the real one does — public AND not hidden — so a takedown here is a
 * takedown everywhere the route reads from it.
 */
const stored: Record<number, { id: number; userId: number; visibility: string; moderationStatus: string; prediction: string }> = {
  1: { id: 1, userId: 2, visibility: "PUBLIC", moderationStatus: "VISIBLE", prediction: "Public and fine" },
  2: { id: 2, userId: 1, visibility: "PUBLIC", moderationStatus: "VISIBLE", prediction: "Written by the caller" },
  3: { id: 3, userId: 2, visibility: "PRIVATE", moderationStatus: "VISIBLE", prediction: "Nobody else sees this" },
  4: { id: 4, userId: 2, visibility: "PUBLIC", moderationStatus: "HIDDEN", prediction: "Already taken down" },
};

const reports: Array<{ receiptId: number; reporterId: number; reason: string; detail: string | null }> = [];
const applied: Array<{ receiptId: number; moderatorId: number; action: string; note: string | null }> = [];
let reportsToday = 0;

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getPublicReceipt: async (id: number) => {
    const receipt = stored[id];
    return receipt && isPubliclyVisible(receipt) ? { receipt, user: { username: "nia" } } : undefined;
  },
  getReceiptById: async (id: number) => stored[id],
  getReportByReporter: async (receiptId: number, reporterId: number) =>
    reports.find((report) => report.receiptId === receiptId && report.reporterId === reporterId),
  createReceiptReport: async (input: { receiptId: number; reporterId: number; reason: string; detail?: string | null }) => {
    if (reports.some((r) => r.receiptId === input.receiptId && r.reporterId === input.reporterId)) {
      return { created: false, rateLimited: false };
    }
    if (reportsToday >= MAX_REPORTS_PER_DAY) return { created: false, rateLimited: true };
    reports.push({ ...input, detail: input.detail ?? null });
    return { created: true, rateLimited: false };
  },
  countOpenReports: async () => reports.length,
  listModerationActions: async () => [],
  getReportQueue: async () => ({ items: [], nextCursor: null }),
  applyModerationAction: async (input: { receiptId: number; moderatorId: number; action: string; note?: string | null }) => {
    const receipt = stored[input.receiptId];
    if (!receipt) return null;
    applied.push({ ...input, note: input.note ?? null });
    if (input.action === "HIDE") receipt.moderationStatus = "HIDDEN";
    if (input.action === "RESTORE") receipt.moderationStatus = "VISIBLE";
    return { receiptId: input.receiptId, moderationStatus: receipt.moderationStatus, reportsClosed: reports.length };
  },
  getInteractionCounts: async () => ({}),
  getViewerInteraction: async () => null,
  getDerivedCount: async () => 0,
  setInteraction: async () => undefined,
  clearInteraction: async () => undefined,
}));

const { appRouter } = await import("./routers");
type Ctx = Parameters<typeof appRouter.createCaller>[0];

const caller = (role: "user" | "admin" = "user", userId = 1) =>
  appRouter.createCaller({
    user: { id: userId, openId: `u${userId}`, role },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as Ctx);

const anonymous = () =>
  appRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as Ctx);

beforeEach(() => {
  reports.length = 0;
  applied.length = 0;
  reportsToday = 0;
  stored[1].moderationStatus = "VISIBLE";
  stored[4].moderationStatus = "HIDDEN";
});

describe("moderation.report", () => {
  it("records a report against a public receipt", async () => {
    const result = await caller().moderation.report({ receiptId: 1, reason: "HARASSMENT" });
    expect(result).toEqual({ received: true, alreadyReported: false });
    expect(reports).toEqual([{ receiptId: 1, reporterId: 1, reason: "HARASSMENT", detail: null }]);
  });

  it("keeps the reporter's own words when they add them", async () => {
    await caller().moderation.report({ receiptId: 1, reason: "OTHER", detail: "  names my employer  " });
    expect(reports[0].detail).toBe("names my employer");
  });

  it("treats a second report of the same receipt as the same report", async () => {
    await caller().moderation.report({ receiptId: 1, reason: "SPAM" });
    const again = await caller().moderation.report({ receiptId: 1, reason: "HATE" });
    expect(again).toEqual({ received: true, alreadyReported: true });
    // The first reason stands; a repeat tap cannot rewrite or duplicate it.
    expect(reports).toHaveLength(1);
    expect(reports[0].reason).toBe("SPAM");
  });

  it("lets a different person report the same receipt", async () => {
    await caller("user", 1).moderation.report({ receiptId: 1, reason: "SPAM" });
    await caller("user", 3).moderation.report({ receiptId: 1, reason: "SPAM" });
    expect(reports).toHaveLength(2);
  });

  it("refuses a report against your own receipt, because nothing would be deleted", async () => {
    await expect(caller().moderation.report({ receiptId: 2, reason: "SPAM" })).rejects.toThrow(/your own receipt/);
    expect(reports).toHaveLength(0);
  });

  it("refuses a report against a private receipt", async () => {
    await expect(caller().moderation.report({ receiptId: 3, reason: "SPAM" })).rejects.toThrow(/private or no longer exists/);
    expect(reports).toHaveLength(0);
  });

  it("refuses a report against a receipt that is already hidden", async () => {
    await expect(caller().moderation.report({ receiptId: 4, reason: "SPAM" })).rejects.toThrow(/private or no longer exists/);
  });

  it("refuses a report against a receipt that does not exist", async () => {
    await expect(caller().moderation.report({ receiptId: 999, reason: "SPAM" })).rejects.toThrow(/private or no longer exists/);
  });

  it("stops one person burying somebody under a pile of reports", async () => {
    reportsToday = MAX_REPORTS_PER_DAY;
    await expect(caller().moderation.report({ receiptId: 1, reason: "SPAM" })).rejects.toThrow(/reported a lot today/);
    expect(reports).toHaveLength(0);
  });

  it("rejects an unknown reason rather than storing free text", async () => {
    await expect(caller().moderation.report({ receiptId: 1, reason: "BECAUSE_I_SAID_SO" as never })).rejects.toThrow();
  });

  it("rejects a detail longer than the limit", async () => {
    await expect(caller().moderation.report({ receiptId: 1, reason: "OTHER", detail: "x".repeat(501) })).rejects.toThrow();
  });

  it("requires an account", async () => {
    await expect(anonymous().moderation.report({ receiptId: 1, reason: "SPAM" })).rejects.toThrow(/login/i);
  });
});

describe("moderation.myReport", () => {
  it("tells the viewer they already reported this one", async () => {
    expect(await caller().moderation.myReport({ receiptId: 1 })).toEqual({ reported: false, reason: null });
    await caller().moderation.report({ receiptId: 1, reason: "HATE" });
    expect(await caller().moderation.myReport({ receiptId: 1 })).toEqual({ reported: true, reason: "HATE" });
  });

  it("does not report someone else's report as yours", async () => {
    await caller("user", 3).moderation.report({ receiptId: 1, reason: "HATE" });
    expect(await caller("user", 1).moderation.myReport({ receiptId: 1 })).toEqual({ reported: false, reason: null });
  });
});

describe("only administrators moderate", () => {
  it("refuses the queue to a signed-in ordinary user", async () => {
    await expect(caller("user").moderation.queue({ status: "OPEN" })).rejects.toThrow(/permission/i);
  });

  it("refuses the queue to a signed-out visitor", async () => {
    await expect(anonymous().moderation.queue({ status: "OPEN" })).rejects.toThrow(/permission/i);
  });

  it("refuses a takedown to an ordinary user", async () => {
    await expect(caller("user").moderation.act({ receiptId: 1, action: "HIDE" })).rejects.toThrow(/permission/i);
    expect(applied).toHaveLength(0);
    expect(stored[1].moderationStatus).toBe("VISIBLE");
  });

  it("refuses the audit history to an ordinary user", async () => {
    await expect(caller("user").moderation.history({ receiptId: 1 })).rejects.toThrow(/permission/i);
  });

  it("lets an administrator read the queue", async () => {
    expect(await caller("admin").moderation.queue({ status: "OPEN" })).toEqual({ items: [], nextCursor: null });
  });
});

describe("moderation.act", () => {
  it("hides a receipt and records who did it", async () => {
    const result = await caller("admin", 9).moderation.act({ receiptId: 1, action: "HIDE", note: "targets a named person" });
    expect(result.moderationStatus).toBe("HIDDEN");
    expect(applied).toEqual([{ receiptId: 1, moderatorId: 9, action: "HIDE", note: "targets a named person" }]);
  });

  it("restores a receipt it previously hid", async () => {
    await caller("admin").moderation.act({ receiptId: 1, action: "HIDE" });
    const result = await caller("admin").moderation.act({ receiptId: 1, action: "RESTORE" });
    expect(result.moderationStatus).toBe("VISIBLE");
  });

  it("records a dismissal too, and leaves the receipt visible", async () => {
    const result = await caller("admin").moderation.act({ receiptId: 1, action: "DISMISS", note: "not a violation" });
    expect(result.moderationStatus).toBe("VISIBLE");
    expect(applied[0].action).toBe("DISMISS");
  });

  it("refuses an action against a receipt that does not exist", async () => {
    await expect(caller("admin").moderation.act({ receiptId: 999, action: "HIDE" })).rejects.toThrow(/No receipt with that id/);
  });

  it("rejects an action outside the vocabulary", async () => {
    await expect(caller("admin").moderation.act({ receiptId: 1, action: "DELETE" as never })).rejects.toThrow();
  });
});

/**
 * What a takedown actually does to the public surfaces. Every one of these
 * reads through getPublicReceipt, so hiding a receipt closes all of them at
 * once — and none of them deletes anything.
 */
describe("a hidden receipt disappears from public surfaces", () => {
  beforeEach(async () => {
    await caller("admin").moderation.act({ receiptId: 1, action: "HIDE" });
  });

  it("is no longer readable at its public link", async () => {
    await expect(anonymous().receipts.publicById({ id: 1 })).rejects.toThrow(/private or no longer exists/);
  });

  it("no longer reports interaction counts", async () => {
    await expect(anonymous().receipts.interactions({ id: 1 })).rejects.toThrow(/private or no longer exists/);
  });

  it("can no longer be responded to", async () => {
    await expect(caller().receipts.interact({ id: 1, type: "AGREE" })).rejects.toThrow(/private or no longer exists/);
  });

  it("can no longer be reported, since it is already off the public surfaces", async () => {
    await expect(caller().moderation.report({ receiptId: 1, reason: "SPAM" })).rejects.toThrow(/private or no longer exists/);
  });

  it("still exists — the row is untouched, which is what makes RESTORE real", async () => {
    expect(stored[1].prediction).toBe("Public and fine");
    await caller("admin").moderation.act({ receiptId: 1, action: "RESTORE" });
    const restored = await anonymous().receipts.publicById({ id: 1 });
    expect(restored.receipt.prediction).toBe("Public and fine");
  });
});
