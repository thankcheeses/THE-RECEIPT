/**
 * The ME TOO cluster.
 *
 * The thing that makes this worth anything is that every member is a Receipt
 * somebody independently locked — not a like, not a reaction, not a count of
 * people who agreed. So these tests are mostly about what must NOT be counted.
 *
 * The real query runs against a stand-in driver, so the visibility rule it
 * composes is the one that ships.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const driver = vi.hoisted(() => {
  const state = { rows: [] as unknown[], lastWhere: null as unknown, groupedBy: null as unknown };
  const client = {
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const method of ["from", "leftJoin", "orderBy", "limit"]) chain[method] = () => chain;
      chain.where = (condition: unknown) => {
        state.lastWhere = condition;
        return chain;
      };
      chain.groupBy = (column: unknown) => {
        state.groupedBy = column;
        return chain;
      };
      chain.then = (ok: (value: unknown) => unknown) => Promise.resolve(state.rows).then(ok);
      return chain;
    },
  };
  return { state, client };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => driver.client }));
process.env.DATABASE_URL = "mysql://stub@127.0.0.1:3306/stub";

const { getMeTooCluster, summarizeCluster } = await import("./db");

beforeEach(() => {
  driver.state.rows = [];
  driver.state.lastWhere = null;
  driver.state.groupedBy = null;
});

const compiledWhere = () => new MySqlDialect().sqlToQuery(driver.state.lastWhere as never);

describe("what the cluster query counts", () => {
  it("only Receipts derived from this one", async () => {
    await getMeTooCluster(4821);
    const { sql, params } = compiledWhere();
    expect(sql).toContain("`derivedFromId` = ?");
    expect(params).toContain(4821);
  });

  it("cannot count the original as its own ME TOO", async () => {
    // A Receipt's derivedFromId points at its parent, never at itself, so
    // `derivedFromId = 4821` can never match receipt 4821. The id column is
    // not even part of the condition.
    await getMeTooCluster(4821);
    const { sql } = compiledWhere();
    expect(sql).toContain("`derivedFromId` = ?");
    expect(sql).not.toContain("`receipts`.`id` =");
  });

  it("cannot count an unrelated Receipt, because lineage is the only filter", async () => {
    await getMeTooCluster(4821);
    const { params } = compiledWhere();
    // One lineage parameter, and nothing that would widen the set.
    expect(params.filter((param) => param === 4821)).toHaveLength(1);
  });

  it("applies the public visibility rule, so private members are absent", async () => {
    await getMeTooCluster(4821);
    const { sql, params } = compiledWhere();
    expect(sql).toContain("`visibility`");
    expect(params).toContain("PUBLIC");
  });

  it("applies the moderation rule, so a taken-down member is absent", async () => {
    await getMeTooCluster(4821);
    const { sql, params } = compiledWhere();
    expect(sql).toContain("`moderationStatus`");
    expect(params).toContain("VISIBLE");
  });

  it("does not filter on the author, so a deleted account's call still counts", async () => {
    // The call was genuinely made and independently locked. Only the person
    // behind it is gone, and deletion leaves the Receipt public.
    await getMeTooCluster(4821);
    expect(compiledWhere().sql).not.toContain("`receipts`.`userId`");
  });

  it("groups by status, which is how outcomes are counted", async () => {
    await getMeTooCluster(4821);
    expect(driver.state.groupedBy).toBeTruthy();
  });

  it("returns an empty cluster without a database rather than throwing", async () => {
    expect(summarizeCluster([])).toMatchObject({ total: 0, resolved: 0 });
  });
});

describe("counting the members", () => {
  it("is empty when nobody has written their own", () => {
    expect(summarizeCluster([])).toEqual({
      total: 0, open: 0, right: 0, wrong: 0, partial: 0, tooEarly: 0, resolved: 0,
    });
  });

  it("counts one member", () => {
    expect(summarizeCluster([{ status: "PENDING", total: 1 }])).toMatchObject({ total: 1, open: 1 });
  });

  it("totals several independent Receipts across statuses", async () => {
    driver.state.rows = [
      { status: "PENDING", total: 3 },
      { status: "LOCKED", total: 2 },
      { status: "RIGHT", total: 9 },
      { status: "WRONG", total: 5 },
    ];
    const cluster = await getMeTooCluster(4821);
    expect(cluster).toMatchObject({ total: 19, open: 5, right: 9, wrong: 5, resolved: 14 });
  });

  it("counts PENDING and LOCKED together as still open", () => {
    const cluster = summarizeCluster([
      { status: "PENDING", total: 2 },
      { status: "LOCKED", total: 3 },
    ]);
    expect(cluster).toMatchObject({ total: 5, open: 5, resolved: 0 });
  });

  it("keeps every existing resolution state distinct", () => {
    const cluster = summarizeCluster([
      { status: "RIGHT", total: 1 },
      { status: "WRONG", total: 2 },
      { status: "PARTIALLY RIGHT", total: 3 },
      { status: "TOO EARLY", total: 4 },
    ]);
    // No new resolution model: these are the statuses receipts already have.
    expect(cluster).toMatchObject({ right: 1, wrong: 2, partial: 3, tooEarly: 4, resolved: 10, open: 0 });
  });

  it("counts an unrecognised status in the total but in no bucket", () => {
    // Better an honest total than folding it into an outcome it is not.
    const cluster = summarizeCluster([{ status: "SOMETHING_NEW", total: 4 }]);
    expect(cluster.total).toBe(4);
    expect(cluster.open + cluster.resolved).toBe(0);
  });

  it("handles counts that arrive as strings, as MySQL drivers do", () => {
    expect(summarizeCluster([{ status: "RIGHT", total: "7" }])).toMatchObject({ total: 7, right: 7 });
  });
});

describe("reading is not writing", () => {
  it("never inserts or updates, so repeated reads cannot inflate the cluster", async () => {
    // The stand-in driver exposes only `select`. If getMeTooCluster tried to
    // write anything — a cached count, a tally row — this would throw.
    await getMeTooCluster(4821);
    await getMeTooCluster(4821);
    await getMeTooCluster(4821);
    expect(await getMeTooCluster(4821)).toMatchObject({ total: 0 });
  });

  it("returns the same cluster for the same rows every time", async () => {
    driver.state.rows = [{ status: "RIGHT", total: 2 }];
    const first = await getMeTooCluster(4821);
    const second = await getMeTooCluster(4821);
    expect(second).toEqual(first);
  });
});
