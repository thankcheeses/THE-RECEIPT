import { beforeEach, describe, expect, it, vi } from "vitest";

// A public receipt of each kind, plus one private receipt.
const receiptsById: Record<number, { receipt: Record<string, unknown>; user: unknown } | undefined> = {
  1: { receipt: { id: 1, semanticType: "PREDICTION", visibility: "PUBLIC" }, user: { username: "nia" } },
  2: { receipt: { id: 2, semanticType: "GOAL", visibility: "PUBLIC" }, user: { username: "nia" } },
  3: { receipt: { id: 3, semanticType: "PERSONAL", visibility: "PUBLIC" }, user: { username: "nia" } },
  4: { receipt: { id: 4, semanticType: "FUN", visibility: "PUBLIC" }, user: { username: "nia" } },
  // No stored type: a receipt written before semantic types existed.
  5: { receipt: { id: 5, semanticType: null, visibility: "PUBLIC" }, user: { username: "nia" } },
  9: undefined, // private or missing
};

const written: Array<{ receiptId: number; userId: number; type: string }> = [];
const cleared: Array<{ receiptId: number; userId: number }> = [];

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getPublicReceipt: async (id: number) => receiptsById[id],
  setInteraction: async (receiptId: number, userId: number, type: string) => {
    written.push({ receiptId, userId, type });
  },
  clearInteraction: async (receiptId: number, userId: number) => {
    cleared.push({ receiptId, userId });
  },
  getInteractionCounts: async () => ({}),
  getViewerInteraction: async () => null,
  getMeTooCluster: async () => ({ total: 3, open: 3, right: 0, wrong: 0, partial: 0, tooEarly: 0, resolved: 0 }),
}));

const { appRouter } = await import("./routers");
type Ctx = Parameters<typeof appRouter.createCaller>[0];

const caller = (userId = 1) =>
  appRouter.createCaller({
    user: { id: userId, openId: `u${userId}`, role: "user" },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as Ctx);

beforeEach(() => {
  written.length = 0;
  cleared.length = 0;
});

describe("receipts.interact enforces the policy server-side", () => {
  it("accepts AGREE and DISAGREE on a prediction", async () => {
    await caller().receipts.interact({ id: 1, type: "AGREE" });
    await caller().receipts.interact({ id: 1, type: "DISAGREE" });
    expect(written.map((w) => w.type)).toEqual(["AGREE", "DISAGREE"]);
  });

  it("refuses DISAGREE on a goal even though the client never offers it", async () => {
    await expect(caller().receipts.interact({ id: 2, type: "DISAGREE" })).rejects.toThrow(/does not take that response/);
    expect(written).toHaveLength(0);
  });

  it("refuses AGREE on a goal", async () => {
    await expect(caller().receipts.interact({ id: 2, type: "AGREE" })).rejects.toThrow(/does not take that response/);
    expect(written).toHaveLength(0);
  });

  it("refuses DISAGREE on a personal receipt", async () => {
    await expect(caller().receipts.interact({ id: 3, type: "DISAGREE" })).rejects.toThrow(/does not take that response/);
    expect(written).toHaveLength(0);
  });

  it("accepts SUPPORT on goal and personal receipts", async () => {
    await caller().receipts.interact({ id: 2, type: "SUPPORT" });
    await caller().receipts.interact({ id: 3, type: "SUPPORT" });
    expect(written).toHaveLength(2);
  });

  it("refuses SUPPORT on a contestable prediction, keeping the two meanings apart", async () => {
    await expect(caller().receipts.interact({ id: 1, type: "SUPPORT" })).rejects.toThrow(/does not take that response/);
  });

  it("takes agree and disagree on a fun receipt, and no reaction", async () => {
    // A silly claim is still a claim. The unnamed REACT that FUN used to
    // offer was a like with a different name, so it is retired: the server
    // refuses it, and the type answers like a prediction instead.
    await caller().receipts.interact({ id: 4, type: "AGREE" });
    await expect(caller().receipts.interact({ id: 4, type: "REACT" })).rejects.toThrow(/does not take that response/);
    expect(written.map((w) => w.type)).toEqual(["AGREE"]);
  });

  it("treats a receipt with no stored type as a prediction", async () => {
    await caller().receipts.interact({ id: 5, type: "AGREE" });
    expect(written).toHaveLength(1);
    await expect(caller().receipts.interact({ id: 5, type: "SUPPORT" })).rejects.toThrow();
  });

  it("withdraws a response when null is sent", async () => {
    const result = await caller().receipts.interact({ id: 1, type: null });
    expect(cleared).toEqual([{ receiptId: 1, userId: 1 }]);
    expect(result.mine).toBeNull();
  });

  it("refuses to record anything against a private or missing receipt", async () => {
    await expect(caller().receipts.interact({ id: 9, type: "AGREE" })).rejects.toThrow(/private or no longer exists/);
    expect(written).toHaveLength(0);
  });
});

describe("receipts.interactions", () => {
  it("reports ME TOO lineage as authored receipts, not as a reaction count", async () => {
    const result = await caller().receipts.interactions({ id: 1 });
    expect(result.derivedCount).toBe(3);
    expect(result.counts).not.toHaveProperty("ME_TOO");
  });

  it("refuses to describe a private receipt", async () => {
    await expect(caller().receipts.interactions({ id: 9 })).rejects.toThrow(/private or no longer exists/);
  });
});
