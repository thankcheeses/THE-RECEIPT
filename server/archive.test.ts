/**
 * Archive search, at the query.
 *
 * The whole safety argument for search is that there is no public variant of
 * it: every read is pinned to one author id, so there is no shape of query
 * that could return somebody else's private receipt, somebody else's dream, or
 * a receipt moderation has taken down. That argument is only worth anything if
 * the author id is actually in the SQL, so it is asserted there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const driver = vi.hoisted(() => {
  const state = { rows: [] as unknown[], wheres: [] as unknown[] };
  const client = {
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const method of ["from", "leftJoin", "orderBy", "limit", "groupBy"]) chain[method] = () => chain;
      chain.where = (condition: unknown) => {
        state.wheres.push(condition);
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

const { searchMyReceipts, findSimilarInArchive, getResurfaced, archiveTypeCounts } = await import("./db");

beforeEach(() => {
  driver.state.rows = [];
  driver.state.wheres.length = 0;
});

const compiled = () => new MySqlDialect().sqlToQuery(driver.state.wheres[0] as never);

describe("what archive search is allowed to read", () => {
  it("is pinned to one author id", async () => {
    await searchMyReceipts({ userId: 42, query: "brooklyn" });
    const { sql, params } = compiled();
    expect(sql).toContain("`userId` = ?");
    expect(params).toContain(42);
  });

  it("pins the author even with no search terms at all", async () => {
    // An empty box lists the archive. That listing is the easiest place to
    // accidentally drop the scope, so it is asserted separately.
    await searchMyReceipts({ userId: 42 });
    expect(compiled().params).toContain(42);
  });

  it("has no public variant to get wrong", async () => {
    // There is no visibility or moderation condition here on purpose: a
    // person's own hidden receipt is still theirs to find, exactly as the
    // rest of the product treats a takedown. What keeps this safe is the
    // author pin above, and it is the only thing that has to hold.
    await searchMyReceipts({ userId: 42 });
    const { sql } = compiled();
    expect(sql).toContain("`userId` = ?");
  });

  it("searches the text, the title and the resolution note", async () => {
    await searchMyReceipts({ userId: 1, query: "brooklyn" });
    const { sql } = compiled();
    expect(sql).toContain("`prediction`");
    expect(sql).toContain("`title`");
    expect(sql).toContain("`result`");
  });

  it("requires every term to match, rather than any of them", async () => {
    // Two terms should narrow the result, not widen it.
    await searchMyReceipts({ userId: 1, query: "brooklyn flood" });
    const { params } = compiled();
    expect(params).toContain("%brooklyn%");
    expect(params).toContain("%flood%");
  });

  it("treats a wildcard as a character somebody typed", async () => {
    // Unescaped, "100%" would match everything and "a_b" would match "axb".
    await searchMyReceipts({ userId: 1, query: "100% a_b" });
    const { params } = compiled();
    expect(params).toContain("%100\\%%");
    expect(params).toContain("%a\\_b%");
  });

  it("narrows by type when asked", async () => {
    await searchMyReceipts({ userId: 1, semanticType: "MEMORY" });
    expect(compiled().params).toContain("MEMORY");
  });

  it("narrows by resolution state when asked", async () => {
    await searchMyReceipts({ userId: 1, status: "RIGHT" });
    expect(compiled().params).toContain("RIGHT");
  });

  it("pages with a keyset cursor rather than an offset", async () => {
    await searchMyReceipts({ userId: 1, cursor: 500 });
    const { sql, params } = compiled();
    expect(sql).toContain("`id` <");
    expect(params).toContain(500);
  });

  it("reports a cursor only when another page exists", async () => {
    driver.state.rows = Array.from({ length: 21 }, (_, index) => ({ id: 100 - index }));
    const page = await searchMyReceipts({ userId: 1, limit: 20 });
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBe(81);
  });

  it("reports no cursor on a short final page", async () => {
    driver.state.rows = [{ id: 3 }, { id: 2 }];
    expect((await searchMyReceipts({ userId: 1, limit: 20 })).nextCursor).toBeNull();
  });

  it("caps the page size however large a limit is asked for", async () => {
    driver.state.rows = Array.from({ length: 200 }, (_, index) => ({ id: 200 - index }));
    expect((await searchMyReceipts({ userId: 1, limit: 999 as number })).items.length).toBeLessThanOrEqual(50);
  });

  it("returns an empty page without a database rather than throwing", async () => {
    // Nothing here is load-bearing enough to fail a page render over.
    expect(await searchMyReceipts({ userId: 1, limit: 5 })).toEqual({ items: [], nextCursor: null });
  });
});

describe("what resurfacing is allowed to read", () => {
  it("reads only the caller's own receipts", async () => {
    await getResurfaced(42, new Date("2026-03-04T09:00:00Z"));
    const { sql, params } = compiled();
    expect(sql).toContain("`userId` = ?");
    expect(params).toContain(42);
  });

  it("looks no further back than the oldest anniversary it can report", async () => {
    await getResurfaced(42, new Date("2026-03-04T09:00:00Z"));
    expect(compiled().sql).toContain("`createdAt`");
  });

  it("returns nothing when no receipt falls on today's date", async () => {
    driver.state.rows = [{ id: 1, createdAt: new Date("2025-07-01T09:00:00Z"), prediction: "x" }];
    expect(await getResurfaced(42, new Date("2026-03-04T09:00:00Z"))).toBeNull();
  });

  it("hands back the anniversary when one lands today", async () => {
    driver.state.rows = [{ id: 9, createdAt: new Date("2025-03-04T09:00:00Z"), prediction: "I think it floods" }];
    const found = await getResurfaced(42, new Date("2026-03-04T09:00:00Z"));
    expect(found).toMatchObject({ kind: "ANNIVERSARY", years: 1 });
    expect(found?.receipt.id).toBe(9);
  });

  it("prefers the oldest anniversary when two land on the same day", async () => {
    // Five years ago is a better story than one year ago.
    driver.state.rows = [
      { id: 1, createdAt: new Date("2025-03-04T09:00:00Z"), prediction: "recent" },
      { id: 2, createdAt: new Date("2021-03-04T09:00:00Z"), prediction: "older" },
    ];
    const found = await getResurfaced(42, new Date("2026-03-04T09:00:00Z"));
    expect(found).toMatchObject({ years: 5 });
    expect(found?.receipt.id).toBe(2);
  });

  it("makes no claim beyond the date", async () => {
    driver.state.rows = [{ id: 9, createdAt: new Date("2025-03-04T09:00:00Z"), prediction: "x" }];
    const found = await getResurfaced(42, new Date("2026-03-04T09:00:00Z"));
    // No "this came true", no "this predicted", no interpretation of any kind
    // — just which receipt, and how long ago.
    expect(Object.keys(found ?? {}).sort()).toEqual(["kind", "receipt", "similarTo", "years"]);
  });
});

describe("what the similarity lookup is allowed to read", () => {
  it("reads only the caller's own receipts", async () => {
    await findSimilarInArchive(42, "I think it will flood again");
    const { sql, params } = compiled();
    expect(sql).toContain("`userId` = ?");
    expect(params).toContain(42);
  });

  it("never offers a dream as a precedent", async () => {
    // One short step from here is "your dream predicted this", which the
    // product must never say. The exclusion is in the query, not the caller.
    await findSimilarInArchive(42, "I think it will flood again");
    const { sql, params } = compiled();
    expect(sql).toContain("`semanticType`");
    expect(params).toContain("DREAM");
  });

  it("excludes the receipt being written, so it cannot match itself", async () => {
    await findSimilarInArchive(42, "text", 77);
    expect(compiled().params).toContain(77);
  });

  it("says nothing for empty text rather than querying at all", async () => {
    expect(await findSimilarInArchive(42, "   ")).toBeNull();
    expect(driver.state.wheres).toHaveLength(0);
  });

  it("stays quiet when nothing clears the threshold", async () => {
    driver.state.rows = [{ id: 1, prediction: "my sister starts her degree in the autumn", semanticType: "PREDICTION" }];
    expect(await findSimilarInArchive(42, "arsenal will win the league")).toBeNull();
  });

  it("returns the closest match when one is close enough", async () => {
    driver.state.rows = [
      { id: 1, prediction: "my sister starts her degree in the autumn", semanticType: "PREDICTION" },
      { id: 2, prediction: "I will finally move to Lisbon next spring", semanticType: "PREDICTION" },
    ];
    const found = await findSimilarInArchive(42, "I'm going to move to Lisbon in the spring");
    expect(found?.receipt.id).toBe(2);
    expect(found?.kind).toBe("SIMILAR");
  });
});

describe("archive counts", () => {
  it("are scoped to one author like everything else here", async () => {
    await archiveTypeCounts(42);
    expect(compiled().params).toContain(42);
  });

  it("read as numbers even when the driver returns strings", async () => {
    driver.state.rows = [{ semanticType: "MEMORY", total: "4" }];
    expect(await archiveTypeCounts(42)).toEqual([{ semanticType: "MEMORY", total: 4 }]);
  });
});
