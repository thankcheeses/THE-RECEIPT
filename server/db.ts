import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, receipts, dailyChallenges, challenges, achievements, dailyActivity, notifications, analyticsEvents } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod", "username", "avatar"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  // Checked before the upsert so `signup` fires once, on the real first
  // sign-in, rather than on every subsequent one. Tracking it here covers all
  // three call sites (OAuth callback and both SDK paths) in one place.
  //
  // The auth SDK also calls this on every authenticated request with nothing
  // but `{ openId, lastSignedIn }` to refresh the timestamp. A new account is
  // never created by that call, so the probe is skipped for it rather than
  // costing a query per request.
  const isIdentitySync = Object.keys(user).some((key) => key !== "openId" && key !== "lastSignedIn");
  const isNewUser = isIdentitySync && !(await getUserByOpenId(user.openId));
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  if (isNewUser) {
    const created = await getUserByOpenId(user.openId);
    await trackEvent("signup", created?.id ?? null, { loginMethod: user.loginMethod ?? null });
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

export async function getDailyChallengeForDate(date: Date) {
  const db = await getDb();
  if (!db) return undefined;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const result = await db.select().from(dailyChallenges).where(and(gte(dailyChallenges.publishDate, start), lte(dailyChallenges.publishDate, end))).limit(1);
  return result[0];
}

export async function listReceiptsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(receipts).where(eq(receipts.userId, userId)).orderBy(desc(receipts.createdAt));
}

export async function getReceiptById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
  return result[0];
}

export async function getPublicReceipt(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({ receipt: receipts, user: users }).from(receipts).leftJoin(users, eq(receipts.userId, users.id)).where(and(eq(receipts.id, id), eq(receipts.visibility, "PUBLIC"))).limit(1);
  return result[0];
}

export async function getRecentPublicReceipts(limit = 6) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ receipt: receipts, user: users }).from(receipts).leftJoin(users, eq(receipts.userId, users.id)).where(eq(receipts.visibility, "PUBLIC")).orderBy(desc(receipts.createdAt)).limit(limit);
}

export async function getChallengeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({ challenge: challenges, receipt: receipts }).from(challenges).leftJoin(receipts, eq(challenges.receiptId, receipts.id)).where(eq(challenges.id, id)).limit(1);
  return result[0];
}

export async function listChallengesForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ challenge: challenges, receipt: receipts }).from(challenges).leftJoin(receipts, eq(challenges.receiptId, receipts.id)).where(or(eq(challenges.challengerId, userId), eq(challenges.challengedId, userId))).orderBy(desc(challenges.createdAt));
}

export async function getProfileStats(userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, resolved: 0, accuracy: 0, right: 0, pending: 0, biggestMiss: null, biggestCall: null, byCategory: [] };
  const all = await listReceiptsForUser(userId);
  const resolved = all.filter((r) => ["RIGHT", "WRONG", "PARTIALLY RIGHT"].includes(r.status));
  const right = resolved.filter((r) => r.status === "RIGHT");
  const accuracy = resolved.length ? Math.round((right.length / resolved.length) * 100) : 0;
  const byCategory = Object.entries(all.reduce<Record<string, { total: number; resolved: number; right: number }>>((acc, receipt) => {
    const current = acc[receipt.category] ?? { total: 0, resolved: 0, right: 0 };
    current.total++;
    if (["RIGHT", "WRONG", "PARTIALLY RIGHT"].includes(receipt.status)) current.resolved++;
    if (receipt.status === "RIGHT") current.right++;
    acc[receipt.category] = current;
    return acc;
  }, {})).map(([category, stats]) => ({ category, accuracy: stats.resolved ? Math.round((stats.right / stats.resolved) * 100) : 0, total: stats.total }));
  const misses = resolved.filter((r) => r.status === "WRONG").sort((a, b) => b.confidence - a.confidence);
  const calls = right.slice().sort((a, b) => b.confidence - a.confidence);
  return { total: all.length, resolved: resolved.length, accuracy, right: right.length, pending: all.length - resolved.length, biggestMiss: misses[0] ?? null, biggestCall: calls[0] ?? null, byCategory };
}

// ---------------------------------------------------------------------------
// Streaks & daily retention
// ---------------------------------------------------------------------------

/** Midnight local time for `date`, the grain every streak/retention query uses. */
export function startOfDay(date: Date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

const DAY_MS = 86_400_000;

/** Streak lengths worth recording an event for. Crossing one is a real moment. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 365];

/** Whole days between two midnights. */
export function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/**
 * Next streak value for a user answering today.
 *
 * Yesterday continues the run, today is a no-op (answering twice must not
 * double-count), anything older — or a first answer — starts over at 1.
 */
export function nextStreak(current: number, lastDailyDate: Date | null | undefined, today: Date) {
  if (!lastDailyDate) return 1;
  const gap = daysBetween(lastDailyDate, today);
  if (gap === 0) return Math.max(current, 1);
  if (gap === 1) return current + 1;
  return 1;
}

/**
 * Whether a receipt may be resolved yet.
 *
 * A receipt declares when reality is supposed to have answered it. Resolving
 * before that moment would let someone judge their own prediction early, which
 * is the one thing the record is meant to prevent — so resolution is allowed at
 * or after `resolutionDate`, and never before.
 */
export function canResolveAt(resolutionDate: Date | string, now: Date = new Date()) {
  return now.getTime() >= new Date(resolutionDate).getTime();
}

/**
 * Records that `userId` answered today's daily and advances their streak.
 * Idempotent per day: a second call the same day returns the stored streak.
 */
export async function recordDailyActivity(userId: number, dailyChallengeId: number | null, receiptId: number | null) {
  const db = await getDb();
  if (!db) return { currentStreak: 0, longestStreak: 0 };
  const today = startOfDay(new Date());
  const user = await getUserById(userId);
  if (!user) return { currentStreak: 0, longestStreak: 0 };

  const existing = await db
    .select()
    .from(dailyActivity)
    .where(and(eq(dailyActivity.userId, userId), eq(dailyActivity.activityDate, today)))
    .limit(1);
  if (existing[0]) return { currentStreak: user.currentStreak, longestStreak: user.longestStreak };

  const currentStreak = nextStreak(user.currentStreak, user.lastDailyDate, today);
  const longestStreak = Math.max(user.longestStreak, currentStreak);
  await db.insert(dailyActivity).values({ userId, activityDate: today, dailyChallengeId, receiptId, streakAfter: currentStreak });
  await db.update(users).set({ currentStreak, longestStreak, lastDailyDate: today }).where(eq(users.id, userId));
  if (STREAK_MILESTONES.includes(currentStreak)) {
    await trackEvent("streak_milestone", userId, { streak: currentStreak });
  }
  return { currentStreak, longestStreak };
}

/**
 * Which of the last `days` days the user answered, oldest first. Drives the
 * streak dots and is the per-user half of retention.
 */
export async function getDailyActivityWindow(userId: number, days = 7) {
  const db = await getDb();
  const today = startOfDay(new Date());
  const window = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - index));
    return date;
  });
  if (!db) return window.map((date) => ({ date, active: false }));
  const since = window[0];
  const rows = await db
    .select({ activityDate: dailyActivity.activityDate })
    .from(dailyActivity)
    .where(and(eq(dailyActivity.userId, userId), gte(dailyActivity.activityDate, since)));
  const active = new Set(rows.map((row) => startOfDay(row.activityDate).getTime()));
  return window.map((date) => ({ date, active: active.has(date.getTime()) }));
}

/**
 * Day-over-day retention across all users: for each of the last `days` days,
 * how many answered, and how many of them also answered the day before.
 */
export async function getRetentionSummary(days = 14) {
  const db = await getDb();
  if (!db) return [];
  const today = startOfDay(new Date());
  const since = new Date(today);
  since.setDate(since.getDate() - days);
  const rows = await db
    .select({ userId: dailyActivity.userId, activityDate: dailyActivity.activityDate })
    .from(dailyActivity)
    .where(gte(dailyActivity.activityDate, since));

  const byDay = new Map<number, Set<number>>();
  for (const row of rows) {
    const key = startOfDay(row.activityDate).getTime();
    if (!byDay.has(key)) byDay.set(key, new Set());
    byDay.get(key)!.add(row.userId);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - index));
    const actives = byDay.get(date.getTime()) ?? new Set<number>();
    const previous = byDay.get(date.getTime() - DAY_MS) ?? new Set<number>();
    const returning = Array.from(actives).filter((userId) => previous.has(userId)).length;
    return {
      date,
      active: actives.size,
      returning,
      retention: previous.size ? Math.round((returning / previous.size) * 100) : 0,
    };
  });
}

/**
 * Records that an authenticated user is active today, emitting `user_returned`
 * the first time they appear on a day later than their last active day.
 *
 * Writes at most once per user per day, and never throws into the request that
 * triggered it — a missed data point must not cost someone their page load.
 */
export async function recordUserReturn(user: { id: number; lastActiveDate?: Date | null }) {
  try {
    const db = await getDb();
    if (!db) return;
    const today = startOfDay(new Date());
    if (user.lastActiveDate && startOfDay(user.lastActiveDate).getTime() === today.getTime()) return;
    await db.update(users).set({ lastActiveDate: today }).where(eq(users.id, user.id));
    if (user.lastActiveDate) {
      await trackEvent("user_returned", user.id, { daysSinceLastActive: daysBetween(user.lastActiveDate, today) });
    }
  } catch (error) {
    console.warn("[Analytics] Failed to record return visit:", error);
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function createNotification(input: {
  userId: number;
  type: "CHALLENGE_RECEIVED" | "CHALLENGE_ACCEPTED" | "RECEIPT_RESOLVED";
  title: string;
  body?: string | null;
  linkPath?: string | null;
  actorId?: number | null;
  challengeId?: number | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    linkPath: input.linkPath ?? null,
    actorId: input.actorId ?? null,
    challengeId: input.challengeId ?? null,
  });
}

export async function listNotifications(userId: number, limit = 25) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function countUnreadNotifications(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(result[0]?.value ?? 0);
}

export async function markNotificationsRead(userId: number, ids?: number[]) {
  const db = await getDb();
  if (!db) return;
  const unread = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(ids?.length ? and(unread, inArray(notifications.id, ids)) : unread);
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * Appends a product analytics event. Never throws into a request path: a
 * failed write should cost a data point, not the user's action.
 */
export async function trackEvent(event: string, userId: number | null, properties?: Record<string, unknown>) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(analyticsEvents).values({
      event,
      userId,
      properties: properties ? JSON.stringify(properties) : null,
    });
  } catch (error) {
    console.warn("[Analytics] Failed to record event:", event, error);
  }
}

export async function getEventTotals(days = 30) {
  const db = await getDb();
  if (!db) return [];
  const since = startOfDay(new Date());
  since.setDate(since.getDate() - days);
  return db
    .select({ event: analyticsEvents.event, total: count() })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .groupBy(analyticsEvents.event);
}

export async function recordAchievement(userId: number, achievementType: string) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(achievements).where(and(eq(achievements.userId, userId), eq(achievements.achievementType, achievementType))).limit(1);
  if (!existing.length) await db.insert(achievements).values({ userId, achievementType });
}
