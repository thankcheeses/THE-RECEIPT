import { describe, expect, it, vi } from "vitest";
import { toPublicUser } from "./db";

describe("toPublicUser", () => {
  const row = {
    id: 7,
    openId: "manus-abc-123",
    name: "Nia",
    email: "nia@example.com",
    loginMethod: "manus",
    role: "admin" as const,
    username: "nia",
    avatar: null,
    currentStreak: 4,
    longestStreak: 9,
    accuracy: 71,
    lastDailyDate: new Date(),
    lastActiveDate: new Date(),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  it("keeps the fields a public profile needs", () => {
    expect(toPublicUser(row)).toMatchObject({
      id: 7,
      username: "nia",
      name: "Nia",
      currentStreak: 4,
      longestStreak: 9,
      accuracy: 71,
    });
  });

  it("drops identifying and internal fields", () => {
    const shown = toPublicUser(row) as Record<string, unknown>;
    for (const field of ["openId", "email", "loginMethod", "role", "lastSignedIn", "updatedAt", "lastDailyDate", "lastActiveDate"]) {
      expect(shown).not.toHaveProperty(field);
    }
  });

  it("passes through a missing user rather than inventing one", () => {
    expect(toPublicUser(null)).toBeNull();
    expect(toPublicUser(undefined)).toBeNull();
  });
});

// The paging contract is pure: over-fetch by one, drop the extra, and report
// the last returned id as the cursor.
const rowsFor = (count: number, startId = 100) =>
  Array.from({ length: count }, (_, index) => ({ receipt: { id: startId - index }, user: null }));

const { buildFeedPage, getPublicFeed } = await import("./db");

describe("buildFeedPage", () => {
  it("returns exactly the page size and a cursor when an extra row came back", () => {
    const page = buildFeedPage(rowsFor(13), 12);
    expect(page.items).toHaveLength(12);
    expect(page.nextCursor).toBe(89);
  });

  it("reports no cursor when the page is exactly full and nothing follows", () => {
    const page = buildFeedPage(rowsFor(12), 12);
    expect(page.items).toHaveLength(12);
    expect(page.nextCursor).toBeNull();
  });

  it("reports no cursor on a short final page", () => {
    const page = buildFeedPage(rowsFor(5), 12);
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it("handles an empty result", () => {
    expect(buildFeedPage([], 12)).toEqual({ items: [], nextCursor: null });
  });

  it("cursors strictly descend, so pages cannot repeat a row", () => {
    const first = buildFeedPage(rowsFor(13), 12);
    const second = buildFeedPage(rowsFor(13, first.nextCursor! - 1), 12);
    expect(second.items[0].receipt.id).toBeLessThan(first.nextCursor!);
  });

  it("redacts the joined user through toPublicUser", () => {
    const page = buildFeedPage(
      [{ receipt: { id: 1 }, user: { id: 2, openId: "secret", email: "e@x", username: "nia", name: "Nia", avatar: null, role: "user", loginMethod: "m", currentStreak: 0, longestStreak: 0, accuracy: 0, lastDailyDate: null, lastActiveDate: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } }],
      12,
    );
    expect(page.items[0].user).not.toHaveProperty("openId");
    expect(page.items[0].user).not.toHaveProperty("email");
    expect(page.items[0].user).toMatchObject({ username: "nia" });
  });
});

describe("getPublicFeed without a database", () => {
  it("returns an empty page rather than throwing", async () => {
    expect(await getPublicFeed({})).toEqual({ items: [], nextCursor: null });
  });
});
