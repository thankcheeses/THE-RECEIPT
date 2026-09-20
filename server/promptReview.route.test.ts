/**
 * The daily prompt approval gate, at the route.
 *
 * A daily prompt reaches everybody on the same day. Before PR #12 the first
 * read of `daily.get` published whatever the rotation produced, which meant a
 * prompt went live without anyone having looked at it. The gate closed that.
 *
 * These tests exist to keep it closed. Every one of them is about a way the
 * gate could be walked around: by an ordinary user, by a signed-out visitor,
 * by reading the prompt into existence, by approving something already live,
 * or by approving something the screen refuses outright.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: number;
  prompt: string;
  category: string;
  status: string;
  publishDate: Date;
  resolutionDate: Date;
  approvedBy: number | null;
  approvedAt: Date | null;
  reviewNote: string | null;
};

const today = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

/** Rows the fake database holds. Reset per test. */
let rows: Row[] = [];
const inserted: Array<Record<string, unknown>> = [];
const updated: Array<Record<string, unknown>> = [];

const makeRow = (over: Partial<Row> = {}): Row => ({
  id: 1,
  prompt: "Will a streaming service announce a reboot this week?",
  category: "ENTERTAINMENT",
  status: "DRAFT",
  publishDate: today(),
  resolutionDate: new Date(Date.now() + 7 * 86_400_000),
  approvedBy: null,
  approvedAt: null,
  reviewNote: null,
  ...over,
});

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  // Mirrors the real query: today's row, whatever its status. The status gate
  // lives in the router, which is the thing under test.
  getDailyChallengeForDate: async () => rows.find((row) => row.publishDate.getTime() === today().getTime()),
  getUserById: async (id: number) => ({ id, currentStreak: 0, longestStreak: 0 }),
  getDailyActivityWindow: async () => [],
  getReceiptById: async () => undefined,
  recordAchievement: async () => undefined,
  recordDailyActivity: async () => ({ currentStreak: 1 }),
  trackEvent: async () => undefined,
  getDb: async () => ({
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        inserted.push(row);
        rows.push(makeRow({ ...(row as Partial<Row>), id: rows.length + 1 }));
        return [{ insertId: rows.length }];
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updated.push(values);
          // Apply it, so a follow-up read sees what an approval actually did.
          for (const row of rows) Object.assign(row, values);
        },
      }),
    }),
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const method of ["from", "leftJoin", "where", "orderBy", "groupBy"]) chain[method] = () => chain;
      chain.limit = async () => rows;
      chain.then = (ok: (value: unknown) => unknown) => Promise.resolve(rows).then(ok);
      return chain;
    },
  }) as never,
}));

const { appRouter } = await import("./routers");
type Ctx = Parameters<typeof appRouter.createCaller>[0];

const caller = (role: "user" | "admin" = "user", userId = 1) =>
  appRouter.createCaller({
    user: { id: userId, openId: `u${userId}`, role, username: "caller" },
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
  rows = [];
  inserted.length = 0;
  updated.length = 0;
});

describe("an unapproved prompt does not publish", () => {
  it("is not served while it is a draft", async () => {
    rows = [makeRow({ status: "DRAFT" })];
    expect(await anonymous().daily.get()).toBeNull();
  });

  it("is not served when it was turned down", async () => {
    rows = [makeRow({ status: "REJECTED", reviewNote: "names a private person" })];
    expect(await anonymous().daily.get()).toBeNull();
  });

  it("is not served once it has closed", async () => {
    rows = [makeRow({ status: "CLOSED" })];
    expect(await anonymous().daily.get()).toBeNull();
  });

  it("cannot be answered into existence", async () => {
    // The old behaviour published on first read. Answering must not be a way
    // back to that: no prompt approved means no prompt, and the route says so
    // rather than creating one.
    rows = [makeRow({ status: "DRAFT" })];
    await expect(caller().daily.answer({ answer: "YES", confidence: 50 })).rejects.toThrow(/no prompt today/i);
    expect(inserted).toHaveLength(0);
  });

  it("is not created by simply reading the day", async () => {
    rows = [];
    expect(await anonymous().daily.get()).toBeNull();
    expect(await anonymous().daily.get()).toBeNull();
    expect(inserted).toHaveLength(0);
  });

  it("leaves the streak page working, with nothing to answer", async () => {
    rows = [makeRow({ status: "DRAFT" })];
    const status = await caller().daily.status();
    expect(status.answered).toBeNull();
    expect(inserted).toHaveLength(0);
  });
});

describe("an approved prompt publishes", () => {
  it("is served once its status is OPEN", async () => {
    rows = [makeRow({ status: "OPEN", approvedBy: 9, approvedAt: new Date() })];
    const daily = await anonymous().daily.get();
    expect(daily).toMatchObject({ status: "OPEN" });
  });

  it("can be answered", async () => {
    rows = [makeRow({ status: "OPEN", approvedBy: 9, approvedAt: new Date() })];
    await expect(caller().daily.answer({ answer: "YES", confidence: 60 })).resolves.toBeDefined();
  });
});

describe("who may approve", () => {
  it("refuses the queue to a signed-out visitor", async () => {
    await expect(anonymous().promptReview.queue()).rejects.toThrow(/permission/i);
  });

  it("refuses the queue to an ordinary signed-in user", async () => {
    await expect(caller("user").promptReview.queue()).rejects.toThrow(/permission/i);
  });

  it("refuses scheduling to an ordinary user", async () => {
    await expect(
      caller("user").promptReview.schedule({
        prompt: "Will a streaming service announce a reboot this week?",
        category: "ENTERTAINMENT",
        resolutionDays: 7,
        publishDate: today(),
      }),
    ).rejects.toThrow(/permission/i);
    expect(inserted).toHaveLength(0);
  });

  it("refuses approval to an ordinary user", async () => {
    rows = [makeRow({ status: "DRAFT" })];
    await expect(caller("user").promptReview.approve({ id: 1 })).rejects.toThrow(/permission/i);
    expect(updated).toHaveLength(0);
  });

  it("refuses rejection to an ordinary user", async () => {
    rows = [makeRow({ status: "DRAFT" })];
    await expect(caller("user").promptReview.reject({ id: 1, note: "no" })).rejects.toThrow(/permission/i);
    expect(updated).toHaveLength(0);
  });
});

describe("what an approval records", () => {
  it("names the person who approved it", async () => {
    rows = [makeRow({ status: "DRAFT" })];
    await caller("admin", 42).promptReview.approve({ id: 1 });
    expect(updated[0]).toMatchObject({ status: "OPEN", approvedBy: 42 });
    expect(updated[0].approvedAt).toBeInstanceOf(Date);
  });

  it("keeps the reviewer's note alongside it", async () => {
    rows = [makeRow({ status: "DRAFT" })];
    await caller("admin", 42).promptReview.approve({ id: 1, note: "checked against the standard" });
    expect(updated[0]).toMatchObject({ reviewNote: "checked against the standard" });
  });

  it("records who turned one down, and why", async () => {
    rows = [makeRow({ status: "DRAFT" })];
    await caller("admin", 42).promptReview.reject({ id: 1, note: "two events in one question" });
    expect(updated[0]).toMatchObject({ status: "REJECTED", approvedBy: 42, reviewNote: "two events in one question" });
  });

  it("will not let a rejection be filed without a reason", async () => {
    rows = [makeRow({ status: "DRAFT" })];
    await expect(caller("admin").promptReview.reject({ id: 1, note: "" })).rejects.toThrow();
    expect(updated).toHaveLength(0);
  });
});

describe("what cannot be approved", () => {
  it("a prompt that is already live", async () => {
    // Re-approving would rewrite approvedBy and quietly reassign who signed
    // off on something people have already been answering.
    rows = [makeRow({ status: "OPEN", approvedBy: 9, approvedAt: new Date() })];
    await expect(caller("admin").promptReview.approve({ id: 1 })).rejects.toThrow(/only a draft/i);
    expect(updated).toHaveLength(0);
  });

  it("a prompt that does not exist", async () => {
    rows = [];
    await expect(caller("admin").promptReview.approve({ id: 99 })).rejects.toThrow(/no prompt with that id/i);
  });

  it("a prompt on a subject the screen refuses", async () => {
    // Re-screened at the moment of approval, not trusted from when it was
    // scheduled, because the text could have changed in between.
    rows = [makeRow({ status: "DRAFT", prompt: "Will a famous person die this week?" })];
    await expect(caller("admin").promptReview.approve({ id: 1 })).rejects.toThrow(/off-limits/i);
    expect(updated).toHaveLength(0);
  });

  it("a blocked subject cannot even be scheduled", async () => {
    await expect(
      caller("admin").promptReview.schedule({
        prompt: "Is he lying about where he was on Saturday?",
        category: "LIFE",
        resolutionDays: 7,
        publishDate: today(),
      }),
    ).rejects.toThrow(/off-limits/i);
    expect(inserted).toHaveLength(0);
  });
});

describe("scheduling is not approving", () => {
  it("creates a draft, never a live prompt", async () => {
    await caller("admin").promptReview.schedule({
      prompt: "Will a streaming service announce a reboot this week?",
      category: "ENTERTAINMENT",
      resolutionDays: 7,
      publishDate: today(),
    });
    expect(inserted[0]).toMatchObject({ status: "DRAFT" });
    expect(inserted[0]).not.toMatchObject({ status: "OPEN" });
  });

  it("records nobody as its approver", async () => {
    await caller("admin", 42).promptReview.schedule({
      prompt: "Will a streaming service announce a reboot this week?",
      category: "ENTERTAINMENT",
      resolutionDays: 7,
      publishDate: today(),
    });
    expect(inserted[0].approvedBy).toBeUndefined();
    expect(inserted[0].approvedAt).toBeUndefined();
  });

  it("does not publish what it scheduled", async () => {
    await caller("admin").promptReview.schedule({
      prompt: "Will a streaming service announce a reboot this week?",
      category: "ENTERTAINMENT",
      resolutionDays: 7,
      publishDate: today(),
    });
    expect(await anonymous().daily.get()).toBeNull();
  });
});
