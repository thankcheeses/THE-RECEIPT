import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  username: varchar("username", { length: 40 }),
  avatar: varchar("avatar", { length: 500 }),
  currentStreak: int("currentStreak").default(0).notNull(),
  longestStreak: int("longestStreak").default(0).notNull(),
  // Midnight of the day the user last answered a daily challenge. Streaks are
  // derived from the gap between this and today, so they survive restarts and
  // never need a backfill job.
  lastDailyDate: timestamp("lastDailyDate"),
  // Midnight of the day this user was last active. `lastSignedIn` is refreshed
  // on every authenticated request by the auth SDK, so it cannot distinguish a
  // return visit from a page load; this can.
  lastActiveDate: timestamp("lastActiveDate"),
  accuracy: int("accuracy").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const dailyChallenges = mysqlTable("dailyChallenges", {
  id: int("id").autoincrement().primaryKey(),
  prompt: text("prompt").notNull(),
  category: varchar("category", { length: 32 }).notNull(),
  publishDate: timestamp("publishDate").notNull(),
  resolutionDate: timestamp("resolutionDate").notNull(),
  status: mysqlEnum("status", ["OPEN", "CLOSED"]).default("OPEN").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const receipts = mysqlTable("receipts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  prediction: text("prediction").notNull(),
  category: varchar("category", { length: 32 }).notNull(),
  confidence: int("confidence").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolutionDate: timestamp("resolutionDate").notNull(),
  status: mysqlEnum("status", ["LOCKED", "PENDING", "RIGHT", "WRONG", "PARTIALLY RIGHT", "TOO EARLY"]).default("PENDING").notNull(),
  result: text("result"),
  visibility: mysqlEnum("visibility", ["PUBLIC", "PRIVATE"]).default("PUBLIC").notNull(),
  challengeUserId: int("challengeUserId"),
  dailyChallengeId: int("dailyChallengeId"),
  resolvedAt: timestamp("resolvedAt"),
});

export const challenges = mysqlTable("challenges", {
  id: int("id").autoincrement().primaryKey(),
  receiptId: int("receiptId").notNull(),
  challengerId: int("challengerId").notNull(),
  challengedId: int("challengedId").notNull(),
  challengerPosition: text("challengerPosition").notNull(),
  challengerConfidence: int("challengerConfidence").notNull(),
  challengedPosition: text("challengedPosition"),
  challengedConfidence: int("challengedConfidence"),
  status: mysqlEnum("status", ["OPEN", "ACCEPTED", "RESOLVED"]).default("OPEN").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const achievements = mysqlTable("achievements", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  achievementType: varchar("achievementType", { length: 64 }).notNull(),
  earnedAt: timestamp("earnedAt").defaultNow().notNull(),
});

/**
 * One row per user per day they answered the daily challenge. Streaks could be
 * derived from `receipts` alone, but a dedicated day-grained table is what makes
 * retention (how many of Monday's answerers came back Tuesday) a cheap query
 * instead of a scan over every receipt.
 */
export const dailyActivity = mysqlTable(
  "dailyActivity",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    activityDate: timestamp("activityDate").notNull(),
    dailyChallengeId: int("dailyChallengeId"),
    receiptId: int("receiptId"),
    streakAfter: int("streakAfter").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("dailyActivity_user_date").on(table.userId, table.activityDate)],
);

/** In-app notifications. Currently driven by challenge create/accept. */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["CHALLENGE_RECEIVED", "CHALLENGE_ACCEPTED", "RECEIPT_RESOLVED"]).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body"),
  linkPath: varchar("linkPath", { length: 200 }),
  actorId: int("actorId"),
  challengeId: int("challengeId"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Product analytics. Deliberately append-only and free of PII beyond the user
 * id, so it can be dropped or exported without touching application tables.
 */
export const analyticsEvents = mysqlTable("analyticsEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  event: varchar("event", { length: 64 }).notNull(),
  properties: text("properties"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = typeof receipts.$inferInsert;
export type DailyChallenge = typeof dailyChallenges.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type DailyActivity = typeof dailyActivity.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
