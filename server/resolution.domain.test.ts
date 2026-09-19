import { describe, expect, it, vi, beforeEach } from "vitest";
import { canResolveAt } from "./db";

describe("canResolveAt", () => {
  const due = new Date("2026-06-01T12:00:00.000Z");

  it("rejects resolution before the declared date", () => {
    expect(canResolveAt(due, new Date("2026-05-31T12:00:00.000Z"))).toBe(false);
    expect(canResolveAt(due, new Date("2026-06-01T11:59:59.999Z"))).toBe(false);
  });

  it("allows resolution exactly at the declared date", () => {
    expect(canResolveAt(due, new Date("2026-06-01T12:00:00.000Z"))).toBe(true);
  });

  it("allows resolution after the declared date", () => {
    expect(canResolveAt(due, new Date("2026-06-01T12:00:00.001Z"))).toBe(true);
    expect(canResolveAt(due, new Date("2027-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("accepts a serialized date, as rows carry it across the wire", () => {
    expect(canResolveAt("2026-06-01T12:00:00.000Z", new Date("2026-06-02T00:00:00.000Z"))).toBe(true);
    expect(canResolveAt("2026-06-01T12:00:00.000Z", new Date("2026-05-01T00:00:00.000Z"))).toBe(false);
  });
});

// The procedure itself is exercised against a stubbed data layer so the date
// boundary and the ownership checks are covered end to end, not just the helper.
const OWNER_ID = 1;
const receiptRow = {
  id: 42,
  userId: OWNER_ID,
  prediction: "This ships before the quarter ends.",
  category: "TECH",
  confidence: 80,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  resolutionDate: new Date("2026-06-01T12:00:00.000Z"),
  status: "PENDING" as const,
  result: null,
  visibility: "PUBLIC" as const,
  challengeUserId: null,
  dailyChallengeId: null,
  resolvedAt: null,
};

const updates: Array<Record<string, unknown>> = [];

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  const chain = {
    set(values: Record<string, unknown>) {
      updates.push(values);
      return { where: async () => undefined };
    },
  };
  return {
    ...actual,
    getDb: async () => ({ update: () => chain }),
    getReceiptById: async (id: number) => (id === receiptRow.id ? { ...receiptRow } : undefined),
    getProfileStats: async () => ({
      total: 1, resolved: 1, accuracy: 100, right: 1, pending: 0,
      biggestMiss: null, biggestCall: null, byCategory: [],
    }),
    recordAchievement: async () => undefined,
    trackEvent: async () => undefined,
  };
});

const { appRouter } = await import("./routers");
type Ctx = Parameters<typeof appRouter.createCaller>[0];

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `user-${userId}`, role: "user" },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as Ctx);

describe("receipts.resolve date guardrail", () => {
  beforeEach(() => {
    updates.length = 0;
    vi.useRealTimers();
  });

  it("rejects the owner resolving before the resolution date", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-05-20T00:00:00.000Z"));
    await expect(callerFor(OWNER_ID).receipts.resolve({ id: 42, result: "RIGHT" })).rejects.toThrow(
      /resolves on .*\. Come back then\./,
    );
    expect(updates).toHaveLength(0);
  });

  it("accepts the owner resolving exactly at the resolution date", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    await callerFor(OWNER_ID).receipts.resolve({ id: 42, result: "RIGHT" });
    expect(updates[0]).toMatchObject({ status: "RIGHT" });
  });

  it("accepts the owner resolving after the resolution date", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-04T00:00:00.000Z"));
    await callerFor(OWNER_ID).receipts.resolve({ id: 42, result: "WRONG", note: "Missed it." });
    expect(updates[0]).toMatchObject({ status: "WRONG", result: "Missed it." });
  });

  it("preserves every resolution state once the receipt is due", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-04T00:00:00.000Z"));
    for (const result of ["RIGHT", "WRONG", "PARTIALLY RIGHT", "TOO EARLY"] as const) {
      updates.length = 0;
      await callerFor(OWNER_ID).receipts.resolve({ id: 42, result });
      expect(updates[0]).toMatchObject({ status: result });
    }
  });

  it("rejects a non-owner even after the resolution date", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-04T00:00:00.000Z"));
    await expect(callerFor(999).receipts.resolve({ id: 42, result: "RIGHT" })).rejects.toThrow(
      "You can only resolve your own receipts.",
    );
    expect(updates).toHaveLength(0);
  });

  it("rejects a missing receipt", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-04T00:00:00.000Z"));
    await expect(callerFor(OWNER_ID).receipts.resolve({ id: 7, result: "RIGHT" })).rejects.toThrow(
      "You can only resolve your own receipts.",
    );
  });

  it("stamps resolvedAt when the receipt is resolved", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-04T00:00:00.000Z"));
    await callerFor(OWNER_ID).receipts.resolve({ id: 42, result: "RIGHT" });
    expect(updates[0]?.resolvedAt).toBeInstanceOf(Date);
  });
});
