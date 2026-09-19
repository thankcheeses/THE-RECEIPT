import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { resolvingSoonWhere } from "./db";
import {
  DELETED_AUTHOR_LABEL,
  USERNAME_UNAVAILABLE,
  authorLabel,
  isAuthorDeleted,
  isUnresolvable,
  normalizeUsername,
} from "@shared/accountDeletion";

describe("isAuthorDeleted", () => {
  it("is true only when the author reference was cleared", () => {
    expect(isAuthorDeleted({ userId: null })).toBe(true);
    expect(isAuthorDeleted({ userId: 7 })).toBe(false);
  });

  it("treats a row that never carried the field as having an author", () => {
    // An older client cache, or a payload that simply omits it. Guessing
    // "deleted" there would brand live people's receipts as orphans.
    expect(isAuthorDeleted({})).toBe(false);
    expect(isAuthorDeleted({ userId: undefined })).toBe(false);
  });
});

describe("authorLabel", () => {
  it("names a live author by handle, then by name", () => {
    expect(authorLabel({ userId: 7 }, { username: "nia", name: "Nia" })).toBe("@nia");
    expect(authorLabel({ userId: 7 }, { username: null, name: "Nia" })).toBe("Nia");
  });

  it("uses the generic state for a deleted author, whatever was joined", () => {
    expect(authorLabel({ userId: null }, null)).toBe(DELETED_AUTHOR_LABEL);
    // Even if a stale user row somehow came back, deletion wins — the label
    // must never resurrect a handle as though the account were still there.
    expect(authorLabel({ userId: null }, { username: "nia", name: "Nia" })).toBe(DELETED_AUTHOR_LABEL);
  });

  it("does not claim deletion when the author is merely absent", () => {
    // A private receipt read by its owner joins no public user row. That is
    // not a deleted account and must not be labelled as one.
    expect(authorLabel({ userId: 7 }, null)).toBe("Anonymous");
    expect(authorLabel({ userId: 7 }, null, "Someone")).toBe("Someone");
  });
});

describe("isUnresolvable", () => {
  it("is true for an open receipt whose author is gone", () => {
    expect(isUnresolvable({ userId: null, status: "PENDING" })).toBe(true);
    expect(isUnresolvable({ userId: null, status: "LOCKED" })).toBe(true);
  });

  it("is false once a verdict was actually recorded", () => {
    for (const status of ["RIGHT", "WRONG", "PARTIALLY RIGHT", "TOO EARLY"]) {
      expect(isUnresolvable({ userId: null, status })).toBe(false);
    }
  });

  it("is false while the author still has an account", () => {
    expect(isUnresolvable({ userId: 7, status: "PENDING" })).toBe(false);
  });
});

describe("normalizeUsername", () => {
  it("folds case and trims, so a handle cannot be re-claimed by re-casing it", () => {
    expect(normalizeUsername("  NiA  ")).toBe("nia");
    expect(normalizeUsername("NIA")).toBe(normalizeUsername("nia"));
  });
});

/**
 * The query behind "Resolving soon". A receipt nobody can resolve must not sit
 * in a list whose entire promise is that an answer is coming.
 */
describe("resolvingSoonWhere", () => {
  it("requires an author alongside the public visibility rule", () => {
    const { sql, params } = new MySqlDialect().sqlToQuery(resolvingSoonWhere(new Date("2026-01-01"))!);
    expect(sql).toContain("`userId` is not null");
    expect(sql).toContain("`visibility`");
    expect(sql).toContain("`moderationStatus`");
    expect(params).toContain("PUBLIC");
    expect(params).toContain("VISIBLE");
  });
});

describe("USERNAME_UNAVAILABLE", () => {
  it("says nothing about why", () => {
    // Distinguishing "taken" from "retired" would disclose that a stranger
    // exists, or that they deleted their account.
    expect(USERNAME_UNAVAILABLE).not.toMatch(/taken|retired|deleted|exists/i);
  });
});
