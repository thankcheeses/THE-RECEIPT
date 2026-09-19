import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, receipts, dailyChallenges, challenges, achievements } from "../drizzle/schema";
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
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
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

export async function recordAchievement(userId: number, achievementType: string) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(achievements).where(and(eq(achievements.userId, userId), eq(achievements.achievementType, achievementType))).limit(1);
  if (!existing.length) await db.insert(achievements).values({ userId, achievementType });
}
