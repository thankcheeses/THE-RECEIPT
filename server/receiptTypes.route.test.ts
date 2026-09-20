/**
 * What MEMORY and DREAM are, enforced at the route.
 *
 * Both types exist because the product needed something the resolution model
 * cannot describe: a memory is not right or wrong, and neither is a dream. The
 * interesting assertions here are all negative — what these types refuse — and
 * they are made against the router rather than the UI, because a rule that
 * only the buttons know is not a rule.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Array<Record<string, unknown>> = [];
const updated: Array<Record<string, unknown>> = [];
const tracked: Array<{ event: string; properties?: Record<string, unknown> }> = [];

/** Receipts the fake database holds, keyed by id. */
const stored: Record<number, Record<string, unknown>> = {
  1: { id: 1, userId: 1, semanticType: "PREDICTION", status: "PENDING", resolutionDate: new Date(Date.now() - 86_400_000), visibility: "PUBLIC", moderationStatus: "VISIBLE", prediction: "A claim" },
  2: { id: 2, userId: 1, semanticType: "MEMORY", status: "PENDING", resolutionDate: null, visibility: "PUBLIC", moderationStatus: "VISIBLE", prediction: "Something happened" },
  3: { id: 3, userId: 1, semanticType: "DREAM", status: "PENDING", resolutionDate: null, visibility: "PRIVATE", moderationStatus: "VISIBLE", prediction: "I was in a house", title: "I was in a house" },
  4: { id: 4, userId: 2, semanticType: "DREAM", status: "PENDING", resolutionDate: null, visibility: "PRIVATE", moderationStatus: "VISIBLE", prediction: "Someone else's dream" },
};

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  // Mirrors the real rule: public, visible, and never a dream.
  getPublicReceipt: async (id: number) => {
    const receipt = stored[id];
    const ok = receipt && receipt.visibility === "PUBLIC" && receipt.moderationStatus === "VISIBLE" && receipt.semanticType !== "DREAM";
    return ok ? { receipt, user: { username: "nia" } } : undefined;
  },
  getReceiptById: async (id: number) => stored[id],
  getUserByUsername: async () => undefined,
  recordAchievement: async () => undefined,
  getProfileStats: async () => ({ accuracy: 0 }),
  getInteractionCounts: async () => ({}),
  getViewerInteraction: async () => null,
  getMeTooCluster: async () => ({ total: 0, open: 0, right: 0, wrong: 0, partial: 0, tooEarly: 0, resolved: 0 }),
  setInteraction: async () => undefined,
  clearInteraction: async () => undefined,
  trackEvent: async (event: string, _userId: number | null, properties?: Record<string, unknown>) => {
    tracked.push({ event, properties });
  },
  getDb: async () => ({
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        inserted.push(row);
        stored[999] = { ...row, id: 999 };
        return [{ insertId: 999 }];
      },
    }),
    update: () => ({ set: (row: Record<string, unknown>) => ({ where: async () => { updated.push(row); } }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
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

beforeEach(() => {
  inserted.length = 0;
  updated.length = 0;
  tracked.length = 0;
});

describe("a memory is written like any other receipt, and resolves like none of them", () => {
  it("is created without a resolution date", async () => {
    await caller().receipts.create({
      prediction: "Today my daughter asked me what I was like at her age.",
      category: "LIFE",
      confidence: 50,
      visibility: "PUBLIC",
      semanticType: "MEMORY",
    } as never);
    expect(inserted[0]).toMatchObject({ semanticType: "MEMORY", resolutionDate: null });
  });

  it("does not demand one either", async () => {
    // The compose form stops asking, and the server stops requiring. A memory
    // that had to name the day it "comes true" would be a prediction.
    await expect(
      caller().receipts.create({
        prediction: "Something happened today that I want to keep.",
        category: "LIFE",
        confidence: 50,
        visibility: "PUBLIC",
        semanticType: "MEMORY",
      } as never),
    ).resolves.toBeDefined();
  });

  it("refuses to be resolved right or wrong", async () => {
    await expect(caller().receipts.resolve({ id: 2, result: "RIGHT" })).rejects.toThrow(/isn't right or wrong/);
    expect(updated).toHaveLength(0);
  });

  it("refuses every other verdict too, not just RIGHT", async () => {
    for (const result of ["WRONG", "PARTIALLY RIGHT", "TOO EARLY"] as const) {
      await expect(caller().receipts.resolve({ id: 2, result })).rejects.toThrow(/isn't right or wrong/);
    }
    expect(updated).toHaveLength(0);
  });

  it("still lets an ordinary prediction resolve, so the guard is not too wide", async () => {
    await expect(caller().receipts.resolve({ id: 1, result: "RIGHT" })).resolves.toBeDefined();
    expect(updated[0]).toMatchObject({ status: "RIGHT" });
  });

  it("takes no interactions, because there is nothing to agree with", async () => {
    for (const type of ["AGREE", "DISAGREE", "SUPPORT", "REACT"] as const) {
      await expect(caller().receipts.interact({ id: 2, type })).rejects.toThrow(/does not take that response/);
    }
  });

  it("can still be a public receipt somebody writes their own after", async () => {
    // ME TOO is authorship, not a response, so it survives on a type that
    // takes no interactions at all.
    await caller(2).receipts.create({
      prediction: "Mine: my father asked me the same thing.",
      category: "LIFE",
      confidence: 40,
      visibility: "PUBLIC",
      semanticType: "MEMORY",
      derivedFromId: 2,
    } as never);
    expect(inserted[0]).toMatchObject({ derivedFromId: 2, semanticType: "MEMORY" });
  });
});

describe("a dream is private, and cannot be made otherwise", () => {
  it("is stored private even when the request says public", async () => {
    // There is no visibility field on the capture route at all; this asserts
    // the stored row rather than trusting that.
    await caller().dreams.capture({ transcript: "I was in a house I did not recognise." });
    expect(inserted[0]).toMatchObject({ visibility: "PRIVATE", semanticType: "DREAM" });
  });

  it("cannot be smuggled to public through the ordinary create route", async () => {
    // DREAM is not in the composable vocabulary, so Zod rejects it outright.
    await expect(
      caller().receipts.create({
        prediction: "I was in a house I did not recognise.",
        category: "LIFE",
        confidence: 50,
        visibility: "PUBLIC",
        semanticType: "DREAM",
      } as never),
    ).rejects.toThrow();
    expect(inserted).toHaveLength(0);
  });

  it("carries no resolution date and no confidence to speak of", async () => {
    await caller().dreams.capture({ transcript: "The floor gave way and then I was outside." });
    expect(inserted[0]).toMatchObject({ resolutionDate: null, confidence: 0 });
  });

  it("is titled from its own first words", async () => {
    await caller().dreams.capture({ transcript: "i was driving my mum's car then it turned into a boat" });
    expect(inserted[0].title).toBe("I was driving my mum's car");
  });

  it("accepts a title the dreamer chose instead", async () => {
    await caller().dreams.capture({ transcript: "Something long and rambling about a house.", title: "The house again" });
    expect(inserted[0].title).toBe("The house again");
  });

  it("is not readable at a public link, by anyone", async () => {
    await expect(anonymous().receipts.publicById({ id: 3 })).rejects.toThrow(/private or no longer exists/);
    await expect(caller().receipts.publicById({ id: 3 })).rejects.toThrow(/private or no longer exists/);
  });

  it("reports no interaction counts, so its existence cannot be probed", async () => {
    await expect(anonymous().receipts.interactions({ id: 3 })).rejects.toThrow(/private or no longer exists/);
  });

  it("takes no interaction of any kind", async () => {
    for (const type of ["AGREE", "DISAGREE", "SUPPORT", "REACT"] as const) {
      await expect(caller(2).receipts.interact({ id: 3, type })).rejects.toThrow();
    }
  });

  it("cannot be reported, because it was never on a public surface", async () => {
    await expect(caller(2).moderation.report({ receiptId: 3, reason: "SPAM" })).rejects.toThrow(/private or no longer exists/);
  });

  it("cannot become the parent of somebody else's receipt", async () => {
    // Lineage is only recorded for a parent the author could actually see, so
    // a dream cannot be linked to and cannot be discovered through a cluster.
    await caller(2).receipts.create({
      prediction: "I think that will happen to me as well.",
      category: "LIFE",
      confidence: 50,
      resolutionDate: new Date(Date.now() + 7 * 86_400_000),
      visibility: "PUBLIC",
      derivedFromId: 3,
    } as never);
    expect(inserted[0].derivedFromId).toBeUndefined();
  });

  it("refuses to be resolved", async () => {
    await expect(caller().receipts.resolve({ id: 3, result: "RIGHT" })).rejects.toThrow(/isn't right or wrong/);
  });

  it("requires an account, since private needs somebody to be private from", async () => {
    await expect(anonymous().dreams.capture({ transcript: "I was somewhere else." })).rejects.toThrow(/login/i);
  });

  it("rejects an empty capture rather than storing a blank record", async () => {
    await expect(caller().dreams.capture({ transcript: "  " })).rejects.toThrow();
    expect(inserted).toHaveLength(0);
  });
});

describe("what a dream tells analytics", () => {
  it("records that one happened and how long it was — never a word of it", async () => {
    const transcript = "my grandmother was alive and we were arguing about the garden";
    await caller().dreams.capture({ transcript });
    const event = tracked.find((item) => item.event === "dream_captured");
    expect(event?.properties).toMatchObject({ length: transcript.length });
    // The transcript is the most private thing in the app. Nothing derived
    // from its content — not a summary, not a keyword, not the title — goes
    // anywhere near the events table.
    expect(JSON.stringify(event?.properties)).not.toContain("grandmother");
    expect(JSON.stringify(event?.properties)).not.toContain("garden");
    expect(event?.properties).not.toHaveProperty("transcript");
    expect(event?.properties).not.toHaveProperty("title");
  });
});

describe("renaming a dream", () => {
  it("changes the label", async () => {
    await caller().dreams.rename({ id: 3, title: "The house, again" });
    expect(updated[0]).toEqual({ title: "The house, again" });
  });

  it("never touches the transcript itself", async () => {
    // Receipts are not editable. The title is a label on the record; the
    // record is locked like every other one.
    await caller().dreams.rename({ id: 3, title: "Something else" });
    expect(updated[0]).not.toHaveProperty("prediction");
    expect(Object.keys(updated[0])).toEqual(["title"]);
  });

  it("refuses somebody else's dream", async () => {
    await expect(caller(1).dreams.rename({ id: 4, title: "Mine now" })).rejects.toThrow(/your own dreams/);
    expect(updated).toHaveLength(0);
  });

  it("refuses a receipt that is not a dream", async () => {
    await expect(caller().dreams.rename({ id: 1, title: "Renamed" })).rejects.toThrow(/Only a dream/);
  });
});
