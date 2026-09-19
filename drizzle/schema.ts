import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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

export const receipts = mysqlTable(
  "receipts",
  {
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
    // Chosen by the author at creation; decides which interactions the Receipt
    // offers. Nullable because Receipts written before this existed have no
    // author choice to record — see LEGACY_SEMANTIC_TYPE in
    // shared/interactionPolicy.ts for how they are read.
    semanticType: mysqlEnum("semanticType", ["PREDICTION", "GOAL", "PERSONAL", "FUN"]),
    // The Receipt this one was written after ("ME TOO"). The new Receipt is
    // independently authored and locked; this only records where it came from.
    derivedFromId: int("derivedFromId"),
    // Whether this Receipt is shown on public surfaces. Moderation never edits
    // or deletes a Receipt — the author cannot, and neither can an admin — so
    // a takedown flips this and leaves the record itself untouched. See
    // shared/moderation.ts.
    moderationStatus: mysqlEnum("moderationStatus", ["VISIBLE", "HIDDEN"]).default("VISIBLE").notNull(),
  },
  // The public feed reads `visibility = PUBLIC` newest-first, optionally
  // narrowed by category. Without these it is a table scan per page.
  (table) => [
    index("receipts_visibility_id").on(table.visibility, table.id),
    index("receipts_visibility_category_id").on(table.visibility, table.category, table.id),
    index("receipts_user_id").on(table.userId, table.id),
    // "Resolving soon": open public Receipts ordered by when reality is due to
    // answer them.
    index("receipts_visibility_status_resolution").on(table.visibility, table.status, table.resolutionDate),
    index("receipts_derived_from").on(table.derivedFromId),
  ],
);

/**
 * One person's recorded response to one Receipt.
 *
 * The type is stored explicitly rather than as a generic "reaction", because
 * supporting a goal and agreeing with a claim are different statements that
 * could never be separated again if they shared a counter. Which types a
 * Receipt accepts is decided by its semantic type; the server enforces it.
 *
 * ME TOO is deliberately absent: it authors a Receipt, it is not a response.
 */
export const receiptInteractions = mysqlTable(
  "receiptInteractions",
  {
    id: int("id").autoincrement().primaryKey(),
    receiptId: int("receiptId").notNull(),
    userId: int("userId").notNull(),
    type: mysqlEnum("type", ["AGREE", "DISAGREE", "SUPPORT", "REACT"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    // One response per person per Receipt: agreeing and then disagreeing
    // replaces the first answer rather than recording both.
    uniqueIndex("receiptInteractions_receipt_user").on(table.receiptId, table.userId),
    index("receiptInteractions_receipt_type").on(table.receiptId, table.type),
  ],
);

/**
 * One person's report of one Receipt.
 *
 * Reporting requires an account: the unique index below is what makes "one
 * report per person per Receipt" enforceable, and an anonymous report has no
 * key to deduplicate on and nobody to hold to it. People without an account
 * are pointed at the published abuse contact instead.
 *
 * Reports are never deleted. A dismissed report is a decision that was made,
 * and the next moderator looking at a repeat reporter needs to see it.
 */
export const receiptReports = mysqlTable(
  "receiptReports",
  {
    id: int("id").autoincrement().primaryKey(),
    receiptId: int("receiptId").notNull(),
    reporterId: int("reporterId").notNull(),
    reason: mysqlEnum("reason", [
      "HARASSMENT",
      "HATE",
      "VIOLENCE",
      "SEXUAL",
      "SELF_HARM",
      "PRIVACY",
      "IMPERSONATION",
      "SPAM",
      "ILLEGAL",
      "OTHER",
    ]).notNull(),
    detail: text("detail"),
    status: mysqlEnum("status", ["OPEN", "ACTIONED", "DISMISSED"]).default("OPEN").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
    resolvedBy: int("resolvedBy"),
  },
  (table) => [
    // Reporting twice is the same report, not two. Without this a single
    // person could manufacture a queue of complaints against one Receipt.
    uniqueIndex("receiptReports_receipt_reporter").on(table.receiptId, table.reporterId),
    // The moderation queue reads open reports newest-first.
    index("receiptReports_status_id").on(table.status, table.id),
    index("receiptReports_receipt_id").on(table.receiptId, table.id),
    // Rate limiting reads one reporter's recent rows.
    index("receiptReports_reporter_created").on(table.reporterId, table.createdAt),
  ],
);

/**
 * The audit trail. Every moderator decision appends a row — including the
 * decision to leave something up — and nothing here is ever updated or
 * removed, so the history of a Receipt's treatment is reconstructable.
 */
export const moderationActions = mysqlTable(
  "moderationActions",
  {
    id: int("id").autoincrement().primaryKey(),
    receiptId: int("receiptId").notNull(),
    moderatorId: int("moderatorId").notNull(),
    action: mysqlEnum("action", ["HIDE", "RESTORE", "DISMISS"]).notNull(),
    /** The moderation status the Receipt was left in, for a readable history. */
    resultingStatus: mysqlEnum("resultingStatus", ["VISIBLE", "HIDDEN"]).notNull(),
    note: text("note"),
    /** How many reports this decision closed. */
    reportsClosed: int("reportsClosed").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("moderationActions_receipt_id").on(table.receiptId, table.id)],
);

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
export type ReceiptInteraction = typeof receiptInteractions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ReceiptReport = typeof receiptReports.$inferSelect;
export type ModerationActionRow = typeof moderationActions.$inferSelect;
export type DailyActivity = typeof dailyActivity.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
