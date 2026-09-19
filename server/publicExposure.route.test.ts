/**
 * What a signed-out caller is allowed to receive.
 *
 * `toPublicUser` is meant to be the single point where a `users` row is
 * reduced to what anyone may see. That is only true if every public procedure
 * actually goes through it — and two of them did not: `receipts.publicById`
 * and `receipts.recentPublic` returned the joined row untouched, handing any
 * anonymous visitor the author's openId, email, login method and role.
 *
 * These tests assert the property rather than the plumbing, so the same
 * mistake on a future procedure fails here.
 */
import { describe, expect, it, vi } from "vitest";

/** Fields that identify a person or describe their account internals. */
const FORBIDDEN = ["openId", "email", "loginMethod", "role", "lastSignedIn", "updatedAt", "lastDailyDate", "lastActiveDate"];

const authorRow = {
  id: 7,
  openId: "manus-secret-abc",
  name: "Nia",
  email: "nia@example.com",
  loginMethod: "manus",
  role: "admin" as const,
  username: "nia",
  avatar: null,
  currentStreak: 3,
  longestStreak: 9,
  accuracy: 61,
  lastDailyDate: new Date(),
  lastActiveDate: new Date(),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const receiptRow = {
  id: 1,
  userId: 7,
  prediction: "A public call",
  category: "INTERNET",
  confidence: 70,
  visibility: "PUBLIC",
  moderationStatus: "VISIBLE",
  status: "PENDING",
  resolutionDate: new Date("2027-01-01"),
};

/**
 * A stand-in driver, so the real query functions run against rows we choose.
 *
 * getDb() builds its client by calling drizzle(), and caches it — so the
 * driver is what has to be stubbed. Spying on the db module would not work:
 * the functions call their own local getDb, not the module object.
 */
const driver = vi.hoisted(() => {
  const rows: { current: unknown[] } = { current: [] };
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "leftJoin", "where", "orderBy"]) chain[method] = () => chain;
  chain.limit = async () => rows.current;
  return { rows, client: { select: () => chain } };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => driver.client }));

process.env.DATABASE_URL = "mysql://stub@127.0.0.1:3306/stub";

const db = await import("./db");
const { appRouter } = await import("./routers");

const anonymous = () =>
  appRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as Parameters<typeof appRouter.createCaller>[0]);

/** Every value the payload contains, however deeply nested. */
const keysDeep = (value: unknown, found: string[] = []): string[] => {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, found);
  } else if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, nested] of Object.entries(value)) {
      found.push(key);
      keysDeep(nested, found);
    }
  }
  return found;
};

describe("toPublicUser is the whole redaction", () => {
  it("keeps what a public profile needs", () => {
    expect(db.toPublicUser(authorRow)).toMatchObject({ id: 7, username: "nia", accuracy: 61 });
  });

  it("drops every identifying and internal field", () => {
    const shown = db.toPublicUser(authorRow) as Record<string, unknown>;
    for (const field of FORBIDDEN) expect(shown).not.toHaveProperty(field);
  });
});

describe("receipts.publicById", () => {
  it("does not hand an anonymous caller the author's account row", async () => {
    vi.spyOn(db, "getPublicReceipt").mockResolvedValue({
      receipt: receiptRow as never,
      user: db.toPublicUser(authorRow),
    });
    const result = await anonymous().receipts.publicById({ id: 1 });
    const keys = keysDeep(result);
    for (const field of FORBIDDEN) expect(keys).not.toContain(field);
    expect(result.user).toMatchObject({ username: "nia" });
    vi.restoreAllMocks();
  });
});

describe("receipts.recentPublic", () => {
  it("does not hand an anonymous caller the authors' account rows", async () => {
    vi.spyOn(db, "getRecentPublicReceipts").mockResolvedValue([
      { receipt: receiptRow as never, user: db.toPublicUser(authorRow) },
    ]);
    const keys = keysDeep(await anonymous().receipts.recentPublic());
    for (const field of FORBIDDEN) expect(keys).not.toContain(field);
    vi.restoreAllMocks();
  });
});

/**
 * The tests above prove the routers add nothing. These prove the queries
 * themselves redact — the actual fix — by running the real functions against
 * raw `users` rows from the stubbed driver.
 */
describe("the redaction happens in the query, not the caller", () => {
  it("getPublicReceipt strips the account row before anything can return it", async () => {
    driver.rows.current = [{ receipt: receiptRow, user: authorRow }];
    const result = await db.getPublicReceipt(1);
    expect(result?.user).toMatchObject({ username: "nia", accuracy: 61 });
    for (const field of FORBIDDEN) expect(result?.user).not.toHaveProperty(field);
    // The receipt itself is untouched — only the joined person is reduced.
    expect(result?.receipt).toMatchObject({ id: 1, prediction: "A public call" });
  });

  it("getRecentPublicReceipts strips every account row it joined", async () => {
    driver.rows.current = [
      { receipt: receiptRow, user: authorRow },
      { receipt: { ...receiptRow, id: 2 }, user: authorRow },
    ];
    const rows = await db.getRecentPublicReceipts();
    expect(rows).toHaveLength(2);
    for (const field of FORBIDDEN) expect(keysDeep(rows)).not.toContain(field);
  });

  it("survives a receipt whose author row did not join", async () => {
    driver.rows.current = [{ receipt: receiptRow, user: null }];
    expect((await db.getPublicReceipt(1))?.user).toBeNull();
  });

  it("returns nothing for a receipt the visibility rule excluded", async () => {
    driver.rows.current = [];
    expect(await db.getPublicReceipt(1)).toBeUndefined();
    expect(await db.getRecentPublicReceipts()).toEqual([]);
  });
});
