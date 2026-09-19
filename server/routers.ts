import { COOKIE_NAME } from "@shared/const";
import { CATEGORIES, DAILY_PROMPTS, getTodayPrompt, formatReceiptNumber } from "@shared/seed";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { challenges, dailyChallenges, receipts, users } from "../drizzle/schema";
import { canResolveAt, countUnreadNotifications, createNotification, recordUserReturn, getChallengeById, getDailyActivityWindow, getDb, getDailyChallengeForDate, getEventTotals, getProfileStats, getPublicReceipt, getRecentPublicReceipts, getReceiptById, getPublicFeed, getPublicProfileStats, getRetentionSummary, getUserById, getUserByUsername, listPublicReceiptsForUser, toPublicUser, listChallengesForUser, listNotifications, listReceiptsForUser, markNotificationsRead, recordAchievement, recordDailyActivity, trackEvent } from "./db";

const categorySchema = z.enum(CATEGORIES);
const statusSchema = z.enum(["RIGHT", "WRONG", "PARTIALLY RIGHT", "TOO EARLY"]);

// A closed vocabulary keeps the events table queryable — an open string field
// fills up with typos and one-off names that nobody can aggregate later.
export const ANALYTICS_EVENTS = [
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
] as const;
const analyticsEventSchema = z.enum(ANALYTICS_EVENTS);

async function ensureDailyChallenge() {
  const now = new Date();
  const existing = await getDailyChallengeForDate(now);
  if (existing) return existing;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
  const prompt = getTodayPrompt();
  const publishDate = new Date(now);
  publishDate.setHours(0, 0, 0, 0);
  const resolutionDate = new Date(publishDate);
  resolutionDate.setDate(resolutionDate.getDate() + prompt.resolutionDays);
  const inserted = await db.insert(dailyChallenges).values({ prompt: prompt.prompt, category: prompt.category, publishDate, resolutionDate, status: "OPEN" });
  return { id: Number(inserted[0].insertId), prompt: prompt.prompt, category: prompt.category, publishDate, resolutionDate, status: "OPEN" as const, createdAt: now };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async (opts) => {
      // The client calls this on every load, which makes it the natural place
      // to notice that someone came back on a later day.
      if (opts.ctx.user) await recordUserReturn(opts.ctx.user);
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  daily: router({
    get: publicProcedure.query(async () => ensureDailyChallenge()),
    answer: protectedProcedure.input(z.object({ answer: z.enum(["YES", "NO"]), confidence: z.number().int().min(0).max(100) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const daily = await ensureDailyChallenge();
      const existing = await db.select().from(receipts).where(and(eq(receipts.userId, ctx.user.id), eq(receipts.dailyChallengeId, daily.id))).limit(1);
      if (existing[0]) return existing[0];
      const result = await db.insert(receipts).values({ userId: ctx.user.id, prediction: `${input.answer} — ${daily.prompt}`, category: daily.category, confidence: input.confidence, resolutionDate: daily.resolutionDate, status: "LOCKED", visibility: "PUBLIC", dailyChallengeId: daily.id });
      await recordAchievement(ctx.user.id, "FIRST DAILY RECEIPT");
      const receipt = await getReceiptById(Number(result[0].insertId));
      if (!receipt) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Receipt was not created" });
      const streak = await recordDailyActivity(ctx.user.id, daily.id, receipt.id);
      await trackEvent("daily_answered", ctx.user.id, { answer: input.answer, confidence: input.confidence, streak: streak.currentStreak });
      return receipt;
    }),
    /** Streak + last-7-days activity for the daily page's header and dots. */
    status: protectedProcedure.query(async ({ ctx }) => {
      const daily = await ensureDailyChallenge();
      const user = (await getUserById(ctx.user.id)) ?? ctx.user;
      const db = await getDb();
      const answered = db
        ? (await db.select().from(receipts).where(and(eq(receipts.userId, ctx.user.id), eq(receipts.dailyChallengeId, daily.id))).limit(1))[0] ?? null
        : null;
      return {
        answered,
        currentStreak: user.currentStreak ?? 0,
        longestStreak: user.longestStreak ?? 0,
        week: await getDailyActivityWindow(ctx.user.id, 7),
      };
    }),
  }),

  receipts: router({
    recentPublic: publicProcedure.query(() => getRecentPublicReceipts()),
    publicById: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const result = await getPublicReceipt(input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "That receipt is private or no longer exists." });
      return result;
    }),
    /** Public discovery feed: newest first, optionally one category. */
    feed: publicProcedure
      .input(
        z
          .object({
            cursor: z.number().int().positive().optional(),
            category: categorySchema.optional(),
            limit: z.number().int().min(1).max(50).optional(),
          })
          .optional(),
      )
      .query(({ input }) => getPublicFeed(input ?? {})),
    mine: protectedProcedure.query(({ ctx }) => listReceiptsForUser(ctx.user.id)),
    create: protectedProcedure.input(z.object({ prediction: z.string().trim().min(8).max(280), category: categorySchema, resolutionDate: z.coerce.date(), confidence: z.number().int().min(0).max(100), visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"), challengeUsername: z.string().trim().max(40).optional() })).mutation(async ({ ctx, input }) => {
      if (input.resolutionDate.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Resolution date must be in the future." });
      if (input.challengeUsername && input.challengeUsername.toLowerCase() === (ctx.user.username ?? "").toLowerCase()) throw new TRPCError({ code: "BAD_REQUEST", message: "Challenge someone else, not yourself." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      let challengedUser;
      if (input.challengeUsername) {
        challengedUser = await getUserByUsername(input.challengeUsername);
        if (!challengedUser) throw new TRPCError({ code: "NOT_FOUND", message: "No user with that username yet." });
      }
      const result = await db.insert(receipts).values({ userId: ctx.user.id, prediction: input.prediction, category: input.category, confidence: input.confidence, resolutionDate: input.resolutionDate, status: "PENDING", visibility: input.visibility, challengeUserId: challengedUser?.id });
      const receiptId = Number(result[0].insertId);
      if (challengedUser) {
        const inserted = await db.insert(challenges).values({ receiptId, challengerId: ctx.user.id, challengedId: challengedUser.id, challengerPosition: input.prediction, challengerConfidence: input.confidence, status: "OPEN" });
        const challengeId = Number(inserted[0].insertId);
        const challenger = ctx.user.username ? `@${ctx.user.username}` : ctx.user.name || "Someone";
        await createNotification({
          userId: challengedUser.id,
          type: "CHALLENGE_RECEIVED",
          title: `${challenger} challenged you.`,
          body: input.prediction,
          linkPath: `/challenge/${challengeId}`,
          actorId: ctx.user.id,
          challengeId,
        });
        await trackEvent("challenge_created", ctx.user.id, { challengeId, challengedId: challengedUser.id });
      }
      await recordAchievement(ctx.user.id, "CALLER");
      const receipt = await getReceiptById(receiptId);
      if (!receipt) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Receipt was not created" });
      await trackEvent("receipt_created", ctx.user.id, { receiptId, category: input.category, confidence: input.confidence, visibility: input.visibility, challenged: Boolean(challengedUser) });
      return receipt;
    }),
    resolve: protectedProcedure.input(z.object({ id: z.number().int().positive(), result: statusSchema, note: z.string().trim().max(280).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const receipt = await getReceiptById(input.id);
      if (!receipt || receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only resolve your own receipts." });
      if (!["PENDING", "LOCKED"].includes(receipt.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This receipt is already resolved." });
      if (!canResolveAt(receipt.resolutionDate)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This receipt resolves on ${new Date(receipt.resolutionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Come back then.`,
        });
      }
      await db.update(receipts).set({ status: input.result, result: input.note ?? null, resolvedAt: new Date() }).where(eq(receipts.id, input.id));
      const stats = await getProfileStats(ctx.user.id);
      await db.update(users).set({ accuracy: stats.accuracy }).where(eq(users.id, ctx.user.id));
      if (input.result === "RIGHT") await recordAchievement(ctx.user.id, "CALLER");
      await trackEvent("receipt_resolved", ctx.user.id, { receiptId: input.id, result: input.result, confidence: receipt.confidence, category: receipt.category });
      return getReceiptById(input.id);
    }),
  }),

  profile: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user;
      const stats = await getProfileStats(user.id);
      return { user, stats, receipts: (await listReceiptsForUser(user.id)).slice(0, 6) };
    }),
    /**
     * Someone else's profile. Exposes only public receipts and the non-
     * identifying fields of the account; statistics are computed over public
     * receipts alone so nothing describes what the viewer cannot see.
     */
    byUsername: publicProcedure.input(z.object({ username: z.string().trim().min(1).max(40) })).query(async ({ input }) => {
      const user = await getUserByUsername(input.username);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "No caller with that username." });
      return {
        user: toPublicUser(user),
        stats: await getPublicProfileStats(user.id),
        receipts: await listPublicReceiptsForUser(user.id),
      };
    }),
    setUsername: protectedProcedure.input(z.object({ username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const existing = await getUserByUsername(input.username);
      if (existing && existing.id !== ctx.user.id) throw new TRPCError({ code: "CONFLICT", message: "That username is already taken." });
      await db.update(users).set({ username: input.username }).where(eq(users.id, ctx.user.id));
      return { username: input.username };
    }),
  }),

  challenges: router({
    list: protectedProcedure.query(({ ctx }) => listChallengesForUser(ctx.user.id)),
    get: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const item = await getChallengeById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Challenge not found." });
      return item;
    }),
    respond: protectedProcedure.input(z.object({ id: z.number().int().positive(), position: z.string().trim().min(8).max(280), confidence: z.number().int().min(0).max(100) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const item = await getChallengeById(input.id);
      if (!item || item.challenge.challengedId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "This challenge is not for you." });
      if (item.challenge.status !== "OPEN") throw new TRPCError({ code: "BAD_REQUEST", message: "You already answered this challenge." });
      await db.update(challenges).set({ challengedPosition: input.position, challengedConfidence: input.confidence, status: "ACCEPTED" }).where(eq(challenges.id, input.id));
      const responder = ctx.user.username ? `@${ctx.user.username}` : ctx.user.name || "Someone";
      await createNotification({
        userId: item.challenge.challengerId,
        type: "CHALLENGE_ACCEPTED",
        title: `${responder} took your challenge.`,
        body: input.position,
        linkPath: `/challenge/${input.id}`,
        actorId: ctx.user.id,
        challengeId: input.id,
      });
      await trackEvent("challenge_accepted", ctx.user.id, { challengeId: input.id, confidence: input.confidence });
      return getChallengeById(input.id);
    }),
  }),

  notifications: router({
    list: protectedProcedure.query(({ ctx }) => listNotifications(ctx.user.id)),
    unreadCount: protectedProcedure.query(({ ctx }) => countUnreadNotifications(ctx.user.id)),
    markRead: protectedProcedure
      .input(z.object({ ids: z.array(z.number().int().positive()).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        await markNotificationsRead(ctx.user.id, input?.ids);
        return { success: true } as const;
      }),
  }),

  analytics: router({
    /**
     * Client-reported events. Only for things the server cannot observe, such
     * as a share or a copied link; everything the server already handles is
     * tracked there instead, where it cannot be spoofed or missed.
     */
    track: publicProcedure
      .input(z.object({ event: analyticsEventSchema, properties: z.record(z.string(), z.unknown()).optional() }))
      .mutation(async ({ ctx, input }) => {
        await trackEvent(input.event, ctx.user?.id ?? null, input.properties);
        return { success: true } as const;
      }),
    /** Aggregate funnel + retention. Admin-only: it spans every user. */
    summary: adminProcedure.query(async () => ({
      events: await getEventTotals(30),
      retention: await getRetentionSummary(14),
    })),
  }),
});

export type AppRouter = typeof appRouter;
