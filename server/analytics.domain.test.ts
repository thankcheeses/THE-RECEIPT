import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS } from "./routers";
import { STREAK_MILESTONES, nextStreak, startOfDay } from "./db";

describe("analytics event vocabulary", () => {
  it("is a closed set with no duplicates", () => {
    expect(new Set(ANALYTICS_EVENTS).size).toBe(ANALYTICS_EVENTS.length);
  });

  it("covers every stage of the loop the product actually has", () => {
    for (const event of [
      "landing_view",
      "signup",
      "user_returned",
      "daily_answered",
      "receipt_created",
      "receipt_shared",
      "receipt_resolved",
      "challenge_created",
      "challenge_accepted",
      "streak_milestone",
    ]) {
      expect(ANALYTICS_EVENTS).toContain(event);
    }
  });

  it("uses snake_case names so the stored column stays queryable", () => {
    for (const event of ANALYTICS_EVENTS) expect(event).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});

describe("streak milestones", () => {
  it("is ascending and free of duplicates", () => {
    expect(STREAK_MILESTONES).toEqual([...new Set(STREAK_MILESTONES)].sort((a, b) => a - b));
  });

  it("does not fire on day one, so a first answer is not a milestone", () => {
    expect(STREAK_MILESTONES).not.toContain(1);
  });

  it("fires exactly once as a streak grows through a milestone", () => {
    // Walk consecutive days and count how often a milestone is hit.
    let streak = 0;
    let last: Date | null = null;
    const hits: number[] = [];
    for (let day = 0; day < 40; day++) {
      const today = startOfDay(new Date(2026, 0, 1 + day));
      streak = nextStreak(streak, last, today);
      last = today;
      if (STREAK_MILESTONES.includes(streak)) hits.push(streak);
    }
    expect(hits).toEqual([3, 7, 14, 30]);
  });

  it("does not re-fire when the same day is answered twice", () => {
    const today = startOfDay(new Date(2026, 0, 10));
    const yesterday = startOfDay(new Date(2026, 0, 9));
    const reached = nextStreak(2, yesterday, today);
    expect(reached).toBe(3);
    expect(STREAK_MILESTONES).toContain(reached);
    // A second answer the same day holds the streak, so no new milestone.
    expect(nextStreak(reached, today, today)).toBe(3);
  });
});
