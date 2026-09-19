import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, receipts, dailyChallenges, challenges, achievements, dailyActivity, notifications, analyticsEvents, receiptInteractions, receiptReports, moderationActions, retiredUsernames } from "../drizzle/schema";
import type { InteractionType } from "@shared/interactionPolicy";
import {
  MAX_REPORTS_PER_DAY,
  reportStatusAfter,
  statusAfter,
  type ModerationAction,
  type ReportReason,
  type ReportStatus,
} from "@shared/moderation";
import { normalizeUsername } from "@shared/accountDeletion";
import { ENV } from "./_core/env";

const RESOLVED_STATUSES: string[] = ["RIGHT", "WRONG", "PARTIALLY RIGHT"];

/**
 * Statuses a Receipt can still be resolved from.
 *
 * Shared by the `resolve` guard and by the due-notification query below. If
 * these drifted apart the bell would announce Receipts that resolve() refuses,
 * which is worse than no notification at all.
 */
export const RESOLVABLE_STATUSES = ["PENDING", "LOCKED"] as const;

/**
 * What it takes for a Receipt to be shown to the public: the author made it
 * public, AND moderation has not taken it down.
 *
 * Every public-facing query composes this rather than writing the conditions
 * out, so a new surface cannot accidentally ship without the moderation half.
 * It is filtered in SQL, not after the fetch, so keyset pages stay full.
 */
export function publicReceiptWhere(...extra: Array<SQL | undefined>) {
  return and(
    eq(receipts.visibility, "PUBLIC"),
    eq(receipts.moderationStatus, "VISIBLE"),
    ...extra,
  );
}

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

/**
 * One public Receipt and the person who wrote it.
 *
 * The joined user is redacted here, not by the caller. This row reaches
 * signed-out visitors through `receipts.publicById` and through the social
 * preview, so the raw `users` row — openId, email, login method, role — must
 * never leave this function.
 */
export async function getPublicReceipt(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({ receipt: receipts, user: users }).from(receipts).leftJoin(users, eq(receipts.userId, users.id)).where(publicReceiptWhere(eq(receipts.id, id))).limit(1);
  const row = result[0];
  return row && { receipt: row.receipt, user: toPublicUser(row.user) };
}

export async function getRecentPublicReceipts(limit = 6) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ receipt: receipts, user: users }).from(receipts).leftJoin(users, eq(receipts.userId, users.id)).where(publicReceiptWhere()).orderBy(desc(receipts.createdAt)).limit(limit);
  return rows.map((row) => ({ receipt: row.receipt, user: toPublicUser(row.user) }));
}

/**
 * A page of the public feed, newest first.
 *
 * Keyset pagination on `id`: the cursor is the last id of the previous page,
 * so pages stay stable while new receipts arrive — an OFFSET would shift rows
 * under the reader.
 */
export async function getPublicFeed(options: { cursor?: number; category?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null as number | null };
  const filters: Array<SQL | undefined> = [];
  if (options.category) filters.push(eq(receipts.category, options.category));
  if (options.cursor) filters.push(lt(receipts.id, options.cursor));
  // One extra row tells us whether another page exists without a count query.
  const rows = await db
    .select({ receipt: receipts, user: users })
    .from(receipts)
    .leftJoin(users, eq(receipts.userId, users.id))
    .where(publicReceiptWhere(...filters))
    .orderBy(desc(receipts.id))
    .limit(limit + 1);
  return buildFeedPage(rows, limit);
}

/**
 * Turns an over-fetched row set into a page.
 *
 * The caller asks the database for `limit + 1` rows; the extra one is the
 * signal that another page exists, and is dropped from the result. The cursor
 * is the last id actually returned, so the next query resumes below it.
 */
export function buildFeedPage(
  rows: Array<{ receipt: { id: number }; user?: Parameters<typeof toPublicUser>[0] }>,
  limit: number,
) {
  const items = rows.slice(0, limit);
  return {
    items: items.map((row) => ({ receipt: row.receipt, user: toPublicUser(row.user) })),
    nextCursor: rows.length > limit ? (items[items.length - 1]?.receipt.id ?? null) : null,
  };
}

/**
 * The subset of a user row that may be shown to anyone. Everything omitted —
 * openId, email, role, sign-in timestamps — is either identifying or internal.
 */
export function toPublicUser(user: typeof users.$inferSelect | null | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatar: user.avatar,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    accuracy: user.accuracy,
    createdAt: user.createdAt,
  };
}

export async function listPublicReceiptsForUser(userId: number, limit = 12) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(receipts)
    .where(publicReceiptWhere(eq(receipts.userId, userId)))
    .orderBy(desc(receipts.id))
    .limit(limit);
}

/**
 * Profile statistics computed over public receipts only.
 *
 * getProfileStats() spans everything a user has written, which is right for
 * their own profile and wrong for a public one: aggregates over private rows
 * would describe predictions the viewer is not allowed to see.
 */
export async function getPublicProfileStats(userId: number) {
  const all = await listPublicReceiptsForUser(userId, 1000);
  const resolved = all.filter((receipt) => RESOLVED_STATUSES.includes(receipt.status));
  const right = resolved.filter((receipt) => receipt.status === "RIGHT");
  const accuracy = resolved.length ? Math.round((right.length / resolved.length) * 100) : 0;
  const byCategory = Object.entries(
    all.reduce<Record<string, { total: number; resolved: number; right: number }>>((acc, receipt) => {
      const current = acc[receipt.category] ?? { total: 0, resolved: 0, right: 0 };
      current.total++;
      if (RESOLVED_STATUSES.includes(receipt.status)) current.resolved++;
      if (receipt.status === "RIGHT") current.right++;
      acc[receipt.category] = current;
      return acc;
    }, {}),
  ).map(([category, stats]) => ({
    category,
    accuracy: stats.resolved ? Math.round((stats.right / stats.resolved) * 100) : 0,
    total: stats.total,
  }));
  return {
    total: all.length,
    resolved: resolved.length,
    right: right.length,
    pending: all.length - resolved.length,
    accuracy,
    byCategory,
  };
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
// Receipt interactions
// ---------------------------------------------------------------------------

/**
 * Records one person's response to a Receipt, replacing any previous one.
 *
 * The caller is responsible for checking the interaction against the Receipt's
 * semantic type first; this only writes.
 */
export async function setInteraction(receiptId: number, userId: number, type: InteractionType) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(receiptInteractions)
    .values({ receiptId, userId, type })
    .onDuplicateKeyUpdate({ set: { type, createdAt: new Date() } });
}

/** Withdraws a response. Pressing the same button again means "never mind". */
export async function clearInteraction(receiptId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(receiptInteractions)
    .where(and(eq(receiptInteractions.receiptId, receiptId), eq(receiptInteractions.userId, userId)));
}

/** Totals per interaction type. Types with no responses are absent, not zero. */
export async function getInteractionCounts(receiptId: number) {
  const db = await getDb();
  if (!db) return {} as Record<string, number>;
  const rows = await db
    .select({ type: receiptInteractions.type, total: count() })
    .from(receiptInteractions)
    .where(eq(receiptInteractions.receiptId, receiptId))
    .groupBy(receiptInteractions.type);
  return Object.fromEntries(rows.map((row) => [row.type, Number(row.total)])) as Record<string, number>;
}

export async function getViewerInteraction(receiptId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ type: receiptInteractions.type })
    .from(receiptInteractions)
    .where(and(eq(receiptInteractions.receiptId, receiptId), eq(receiptInteractions.userId, userId)))
    .limit(1);
  return rows[0]?.type ?? null;
}

/**
 * Turns per-status counts into the cluster a Receipt shows.
 *
 * Pure, so the arithmetic is testable without a database. The buckets are the
 * Receipt statuses that already exist — nothing here invents a new resolution
 * model, and an unrecognised status is counted in the total but in no bucket
 * rather than being silently folded into one it does not belong to.
 */
export function summarizeCluster(rows: Array<{ status: string; total: number | string }>) {
  const bucket = { open: 0, right: 0, wrong: 0, partial: 0, tooEarly: 0 };
  let total = 0;
  for (const row of rows) {
    const n = Number(row.total) || 0;
    total += n;
    if (row.status === "PENDING" || row.status === "LOCKED") bucket.open += n;
    else if (row.status === "RIGHT") bucket.right += n;
    else if (row.status === "WRONG") bucket.wrong += n;
    else if (row.status === "PARTIALLY RIGHT") bucket.partial += n;
    else if (row.status === "TOO EARLY") bucket.tooEarly += n;
  }
  return { total, ...bucket, resolved: bucket.right + bucket.wrong + bucket.partial + bucket.tooEarly };
}

/**
 * The ME TOO cluster for one Receipt: the independently authored Receipts
 * written after it, and how they have turned out so far.
 *
 * Every member is a real Receipt someone locked themselves — this counts rows
 * in `receipts`, never interactions, so it cannot be inflated by a reaction or
 * by reading the page twice.
 *
 * It composes publicReceiptWhere(), so a private or taken-down ME TOO is
 * absent for everyone, including its own author: the count is a public fact
 * and must read the same to every viewer. The original Receipt cannot count
 * itself, because a Receipt's derivedFromId never points at itself.
 *
 * A member whose author deleted their account still counts. The call was
 * genuinely made and independently locked; only the person behind it is gone.
 */
export async function getMeTooCluster(receiptId: number) {
  const db = await getDb();
  if (!db) return summarizeCluster([]);
  const rows = await db
    .select({ status: receipts.status, total: count() })
    .from(receipts)
    .where(publicReceiptWhere(eq(receipts.derivedFromId, receiptId)))
    .groupBy(receipts.status);
  return summarizeCluster(rows);
}

// ---------------------------------------------------------------------------
// Resolving soon
// ---------------------------------------------------------------------------

/**
 * Open public Receipts whose resolution date is closest, soonest first.
 *
 * This is the product's own source of anticipation: the person already has
 * something unresolved, so nothing has to be manufactured to bring them back.
 * Served by the (visibility, status, resolutionDate) index.
 */
/**
 * What "resolving soon" means, as one condition.
 *
 * Public, not hidden, still open, due in the future — and still owned by
 * somebody. Only the author may resolve a Receipt, so one whose author deleted
 * their account never will be; listing it here would promise an answer that is
 * not coming.
 */
export function resolvingSoonWhere(now: Date) {
  return publicReceiptWhere(
    inArray(receipts.status, ["PENDING", "LOCKED"]),
    gte(receipts.resolutionDate, now),
    isNotNull(receipts.userId),
  );
}

export async function getResolvingSoon(options: { limit?: number; now?: Date } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);
  const db = await getDb();
  if (!db) return [];
  const now = options.now ?? new Date();
  const rows = await db
    .select({ receipt: receipts, user: users })
    .from(receipts)
    .leftJoin(users, eq(receipts.userId, users.id))
    .where(resolvingSoonWhere(now))
    .orderBy(asc(receipts.resolutionDate))
    .limit(limit);
  return rows.map((row) => ({ receipt: row.receipt, user: toPublicUser(row.user) }));
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function createNotification(input: {
  userId: number;
  type: "CHALLENGE_RECEIVED" | "CHALLENGE_ACCEPTED" | "RECEIPT_RESOLVED" | "RECEIPT_DUE";
  title: string;
  body?: string | null;
  linkPath?: string | null;
  actorId?: number | null;
  challengeId?: number | null;
  receiptId?: number | null;
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
    receiptId: input.receiptId ?? null,
  });
}

/**
 * How many Receipts one sync may announce. A person returning after a long gap
 * could have many at once; the rest arrive on the next poll rather than in one
 * unbounded write.
 */
const MAX_DUE_NOTIFICATIONS_PER_SYNC = 25;

/** The title and body a due Receipt gets. Pure, so the wording is testable. */
export function buildDueNotification(receipt: { id: number; prediction: string }) {
  return {
    title: `Receipt #${String(receipt.id).padStart(6, "0")} is ready to resolve.`,
    body: receipt.prediction,
    // The owner view, which carries the resolve controls. The public view at
    // /r/:id has none, so linking there would be a dead end.
    linkPath: `/receipt/${receipt.id}`,
  };
}

/**
 * Creates the "ready to resolve" notification for any of this person's
 * Receipts that have come due and do not have one yet.
 *
 * There is no scheduler in this application, so this runs on the notification
 * read path — the bell already polls it. That makes idempotence the whole
 * design: the unique index on (userId, type, receiptId) is what guarantees one
 * notification per Receipt ever, rather than the absence check below, which is
 * only an optimisation. Two concurrent polls both passing that check is
 * exactly the race the index exists to lose.
 *
 * Eligibility deliberately mirrors what `receipts.resolve` accepts: authored
 * by this person, still open, and past its resolution date. A Receipt whose
 * author deleted their account has a null userId and matches nothing here.
 *
 * Never throws into the request: a missed notification must not cost someone
 * their page load.
 */
export async function syncResolutionNotifications(userId: number, now: Date = new Date()) {
  try {
    const db = await getDb();
    if (!db) return 0;

    const due = await db
      .select({ id: receipts.id, prediction: receipts.prediction })
      .from(receipts)
      .leftJoin(
        notifications,
        and(
          eq(notifications.receiptId, receipts.id),
          eq(notifications.userId, userId),
          eq(notifications.type, "RECEIPT_DUE"),
        ),
      )
      .where(
        and(
          eq(receipts.userId, userId),
          inArray(receipts.status, [...RESOLVABLE_STATUSES]),
          lte(receipts.resolutionDate, now),
          isNull(notifications.id),
        ),
      )
      .orderBy(asc(receipts.resolutionDate))
      .limit(MAX_DUE_NOTIFICATIONS_PER_SYNC);

    if (!due.length) return 0;

    await db
      .insert(notifications)
      .values(
        due.map((receipt) => ({
          userId,
          type: "RECEIPT_DUE" as const,
          receiptId: receipt.id,
          ...buildDueNotification(receipt),
        })),
      )
      // A no-op on conflict: the row another request just inserted stands.
      .onDuplicateKeyUpdate({ set: { type: "RECEIPT_DUE" } });

    return due.length;
  } catch (error) {
    console.warn("[Notifications] Failed to sync resolution notifications:", error);
    return 0;
  }
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

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

/**
 * How many Receipts this person has reported since midnight.
 *
 * The unique index already stops the same Receipt being reported twice by the
 * same person; this is the other shape of abuse — one person filing against
 * many Receipts to bury someone.
 */
export async function countReportsToday(reporterId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ value: count() })
    .from(receiptReports)
    .where(and(eq(receiptReports.reporterId, reporterId), gte(receiptReports.createdAt, startOfDay(new Date()))));
  return Number(rows[0]?.value ?? 0);
}

export async function getReportByReporter(receiptId: number, reporterId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(receiptReports)
    .where(and(eq(receiptReports.receiptId, receiptId), eq(receiptReports.reporterId, reporterId)))
    .limit(1);
  return rows[0];
}

/**
 * Files a report, or reports that one already exists.
 *
 * Reporting the same Receipt again is the same report, not a second one — the
 * unique index enforces it and this returns `created: false` rather than an
 * error, so a double tap reads as "thanks, already logged" instead of a
 * failure the reporter has to interpret.
 */
export async function createReceiptReport(input: {
  receiptId: number;
  reporterId: number;
  reason: ReportReason;
  detail?: string | null;
}): Promise<{ created: boolean; rateLimited: boolean }> {
  const db = await getDb();
  if (!db) return { created: false, rateLimited: false };
  if (await getReportByReporter(input.receiptId, input.reporterId)) {
    return { created: false, rateLimited: false };
  }
  if ((await countReportsToday(input.reporterId)) >= MAX_REPORTS_PER_DAY) {
    return { created: false, rateLimited: true };
  }
  await db.insert(receiptReports).values({
    receiptId: input.receiptId,
    reporterId: input.reporterId,
    reason: input.reason,
    detail: input.detail ?? null,
  });
  return { created: true, rateLimited: false };
}

/** Open reports against one Receipt. Drives the "already flagged" count. */
export async function countOpenReports(receiptId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ value: count() })
    .from(receiptReports)
    .where(and(eq(receiptReports.receiptId, receiptId), eq(receiptReports.status, "OPEN")));
  return Number(rows[0]?.value ?? 0);
}

/**
 * The moderation queue: reports with the Receipt they are about and the
 * reporter, newest first, keyset-paginated like the public feed.
 *
 * Deliberately not filtered by the Receipt's visibility — a private Receipt
 * can still be reported by someone who saw it while it was public, and a
 * hidden one still needs its history readable.
 */
export async function getReportQueue(options: { status?: ReportStatus; cursor?: number; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null as number | null };
  const filters = [] as Array<SQL | undefined>;
  if (options.status) filters.push(eq(receiptReports.status, options.status));
  if (options.cursor) filters.push(lt(receiptReports.id, options.cursor));
  const rows = await db
    .select({ report: receiptReports, receipt: receipts, reporter: users })
    .from(receiptReports)
    .leftJoin(receipts, eq(receiptReports.receiptId, receipts.id))
    .leftJoin(users, eq(receiptReports.reporterId, users.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(receiptReports.id))
    .limit(limit + 1);
  return buildReportPage(rows, limit);
}

/**
 * Turns an over-fetched report row set into a page.
 *
 * Same contract as buildFeedPage, and pure for the same reason. The reporter
 * is redacted through toPublicUser: a moderator needs to recognise a repeat
 * reporter, not to read their email address.
 */
export function buildReportPage<Report extends { id: number }, Receipt>(
  rows: Array<{ report: Report; receipt?: Receipt | null; reporter?: Parameters<typeof toPublicUser>[0] }>,
  limit: number,
) {
  const items = rows.slice(0, limit);
  return {
    items: items.map((row) => ({
      report: row.report,
      receipt: row.receipt ?? null,
      reporter: toPublicUser(row.reporter),
    })),
    nextCursor: rows.length > limit ? (items[items.length - 1]?.report.id ?? null) : null,
  };
}

/** The decisions taken against one Receipt, newest first. */
export async function listModerationActions(receiptId: number, limit = 25) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(moderationActions)
    .where(eq(moderationActions.receiptId, receiptId))
    .orderBy(desc(moderationActions.id))
    .limit(limit);
}

/**
 * Applies a moderator's decision: sets the Receipt's moderation status where
 * the action changes it, closes the Receipt's open reports, and appends one
 * audit row.
 *
 * Nothing here deletes or edits the Receipt. HIDE takes it off public
 * surfaces; the row, its interactions, and its lineage all stay exactly as
 * they were, which is what lets RESTORE be a genuine undo.
 */
export async function applyModerationAction(input: {
  receiptId: number;
  moderatorId: number;
  action: ModerationAction;
  note?: string | null;
}) {
  const db = await getDb();
  if (!db) return null;
  const receipt = await getReceiptById(input.receiptId);
  if (!receipt) return null;

  const nextStatus = statusAfter(input.action);
  const resultingStatus = nextStatus ?? receipt.moderationStatus;
  if (nextStatus && nextStatus !== receipt.moderationStatus) {
    await db.update(receipts).set({ moderationStatus: nextStatus }).where(eq(receipts.id, input.receiptId));
  }

  const reportsClosed = await countOpenReports(input.receiptId);
  if (reportsClosed) {
    await db
      .update(receiptReports)
      .set({ status: reportStatusAfter(input.action), resolvedAt: new Date(), resolvedBy: input.moderatorId })
      .where(and(eq(receiptReports.receiptId, input.receiptId), eq(receiptReports.status, "OPEN")));
  }

  await db.insert(moderationActions).values({
    receiptId: input.receiptId,
    moderatorId: input.moderatorId,
    action: input.action,
    resultingStatus,
    note: input.note ?? null,
    reportsClosed,
  });

  return { receiptId: input.receiptId, moderationStatus: resultingStatus, reportsClosed };
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/** Whether this username belonged to an account that has since been deleted. */
export async function isUsernameRetired(username: string) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: retiredUsernames.id })
    .from(retiredUsernames)
    .where(eq(retiredUsernames.username, normalizeUsername(username)))
    .limit(1);
  return rows.length > 0;
}

/** Whether a username may be claimed: not held by anyone, and not retired. */
export async function isUsernameAvailable(username: string, forUserId: number) {
  const existing = await getUserByUsername(username);
  if (existing && existing.id !== forUserId) return false;
  return !(await isUsernameRetired(username));
}

/**
 * Deletes an account and severs every reference to it.
 *
 * What survives is what other people took part in: public Receipts they
 * responded to, the counts on them, the challenges they answered, and the
 * moderation record. What goes is the account and every thread back to it.
 *
 * The author reference becomes NULL rather than pointing at a stand-in, so
 * nothing groups the deleted person's Receipts together — `receipts.userId`
 * is public, and any surviving id would be exactly the stable pseudonym this
 * is meant to prevent.
 *
 * Order matters: every reference is cleared before the `users` row goes, so a
 * failure part-way leaves orphans pointing at a live account rather than a
 * missing one.
 */
export async function deleteAccount(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const user = await getUserById(userId);
  if (!user) return null;

  // Private Receipts are account data, not public record, so they go. The one
  // exception is a private Receipt that anchors a challenge: deleting it would
  // destroy the other party's position and confidence along with it, and those
  // are not this person's to erase. Those are anonymised and stay PRIVATE, so
  // they remain absent from every public surface.
  const ownRows = await db
    .select({ id: receipts.id, visibility: receipts.visibility })
    .from(receipts)
    .where(eq(receipts.userId, userId));
  const privateIds = ownRows.filter((row) => row.visibility === "PRIVATE").map((row) => row.id);
  // A private Receipt is kept — detached, and still PRIVATE, so absent from
  // every public surface — when another record depends on it:
  //
  //  - a challenge, whose other party's position and confidence are not this
  //    person's to erase, and
  //  - a report or a moderation decision, because that evidence is never
  //    deleted and would be unreadable pointing at a Receipt that is gone.
  //
  // Neither should be reachable for a private Receipt through the current API,
  // but deletion is irreversible, so it checks rather than assumes.
  const referenced = privateIds.length
    ? new Set(
        [
          ...(await db.select({ id: challenges.receiptId }).from(challenges).where(inArray(challenges.receiptId, privateIds))),
          ...(await db.select({ id: receiptReports.receiptId }).from(receiptReports).where(inArray(receiptReports.receiptId, privateIds))),
          ...(await db.select({ id: moderationActions.receiptId }).from(moderationActions).where(inArray(moderationActions.receiptId, privateIds))),
        ].map((row) => row.id),
      )
    : new Set<number>();
  const deletableIds = privateIds.filter((id) => !referenced.has(id));

  if (deletableIds.length) {
    // Responses to a Receipt that is about to disappear. Unlike reports and
    // audit rows these are not evidence of anything, so they go with it.
    await db.delete(receiptInteractions).where(inArray(receiptInteractions.receiptId, deletableIds));
    await db.update(receipts).set({ derivedFromId: null }).where(inArray(receipts.derivedFromId, deletableIds));
    await db.delete(receipts).where(inArray(receipts.id, deletableIds));
  }

  // Everything still authored by them — public, plus any private Receipt held
  // back above — loses its author.
  await db.update(receipts).set({ userId: null }).where(eq(receipts.userId, userId));
  // Receipts by other people that named this person as the challenged party.
  await db.update(receipts).set({ challengeUserId: null }).where(eq(receipts.challengeUserId, userId));

  // Their responses stay so other people's counts do not silently drop.
  await db.update(receiptInteractions).set({ userId: null }).where(eq(receiptInteractions.userId, userId));

  // Each side of a challenge is cleared independently; the other party keeps
  // their words, their confidence and the record that it happened.
  await db.update(challenges).set({ challengerId: null }).where(eq(challenges.challengerId, userId));
  await db.update(challenges).set({ challengedId: null }).where(eq(challenges.challengedId, userId));

  // Their inbox goes. So does anyone else's notification *about* them: the
  // title is built as literal text ("@nia challenged you."), so the handle
  // would survive the account otherwise.
  await db.delete(notifications).where(eq(notifications.userId, userId));
  await db.delete(notifications).where(eq(notifications.actorId, userId));

  // Aggregates survive, the person does not.
  await db.update(analyticsEvents).set({ userId: null }).where(eq(analyticsEvents.userId, userId));

  // Purely account-level: nothing public reads either of these.
  await db.delete(achievements).where(eq(achievements.userId, userId));
  await db.delete(dailyActivity).where(eq(dailyActivity.userId, userId));

  // Moderation records are evidence about other people's content and outlive
  // any one participant — including a moderator who closes their own account.
  await db.update(receiptReports).set({ reporterId: null }).where(eq(receiptReports.reporterId, userId));
  await db.update(receiptReports).set({ resolvedBy: null }).where(eq(receiptReports.resolvedBy, userId));
  await db.update(moderationActions).set({ moderatorId: null }).where(eq(moderationActions.moderatorId, userId));

  // The handle is retired before the row goes, so it can never be claimed
  // again by anyone — including the same person signing up afresh.
  if (user.username) {
    await db
      .insert(retiredUsernames)
      .values({ username: normalizeUsername(user.username) })
      .onDuplicateKeyUpdate({ set: { username: normalizeUsername(user.username) } });
  }

  await db.delete(users).where(eq(users.id, userId));

  return {
    deletedPrivateReceipts: deletableIds.length,
    anonymizedReceipts: ownRows.length - deletableIds.length,
    usernameRetired: Boolean(user.username),
  };
}
