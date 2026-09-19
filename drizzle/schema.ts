import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = typeof receipts.$inferInsert;
export type DailyChallenge = typeof dailyChallenges.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;
