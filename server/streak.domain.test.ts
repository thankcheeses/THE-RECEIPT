import { describe, expect, it } from "vitest";
import { daysBetween, nextStreak, startOfDay } from "./db";

const daysAgo = (count: number) => {
  const date = startOfDay(new Date());
  date.setDate(date.getDate() - count);
  return date;
};

describe("streak calculation", () => {
  const today = startOfDay(new Date());

  it("starts a run at 1 when the user has never answered", () => {
    expect(nextStreak(0, null, today)).toBe(1);
    expect(nextStreak(0, undefined, today)).toBe(1);
  });

  it("extends the run when yesterday was answered", () => {
    expect(nextStreak(4, daysAgo(1), today)).toBe(5);
  });

  it("does not double-count a second answer on the same day", () => {
    expect(nextStreak(6, daysAgo(0), today)).toBe(6);
  });

  it("promotes a same-day answer that somehow left the streak at zero", () => {
    expect(nextStreak(0, daysAgo(0), today)).toBe(1);
  });

  it("resets after a missed day, however long the previous run was", () => {
    expect(nextStreak(31, daysAgo(2), today)).toBe(1);
    expect(nextStreak(9, daysAgo(400), today)).toBe(1);
  });

  it("measures whole days regardless of the time of day each answer landed", () => {
    const morning = new Date(daysAgo(1));
    morning.setHours(6, 12, 0, 0);
    const evening = new Date(today);
    evening.setHours(23, 47, 0, 0);
    expect(daysBetween(morning, evening)).toBe(1);
    expect(nextStreak(2, morning, evening)).toBe(3);
  });
});
