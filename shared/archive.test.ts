/**
 * The archive's arithmetic.
 *
 * Two claims have to hold for the resurfacing loop to be honest: "a year ago
 * today" has to mean today, and "you wrote something similar" has to be true
 * often enough to be worth saying and rare enough not to be noise. Both are
 * pure functions, so both are pinned here rather than guessed at in the UI.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_RESURFACED_PER_DAY,
  RESURFACE_YEARS,
  SIMILARITY_THRESHOLD,
  contentTokens,
  parseSearchQuery,
  similarity,
  yearsAgoToday,
} from "./archive";

describe("content tokens", () => {
  it("keeps the words that carry meaning", () => {
    expect(contentTokens("I think Brooklyn will flood again")).toEqual(["think", "brooklyn", "flood", "again"]);
  });

  it("drops the words every sentence has", () => {
    const tokens = contentTokens("I think that the thing will be in the house");
    for (const stop of ["the", "that", "will", "in"]) expect(tokens).not.toContain(stop);
  });

  it("ignores punctuation and case", () => {
    expect(contentTokens("Brooklyn, BROOKLYN — brooklyn!")).toEqual(["brooklyn"]);
  });

  it("keeps letters outside English", () => {
    expect(contentTokens("café déjà")).toEqual(["café", "déjà"]);
  });

  it("returns nothing for text made only of stop words", () => {
    expect(contentTokens("it is that they have been with them")).toEqual([]);
  });
});

describe("similarity", () => {
  it("calls the same sentence identical", () => {
    expect(similarity("I will move to Lisbon this year", "I will move to Lisbon this year")).toBe(1);
  });

  it("calls two unrelated sentences nothing alike", () => {
    expect(similarity("Arsenal win the league", "my sister starts her degree")).toBe(0);
  });

  it("recognises the same thought in different words", () => {
    const score = similarity(
      "I think I'll finally move to Lisbon next spring",
      "I'm going to move to Lisbon in the spring",
    );
    expect(score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
  });

  it("is quiet about a passing resemblance", () => {
    // One shared word is not "you wrote this before". A false echo is far more
    // annoying than a missed one, so the threshold is set to under-report.
    const score = similarity("Arsenal win the league", "Arsenal sell their goalkeeper");
    expect(score).toBeLessThan(SIMILARITY_THRESHOLD);
  });

  it("is symmetric, so it cannot depend on which one was written first", () => {
    const a = "the bakery on the corner closes before summer";
    const b = "that corner bakery will close by summer";
    expect(similarity(a, b)).toBe(similarity(b, a));
  });

  it("scores empty text as nothing rather than dividing by zero", () => {
    expect(similarity("", "anything at all")).toBe(0);
    expect(similarity("the and it", "the and it")).toBe(0);
  });
});

describe("a year ago today", () => {
  const march4 = (year: number) => new Date(`${year}-03-04T09:00:00Z`);

  it("matches the same calendar day a year earlier", () => {
    expect(yearsAgoToday(march4(2025), march4(2026))).toBe(1);
  });

  it("matches two, three and five years, which is the whole list", () => {
    for (const years of RESURFACE_YEARS) {
      expect(yearsAgoToday(march4(2026 - years), march4(2026))).toBe(years);
    }
  });

  it("says nothing one day either side", () => {
    expect(yearsAgoToday(new Date("2025-03-03T09:00:00Z"), march4(2026))).toBeNull();
    expect(yearsAgoToday(new Date("2025-03-05T09:00:00Z"), march4(2026))).toBeNull();
  });

  it("says nothing for a gap nobody would call an anniversary", () => {
    expect(yearsAgoToday(march4(2022), march4(2026))).toBeNull(); // four years
    expect(yearsAgoToday(march4(2026), march4(2026))).toBeNull(); // today
  });

  it("resurfaces a leap-day receipt on March 1 in a common year", () => {
    expect(yearsAgoToday(new Date("2024-02-29T09:00:00Z"), new Date("2025-03-01T09:00:00Z"))).toBe(1);
  });

  it("still uses the real date when the leap day exists", () => {
    expect(yearsAgoToday(new Date("2024-02-29T09:00:00Z"), new Date("2028-02-29T09:00:00Z"))).toBe(null);
    expect(yearsAgoToday(new Date("2025-02-28T09:00:00Z"), new Date("2026-02-28T09:00:00Z"))).toBe(1);
  });
});

describe("search terms", () => {
  it("splits a query into words", () => {
    expect(parseSearchQuery("brooklyn flood")).toEqual(["brooklyn", "flood"]);
  });

  it("keeps a quoted phrase together", () => {
    expect(parseSearchQuery('"the corner bakery" closing')).toEqual(["the corner bakery", "closing"]);
  });

  it("drops fragments too short to narrow anything", () => {
    expect(parseSearchQuery("a i brooklyn")).toEqual(["brooklyn"]);
  });

  it("caps the number of terms so one query cannot fan out unboundedly", () => {
    expect(parseSearchQuery("one two three four five six seven eight nine ten")).toHaveLength(8);
  });

  it("returns nothing for an empty box", () => {
    expect(parseSearchQuery("   ")).toEqual([]);
  });
});

describe("how much resurfacing is allowed", () => {
  it("hands back one receipt a day at most", () => {
    // Three at once is a feed. One is an event.
    expect(MAX_RESURFACED_PER_DAY).toBe(1);
  });
});
