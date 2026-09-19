/**
 * "Your receipt is ready to resolve."
 *
 * There is no scheduler, so this runs on the notification read path and is
 * called repeatedly — the bell polls. Almost every test here is therefore
 * about *not* doing something twice.
 *
 * The real queries run against a stand-in driver, so the eligibility rules and
 * the insert are the ones that ship, not a restatement of them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

type Insert = { table: string; rows: Array<Record<string, unknown>>; onConflict: boolean };

const driver = vi.hoisted(() => {
  const state = {
    inserts: [] as Insert[],
    /** Rows the due-query returns, i.e. receipts that are due and unnotified. */
    due: [] as unknown[],
    tableNames: new Map<unknown, string>(),
    /** The compiled WHERE of the last select, for asserting the rules. */
    lastWhere: null as unknown,
  };
  const name = (table: unknown) => state.tableNames.get(table) ?? "unknown";

  const client = {
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const method of ["from", "leftJoin", "orderBy", "limit", "groupBy"]) {
        chain[method] = () => chain;
      }
      chain.where = (condition: unknown) => {
        state.lastWhere = condition;
        return chain;
      };
      chain.then = (ok: (value: unknown) => unknown) => Promise.resolve(state.due).then(ok);
      return chain;
    },
    insert: (table: unknown) => ({
      values: (rows: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const node: Record<string, unknown> = {};
        let onConflict = false;
        node.onDuplicateKeyUpdate = () => {
          onConflict = true;
          return node;
        };
        node.then = (ok: (value: unknown) => unknown) => {
          state.inserts.push({
            table: name(table),
            rows: Array.isArray(rows) ? rows : [rows],
            onConflict,
          });
          return Promise.resolve(undefined).then(ok);
        };
        return node;
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    delete: () => ({ where: async () => undefined }),
  };
  return { state, client };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => driver.client }));
process.env.DATABASE_URL = "mysql://stub@127.0.0.1:3306/stub";

const schema = await import("../drizzle/schema");
const { syncResolutionNotifications, buildDueNotification, RESOLVABLE_STATUSES } = await import("./db");

for (const [key, table] of Object.entries(schema)) {
  if (table && typeof table === "object") driver.state.tableNames.set(table, key);
}

const DUE_RECEIPT = { id: 4821, prediction: "This will absolutely happen." };

beforeEach(() => {
  driver.state.inserts.length = 0;
  driver.state.due = [];
  driver.state.lastWhere = null;
});

const notificationsInserted = () =>
  driver.state.inserts.filter((insert) => insert.table === "notifications");

const compiledWhere = () => new MySqlDialect().sqlToQuery(driver.state.lastWhere as never);

describe("which receipts the due query asks for", () => {
  it("only the caller's own, still open, and past their resolution date", async () => {
    await syncResolutionNotifications(7, new Date("2026-06-01T00:00:00Z"));
    const { sql, params } = compiledWhere();

    // Author-only. This is what makes the notification unreachable by anyone
    // else, and it is the same column resolve() checks.
    expect(sql).toContain("`receipts`.`userId` = ?");
    expect(params).toContain(7);

    // Still open — an already-resolved receipt is excluded here, not later.
    expect(params).toContain("PENDING");
    expect(params).toContain("LOCKED");
    for (const resolved of ["RIGHT", "WRONG", "PARTIALLY RIGHT", "TOO EARLY"]) {
      expect(params).not.toContain(resolved);
    }

    // Due, by the receipt's own timestamp. Drizzle serialises the Date through
    // the same mapper that wrote resolutionDate, so the two are comparable.
    expect(sql).toContain("`resolutionDate` <= ?");
    expect(String(params[params.length - 1])).toContain("2026-06-01");

    // And no notification for it yet.
    expect(sql).toContain("is null");
  });

  it("asks against the same status list the resolve guard uses", () => {
    // If these drifted, the bell would announce receipts resolve() refuses.
    expect([...RESOLVABLE_STATUSES]).toEqual(["PENDING", "LOCKED"]);
  });
});

describe("generation", () => {
  it("creates nothing when no receipt is due", async () => {
    driver.state.due = [];
    expect(await syncResolutionNotifications(7)).toBe(0);
    expect(notificationsInserted()).toHaveLength(0);
  });

  it("creates one notification for a receipt that has come due", async () => {
    driver.state.due = [DUE_RECEIPT];
    expect(await syncResolutionNotifications(7)).toBe(1);
    const rows = notificationsInserted()[0].rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: 7, type: "RECEIPT_DUE", receiptId: 4821 });
  });

  it("addresses it to the author and nobody else", async () => {
    driver.state.due = [DUE_RECEIPT];
    await syncResolutionNotifications(99);
    expect(notificationsInserted()[0].rows[0]).toMatchObject({ userId: 99 });
  });

  it("links to the owner view, which is where the resolve controls are", async () => {
    driver.state.due = [DUE_RECEIPT];
    await syncResolutionNotifications(7);
    // Not /r/4821 — the public view has no way to record a result.
    expect(notificationsInserted()[0].rows[0]).toMatchObject({ linkPath: "/receipt/4821" });
  });

  it("creates nothing on a second call, because the query excludes notified receipts", async () => {
    driver.state.due = [DUE_RECEIPT];
    await syncResolutionNotifications(7);
    // The row now exists, so the left join finds it and the receipt drops out.
    driver.state.due = [];
    expect(await syncResolutionNotifications(7)).toBe(0);
    expect(notificationsInserted()).toHaveLength(1);
  });

  it("writes through a conflict clause, so losing the race cannot duplicate", async () => {
    // The absence check above is only an optimisation — two concurrent polls
    // can both pass it. The unique index is the guarantee, and the insert has
    // to be written to survive hitting it rather than throwing.
    driver.state.due = [DUE_RECEIPT];
    await syncResolutionNotifications(7);
    expect(notificationsInserted()[0].onConflict).toBe(true);
  });

  it("batches several due receipts into one insert", async () => {
    driver.state.due = [DUE_RECEIPT, { id: 4822, prediction: "And this one." }];
    expect(await syncResolutionNotifications(7)).toBe(2);
    expect(notificationsInserted()).toHaveLength(1);
    expect(notificationsInserted()[0].rows).toHaveLength(2);
  });

  it("never throws into the request that triggered it", async () => {
    const boom = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    driver.state.due = [Object.create({ get id() { throw new Error("bad row"); } })];
    // A missed notification must not cost someone their page load.
    await expect(syncResolutionNotifications(7)).resolves.toBe(0);
    boom.mockRestore();
  });
});

describe("what the notification says", () => {
  it("names the receipt and carries its own text", () => {
    expect(buildDueNotification(DUE_RECEIPT)).toEqual({
      title: "Receipt #004821 is ready to resolve.",
      body: "This will absolutely happen.",
      linkPath: "/receipt/4821",
    });
  });

  it("pads the number the way the rest of the product does", () => {
    expect(buildDueNotification({ id: 7, prediction: "x" }).title).toContain("#000007");
  });

  it("fits the title column", () => {
    const long = buildDueNotification({ id: 999999, prediction: "y".repeat(500) });
    expect(long.title.length).toBeLessThanOrEqual(160);
  });
});

describe("a receipt whose author deleted their account", () => {
  it("cannot match, because the query keys on a concrete user id", async () => {
    // Deletion sets receipts.userId to null (PR #9). `userId = ?` never matches
    // null in SQL, so an orphaned receipt generates nothing for anyone.
    await syncResolutionNotifications(7);
    const { sql } = compiledWhere();
    expect(sql).toContain("`receipts`.`userId` = ?");
    expect(sql).not.toContain("`receipts`.`userId` is null");
  });
});
