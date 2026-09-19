/**
 * What deleteAccount() actually touches.
 *
 * The risk with a deletion routine is not that it throws — it is that it
 * quietly misses a table, and a reference to a deleted person survives in a
 * column nobody thought about. So this records every write the real function
 * makes against a stand-in driver and asserts the whole set, rather than
 * spot-checking a few.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Write = { op: "update" | "delete" | "insert"; table: string; values?: Record<string, unknown> };

const driver = vi.hoisted(() => {
  const state = {
    writes: [] as Write[],
    rows: {} as Record<string, unknown[]>,
    tableNames: new Map<unknown, string>(),
  };

  const name = (table: unknown) => state.tableNames.get(table) ?? "unknown";

  // Every builder node answers the whole chain vocabulary and is awaitable,
  // because db.ts awaits at different points depending on the query.
  const node = (resolve: () => unknown, onAwait?: () => void) => {
    const self: Record<string, unknown> = {};
    for (const method of ["from", "leftJoin", "where", "orderBy", "limit", "groupBy"]) {
      self[method] = (arg: unknown) => {
        if (method === "from") self.__table = arg;
        return self;
      };
    }
    self.then = (ok: (value: unknown) => unknown) => {
      onAwait?.();
      return Promise.resolve(resolve()).then(ok);
    };
    return self;
  };

  const client = {
    select: () => {
      const chain: Record<string, unknown> = {};
      let table: unknown;
      for (const method of ["from", "leftJoin", "where", "orderBy", "limit", "groupBy"]) {
        chain[method] = (arg: unknown) => {
          if (method === "from") table = arg;
          return chain;
        };
      }
      chain.then = (ok: (value: unknown) => unknown) =>
        Promise.resolve(state.rows[name(table)] ?? []).then(ok);
      return chain;
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) =>
        node(
          () => undefined,
          () => state.writes.push({ op: "update", table: name(table), values }),
        ),
    }),
    delete: (table: unknown) =>
      node(
        () => undefined,
        () => state.writes.push({ op: "delete", table: name(table) }),
      ),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const n = node(
          () => undefined,
          () => state.writes.push({ op: "insert", table: name(table), values }),
        );
        n.onDuplicateKeyUpdate = () => n;
        return n;
      },
    }),
  };

  return { state, client };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => driver.client }));
process.env.DATABASE_URL = "mysql://stub@127.0.0.1:3306/stub";

const schema = await import("../drizzle/schema");
const { deleteAccount } = await import("./db");

for (const [key, table] of Object.entries(schema)) {
  if (table && typeof table === "object") driver.state.tableNames.set(table, key);
}

const USER = { id: 7, username: "Nia", openId: "manus-abc", email: "nia@example.com" };

// Rows are shaped as the real queries project them: the dependency probes
// select `receiptId` aliased to `id`.
const setRows = (over: Record<string, unknown[]> = {}) => {
  driver.state.rows = {
    users: [USER],
    receipts: [
      { id: 1, visibility: "PUBLIC" },
      { id: 2, visibility: "PRIVATE" },
    ],
    challenges: [],
    receiptReports: [],
    moderationActions: [],
    ...over,
  };
};

beforeEach(() => {
  driver.state.writes.length = 0;
  setRows();
});

const writesTo = (table: string) => driver.state.writes.filter((w) => w.table === table);

describe("deleteAccount touches every table that references a person", () => {
  it("clears the author reference on their receipts rather than deleting them", async () => {
    await deleteAccount(7);
    const nulled = writesTo("receipts").filter((w) => w.op === "update" && "userId" in (w.values ?? {}));
    expect(nulled).toHaveLength(1);
    expect(nulled[0].values).toEqual({ userId: null });
  });

  it("clears them from other people's receipts as the challenged party", async () => {
    await deleteAccount(7);
    expect(writesTo("receipts").some((w) => w.op === "update" && w.values?.challengeUserId === null)).toBe(true);
  });

  it("keeps their responses but detaches them, so other people's counts hold", async () => {
    await deleteAccount(7);
    const writes = writesTo("receiptInteractions");
    expect(writes.some((w) => w.op === "update" && w.values?.userId === null)).toBe(true);
  });

  it("clears each side of a challenge independently", async () => {
    await deleteAccount(7);
    const writes = writesTo("challenges");
    expect(writes.some((w) => w.values?.challengerId === null)).toBe(true);
    expect(writes.some((w) => w.values?.challengedId === null)).toBe(true);
    expect(writes.some((w) => w.op === "delete")).toBe(false);
  });

  it("deletes notifications both to them and about them", async () => {
    // Two deletes: their inbox, and anyone else's row naming them — the title
    // embeds the handle as literal text, so the row is the only way to remove it.
    await deleteAccount(7);
    expect(writesTo("notifications").filter((w) => w.op === "delete")).toHaveLength(2);
  });

  it("detaches analytics rather than dropping the aggregate", async () => {
    await deleteAccount(7);
    expect(writesTo("analyticsEvents")).toEqual([
      { op: "update", table: "analyticsEvents", values: { userId: null } },
    ]);
  });

  it("deletes purely account-level tables outright", async () => {
    await deleteAccount(7);
    expect(writesTo("achievements").map((w) => w.op)).toEqual(["delete"]);
    expect(writesTo("dailyActivity").map((w) => w.op)).toEqual(["delete"]);
  });

  it("keeps moderation evidence and detaches it", async () => {
    await deleteAccount(7);
    const reports = writesTo("receiptReports");
    const actions = writesTo("moderationActions");
    expect(reports.some((w) => w.op === "update" && w.values?.reporterId === null)).toBe(true);
    expect(reports.some((w) => w.op === "update" && w.values?.resolvedBy === null)).toBe(true);
    expect(actions.some((w) => w.op === "update" && w.values?.moderatorId === null)).toBe(true);
    // An admin closing their own account must not erase the audit trail.
    expect(actions.some((w) => w.op === "delete")).toBe(false);
  });

  it("retires the username, lower-cased", async () => {
    await deleteAccount(7);
    expect(writesTo("retiredUsernames")).toEqual([
      { op: "insert", table: "retiredUsernames", values: { username: "nia" } },
    ]);
  });

  it("retires nothing when the account never chose a handle", async () => {
    setRows({ users: [{ ...USER, username: null }] });
    await deleteAccount(7);
    expect(writesTo("retiredUsernames")).toHaveLength(0);
  });

  it("deletes the account row last, so nothing is orphaned part-way", async () => {
    await deleteAccount(7);
    const userDeletes = driver.state.writes
      .map((w, index) => ({ ...w, index }))
      .filter((w) => w.table === "users" && w.op === "delete");
    expect(userDeletes).toHaveLength(1);
    expect(userDeletes[0].index).toBe(driver.state.writes.length - 1);
  });

  it("reports what it did", async () => {
    const outcome = await deleteAccount(7);
    expect(outcome).toMatchObject({ deletedPrivateReceipts: 1, usernameRetired: true });
  });

  it("does nothing for an account that is not there", async () => {
    setRows({ users: [] });
    expect(await deleteAccount(999)).toBeNull();
    expect(driver.state.writes).toHaveLength(0);
  });
});

describe("private receipts", () => {
  it("are deleted outright when nothing else depends on them", async () => {
    await deleteAccount(7);
    expect(writesTo("receipts").some((w) => w.op === "delete")).toBe(true);
  });

  it("are kept and detached when a challenge is anchored to them", async () => {
    // Deleting it would destroy the other party's position and confidence,
    // which are not this person's to erase. It stays PRIVATE, so it is still
    // absent from every public surface.
    setRows({ challenges: [{ id: 2 }] });
    const outcome = await deleteAccount(7);
    expect(writesTo("receipts").some((w) => w.op === "delete")).toBe(false);
    expect(outcome).toMatchObject({ deletedPrivateReceipts: 0 });
  });

  it("are kept when a report points at them, because reports are never deleted", async () => {
    setRows({ receiptReports: [{ id: 2 }] });
    const outcome = await deleteAccount(7);
    expect(writesTo("receipts").some((w) => w.op === "delete")).toBe(false);
    expect(outcome).toMatchObject({ deletedPrivateReceipts: 0 });
  });

  it("are kept when a moderation decision points at them", async () => {
    setRows({ moderationActions: [{ id: 2 }] });
    const outcome = await deleteAccount(7);
    expect(writesTo("receipts").some((w) => w.op === "delete")).toBe(false);
    expect(outcome).toMatchObject({ deletedPrivateReceipts: 0 });
  });

  it("never deletes a report or an audit row on the way", async () => {
    await deleteAccount(7);
    expect(writesTo("receiptReports").some((w) => w.op === "delete")).toBe(false);
    expect(writesTo("moderationActions").some((w) => w.op === "delete")).toBe(false);
  });

  it("do not leave dangling ME TOO lineage behind", async () => {
    await deleteAccount(7);
    expect(writesTo("receipts").some((w) => w.op === "update" && w.values?.derivedFromId === null)).toBe(true);
  });

  it("skip the cleanup entirely when the account had none", async () => {
    setRows({ receipts: [{ id: 1, visibility: "PUBLIC" }] });
    await deleteAccount(7);
    expect(writesTo("receipts").some((w) => w.op === "delete")).toBe(false);
  });
});
