/**
 * ME TOO as an act of authorship.
 *
 * Tapping ME TOO does not record anything against someone else's Receipt — it
 * sends you to write your own, which is locked independently and only
 * *remembers* what it followed. These tests pin that distinction: the new
 * Receipt goes through ordinary creation, and the lineage is the single thing
 * that makes it part of a cluster.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Array<Record<string, unknown>> = [];
const interactionsWritten: Array<unknown> = [];

/** Parents the fake database holds, keyed by how the real query would see them. */
const parents: Record<number, { id: number; userId: number; visibility: string; moderationStatus: string } | undefined> = {
  100: { id: 100, userId: 2, visibility: "PUBLIC", moderationStatus: "VISIBLE" },
  101: { id: 101, userId: 2, visibility: "PRIVATE", moderationStatus: "VISIBLE" },
  102: { id: 102, userId: 2, visibility: "PUBLIC", moderationStatus: "HIDDEN" },
};

const isVisible = (receipt?: { visibility: string; moderationStatus: string }) =>
  Boolean(receipt && receipt.visibility === "PUBLIC" && receipt.moderationStatus === "VISIBLE");

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getPublicReceipt: async (id: number) => {
    const receipt = parents[id];
    return isVisible(receipt) ? { receipt, user: { username: "nia" } } : undefined;
  },
  getReceiptById: async (id: number) => ({ id, userId: 1, status: "PENDING" }),
  getUserByUsername: async () => undefined,
  recordAchievement: async () => undefined,
  trackEvent: async () => undefined,
  setInteraction: async (...args: unknown[]) => {
    interactionsWritten.push(args);
  },
  getInteractionCounts: async () => ({}),
  getViewerInteraction: async () => null,
  getMeTooCluster: async () => ({ total: 2, open: 1, right: 1, wrong: 0, partial: 0, tooEarly: 0, resolved: 1 }),
  getDb: async () => ({
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        inserted.push(row);
        return [{ insertId: 999 }];
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  }) as never,
}));

const { appRouter } = await import("./routers");
type Ctx = Parameters<typeof appRouter.createCaller>[0];

const caller = (userId = 1) =>
  appRouter.createCaller({
    user: { id: userId, openId: `u${userId}`, role: "user", username: "caller" },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as Ctx);

const anonymous = () =>
  appRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as Ctx);

const meToo = (parentId: number, over: Record<string, unknown> = {}) =>
  caller().receipts.create({
    prediction: "I think the same thing, in my own words.",
    category: "INTERNET",
    resolutionDate: new Date(Date.now() + 7 * 86_400_000),
    confidence: 60,
    visibility: "PUBLIC",
    derivedFromId: parentId,
    ...over,
  } as never);

beforeEach(() => {
  inserted.length = 0;
  interactionsWritten.length = 0;
});

describe("ME TOO creates an independent receipt", () => {
  it("records the lineage back to the receipt it followed", async () => {
    await meToo(100);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ derivedFromId: 100, userId: 1 });
  });

  it("writes the author's own words, confidence and date — not the parent's", async () => {
    await meToo(100, { prediction: "Mine, entirely.", confidence: 12 });
    expect(inserted[0]).toMatchObject({ prediction: "Mine, entirely.", confidence: 12 });
  });

  it("is an ordinary receipt: locked, unresolved, owned by its author", async () => {
    await meToo(100);
    expect(inserted[0]).toMatchObject({ status: "PENDING", userId: 1 });
  });

  it("records no interaction against the parent — it is authorship, not a reaction", async () => {
    await meToo(100);
    expect(interactionsWritten).toHaveLength(0);
  });

  it("honours the author's own visibility choice", async () => {
    await meToo(100, { visibility: "PRIVATE" });
    expect(inserted[0]).toMatchObject({ visibility: "PRIVATE", derivedFromId: 100 });
  });

  it("goes through the same validation as any other receipt", async () => {
    // Too short, and a resolution date in the past: both rejected as usual.
    await expect(meToo(100, { prediction: "short" })).rejects.toThrow();
    await expect(meToo(100, { resolutionDate: new Date(Date.now() - 86_400_000) })).rejects.toThrow();
    expect(inserted).toHaveLength(0);
  });

  it("requires an account", async () => {
    await expect(
      anonymous().receipts.create({
        prediction: "I think the same thing, in my own words.",
        category: "INTERNET",
        resolutionDate: new Date(Date.now() + 86_400_000),
        confidence: 50,
        visibility: "PUBLIC",
        derivedFromId: 100,
      } as never),
    ).rejects.toThrow(/login/i);
    expect(inserted).toHaveLength(0);
  });
});

describe("lineage cannot point at something the author may not see", () => {
  it("drops the lineage when the parent is private", async () => {
    // The receipt is still created — it is the author's own call — but it
    // joins no cluster, so a private parent cannot be probed for through it.
    await meToo(101);
    expect(inserted[0].derivedFromId).toBeUndefined();
  });

  it("drops the lineage when the parent has been taken down", async () => {
    await meToo(102);
    expect(inserted[0].derivedFromId).toBeUndefined();
  });

  it("drops the lineage when the parent does not exist", async () => {
    await meToo(999);
    expect(inserted[0].derivedFromId).toBeUndefined();
  });

  it("still writes the receipt itself in every one of those cases", async () => {
    await meToo(101);
    await meToo(102);
    await meToo(999);
    expect(inserted).toHaveLength(3);
    for (const row of inserted) expect(row).toMatchObject({ userId: 1, prediction: expect.any(String) });
  });
});

describe("the cluster on the parent", () => {
  it("is returned alongside the interaction counts", async () => {
    const result = await anonymous().receipts.interactions({ id: 100 });
    expect(result.cluster).toMatchObject({ total: 2, right: 1, open: 1, resolved: 1 });
  });

  it("reports the same number as derivedCount, so both cannot drift", async () => {
    const result = await anonymous().receipts.interactions({ id: 100 });
    expect(result.derivedCount).toBe(result.cluster.total);
  });

  it("is not exposed for a private or taken-down receipt at all", async () => {
    await expect(anonymous().receipts.interactions({ id: 101 })).rejects.toThrow(/private or no longer exists/);
    await expect(anonymous().receipts.interactions({ id: 102 })).rejects.toThrow(/private or no longer exists/);
  });

  it("is readable by a signed-out visitor, because it is a public fact", async () => {
    const result = await anonymous().receipts.interactions({ id: 100 });
    expect(result.cluster.total).toBe(2);
    expect(result.mine).toBeNull();
  });
});
