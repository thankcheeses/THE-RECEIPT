import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { eq } from "drizzle-orm";
import { receipts } from "../drizzle/schema";
import { buildReportPage, publicReceiptWhere } from "./db";
import {
  MODERATION_ACTIONS,
  REPORT_REASONS,
  isPubliclyVisible,
  reportStatusAfter,
  resolveModerationStatus,
  statusAfter,
} from "@shared/moderation";

const compile = (condition: ReturnType<typeof publicReceiptWhere>) =>
  new MySqlDialect().sqlToQuery(condition!);

/**
 * The one place every public surface composes its visibility rule. If this
 * stops constraining `moderationStatus`, a hidden receipt is public again on
 * the feed, the profile, the shared link, the card image and the ME TOO count
 * all at once — so it is asserted directly rather than through six callers.
 */
describe("publicReceiptWhere", () => {
  it("requires the author's PUBLIC and moderation's VISIBLE together", () => {
    const { sql, params } = compile(publicReceiptWhere());
    expect(sql).toContain("`visibility`");
    expect(sql).toContain("`moderationStatus`");
    expect(sql).toContain("and");
    expect(params).toEqual(["PUBLIC", "VISIBLE"]);
  });

  it("keeps both conditions when a caller adds its own", () => {
    const { sql, params } = compile(publicReceiptWhere(eq(receipts.category, "SPORTS")));
    expect(sql).toContain("`moderationStatus`");
    expect(params).toEqual(["PUBLIC", "VISIBLE", "SPORTS"]);
  });

  it("ignores absent optional conditions rather than dropping the rule", () => {
    const { params } = compile(publicReceiptWhere(undefined, eq(receipts.id, 4)));
    expect(params).toEqual(["PUBLIC", "VISIBLE", 4]);
  });
});

/**
 * The static demo has no SQL, so it filters with this predicate instead. Both
 * runtimes have to agree on what "public" means or the Pages build would show
 * a receipt the server hides.
 */
describe("isPubliclyVisible", () => {
  it("shows a public, unmoderated receipt", () => {
    expect(isPubliclyVisible({ visibility: "PUBLIC", moderationStatus: "VISIBLE" })).toBe(true);
  });

  it("hides a receipt taken down by a moderator", () => {
    expect(isPubliclyVisible({ visibility: "PUBLIC", moderationStatus: "HIDDEN" })).toBe(false);
  });

  it("hides a private receipt whatever moderation says", () => {
    expect(isPubliclyVisible({ visibility: "PRIVATE", moderationStatus: "VISIBLE" })).toBe(false);
    expect(isPubliclyVisible({ visibility: "PRIVATE", moderationStatus: "HIDDEN" })).toBe(false);
  });

  it("treats a receipt written before moderation existed as visible", () => {
    expect(isPubliclyVisible({ visibility: "PUBLIC", moderationStatus: null })).toBe(true);
    expect(isPubliclyVisible({ visibility: "PUBLIC" })).toBe(true);
  });
});

describe("resolveModerationStatus", () => {
  it("reads a stored status", () => {
    expect(resolveModerationStatus("HIDDEN")).toBe("HIDDEN");
    expect(resolveModerationStatus("VISIBLE")).toBe("VISIBLE");
  });

  it("falls back to VISIBLE rather than hiding the existing record", () => {
    for (const value of [null, undefined, "", "NONSENSE"]) {
      expect(resolveModerationStatus(value)).toBe("VISIBLE");
    }
  });
});

describe("what an action does", () => {
  it("hides, restores, or leaves the receipt where it is", () => {
    expect(statusAfter("HIDE")).toBe("HIDDEN");
    expect(statusAfter("RESTORE")).toBe("VISIBLE");
    expect(statusAfter("DISMISS")).toBeNull();
  });

  it("closes reports as actioned only when the receipt came down", () => {
    expect(reportStatusAfter("HIDE")).toBe("ACTIONED");
    expect(reportStatusAfter("RESTORE")).toBe("DISMISSED");
    expect(reportStatusAfter("DISMISS")).toBe("DISMISSED");
  });

  it("covers every action, so a new one cannot be added without a decision", () => {
    for (const action of MODERATION_ACTIONS) {
      expect(["ACTIONED", "DISMISSED"]).toContain(reportStatusAfter(action));
    }
  });
});

describe("report reasons", () => {
  it("are a closed vocabulary with no duplicates", () => {
    expect(new Set(REPORT_REASONS).size).toBe(REPORT_REASONS.length);
  });
});

// Same over-fetch contract as the public feed: ask for limit + 1, drop the
// extra, report the last returned id as the cursor.
const reportRows = (count: number, startId = 100) =>
  Array.from({ length: count }, (_, index) => ({
    report: { id: startId - index, reason: "SPAM" as const },
    receipt: { id: 1 },
    reporter: null,
  }));

describe("buildReportPage", () => {
  it("returns the page size and a cursor when an extra row came back", () => {
    const page = buildReportPage(reportRows(26), 25);
    expect(page.items).toHaveLength(25);
    expect(page.nextCursor).toBe(76);
  });

  it("reports no cursor on a short final page", () => {
    expect(buildReportPage(reportRows(3), 25).nextCursor).toBeNull();
  });

  it("handles an empty queue", () => {
    expect(buildReportPage([], 25)).toEqual({ items: [], nextCursor: null });
  });

  it("redacts the reporter, who is a user like any other", () => {
    const page = buildReportPage(
      [
        {
          report: { id: 1 },
          receipt: null,
          reporter: {
            id: 2,
            openId: "secret",
            email: "e@x",
            username: "nia",
            name: "Nia",
            avatar: null,
            role: "user" as const,
            loginMethod: "manus",
            currentStreak: 0,
            longestStreak: 0,
            accuracy: 0,
            lastDailyDate: null,
            lastActiveDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
          },
        },
      ],
      25,
    );
    expect(page.items[0].reporter).toMatchObject({ username: "nia" });
    expect(page.items[0].reporter).not.toHaveProperty("openId");
    expect(page.items[0].reporter).not.toHaveProperty("email");
  });

  it("passes a missing receipt through as null rather than dropping the report", () => {
    const page = buildReportPage([{ report: { id: 1 }, receipt: null, reporter: null }], 25);
    expect(page.items[0].receipt).toBeNull();
  });
});
