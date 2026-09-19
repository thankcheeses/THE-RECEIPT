import { COOKIE_NAME } from "@shared/const";
import { CATEGORIES, DAILY_PROMPTS, getTodayPrompt, formatReceiptNumber } from "@shared/seed";
import { INTERACTION_TYPES, SEMANTIC_TYPES, allowsInteraction, defaultSemanticTypeFor, resolveSemanticType } from "@shared/interactionPolicy";
import { MAX_REPORT_DETAIL, MODERATION_ACTIONS, REPORT_REASONS, REPORT_STATUSES } from "@shared/moderation";
import { USERNAME_UNAVAILABLE } from "@shared/accountDeletion";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { challenges, dailyChallenges, receipts, users } from "../drizzle/schema";
import { RESOLVABLE_STATUSES, syncResolutionNotifications, deleteAccount, isUsernameAvailable, applyModerationAction, countOpenReports, createReceiptReport, getReportByReporter, getReportQueue, listModerationActions, canResolveAt, clearInteraction, countUnreadNotifications, createNotification, getDerivedCount, getInteractionCounts, getResolvingSoon, getViewerInteraction, recordUserReturn, setInteraction, getChallengeById, getDailyActivityWindow, getDb, getDailyChallengeForDate, getEventTotals, getProfileStats, getPublicReceipt, getRecentPublicReceipts, getReceiptById, getPublicFeed, getPublicProfileStats, getRetentionSummary, getUserById, getUserByUsername, listPublicReceiptsForUser, toPublicUser, listChallengesForUser, listNotifications, listReceiptsForUser, markNotificationsRead, recordAchievement, recordDailyActivity, trackEvent } from "./db";

const categorySchema = z.enum(CATEGORIES);
const semanticTypeSchema = z.enum(SEMANTIC_TYPES);
const interactionSchema = z.enum(INTERACTION_TYPES);
const statusSchema = z.enum(["RIGHT", "WRONG", "PARTIALLY RIGHT", "TOO EARLY"]);
const reportReasonSchema = z.enum(REPORT_REASONS);
const reportStatusSchema = z.enum(REPORT_STATUSES);
const moderationActionSchema = z.enum(MODERATION_ACTIONS);

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
    /** Open public Receipts, soonest resolution first. */
    resolvingSoon: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
      .query(({ input }) => getResolvingSoon({ limit: input?.limit })),
    /** Counts per interaction type, the viewer's own response, and ME TOO lineage. */
    interactions: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const result = await getPublicReceipt(input.id);
      if (!result?.receipt) throw new TRPCError({ code: "NOT_FOUND", message: "That receipt is private or no longer exists." });
      return {
        counts: await getInteractionCounts(input.id),
        mine: ctx.user ? await getViewerInteraction(input.id, ctx.user.id) : null,
        derivedCount: await getDerivedCount(input.id),
      };
    }),
    /**
     * Records or withdraws a response. The Receipt's semantic type decides what
     * is acceptable, and this check is the authoritative one — the client's
     * buttons are a convenience, not the rule.
     */
    interact: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), type: interactionSchema.nullable() }))
      .mutation(async ({ ctx, input }) => {
        const result = await getPublicReceipt(input.id);
        if (!result?.receipt) throw new TRPCError({ code: "NOT_FOUND", message: "That receipt is private or no longer exists." });
        if (input.type === null) {
          await clearInteraction(input.id, ctx.user.id);
          return { counts: await getInteractionCounts(input.id), mine: null };
        }
        if (!allowsInteraction(result.receipt.semanticType, input.type)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `A ${resolveSemanticType(result.receipt.semanticType).toLowerCase()} receipt does not take that response.`,
          });
        }
        await setInteraction(input.id, ctx.user.id, input.type);
        return { counts: await getInteractionCounts(input.id), mine: input.type };
      }),
    mine: protectedProcedure.query(({ ctx }) => listReceiptsForUser(ctx.user.id)),
    create: protectedProcedure.input(z.object({ prediction: z.string().trim().min(8).max(280), category: categorySchema, resolutionDate: z.coerce.date(), confidence: z.number().int().min(0).max(100), visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"), challengeUsername: z.string().trim().max(40).optional(), semanticType: semanticTypeSchema.optional(), derivedFromId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      if (input.resolutionDate.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Resolution date must be in the future." });
      if (input.challengeUsername && input.challengeUsername.toLowerCase() === (ctx.user.username ?? "").toLowerCase()) throw new TRPCError({ code: "BAD_REQUEST", message: "Challenge someone else, not yourself." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      let challengedUser;
      if (input.challengeUsername) {
        challengedUser = await getUserByUsername(input.challengeUsername);
        if (!challengedUser) throw new TRPCError({ code: "NOT_FOUND", message: "No user with that username yet." });
      }
      // Lineage is only recorded when the parent is a Receipt this user could
      // actually see, so it cannot be used to probe for private Receipts.
      let derivedFromId: number | undefined;
      if (input.derivedFromId) {
        const parent = await getPublicReceipt(input.derivedFromId);
        if (parent?.receipt) derivedFromId = parent.receipt.id;
      }
      const result = await db.insert(receipts).values({ userId: ctx.user.id, prediction: input.prediction, category: input.category, confidence: input.confidence, resolutionDate: input.resolutionDate, status: "PENDING", visibility: input.visibility, challengeUserId: challengedUser?.id, semanticType: input.semanticType ?? defaultSemanticTypeFor(input.category), derivedFromId });
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
      await trackEvent("receipt_created", ctx.user.id, { receiptId, category: input.category, confidence: input.confidence, visibility: input.visibility, challenged: Boolean(challengedUser), semanticType: input.semanticType ?? defaultSemanticTypeFor(input.category), derived: Boolean(derivedFromId) });
      return receipt;
    }),
    resolve: protectedProcedure.input(z.object({ id: z.number().int().positive(), result: statusSchema, note: z.string().trim().max(280).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const receipt = await getReceiptById(input.id);
      if (!receipt || receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only resolve your own receipts." });
      if (!(RESOLVABLE_STATUSES as readonly string[]).includes(receipt.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This receipt is already resolved." });
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
      if (!(await isUsernameAvailable(input.username, ctx.user.id))) {
        throw new TRPCError({ code: "CONFLICT", message: USERNAME_UNAVAILABLE });
      }
      await db.update(users).set({ username: input.username }).where(eq(users.id, ctx.user.id));
      return { username: input.username };
    }),
  }),

  account: router({
    /**
     * Deletes the caller's own account. Nobody can delete anybody else's:
     * there is no id parameter, and admins get no override.
     *
     * Irreversible, so it takes an explicit confirmation rather than firing on
     * a mis-click. The session cookie is cleared on the way out, because the
     * account it identifies no longer exists.
     */
    delete: protectedProcedure
      .input(z.object({ confirm: z.literal("DELETE MY ACCOUNT") }))
      .mutation(async ({ ctx }) => {
        const outcome = await deleteAccount(ctx.user.id);
        if (!outcome) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "That account could not be deleted." });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        return outcome;
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
      // The challenger may have deleted their account since. Their side of the
      // challenge is null then, and there is nobody left to notify — the
      // response is still recorded, it just goes unannounced.
      if (item.challenge.challengerId !== null) {
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
      }
      await trackEvent("challenge_accepted", ctx.user.id, { challengeId: input.id, confidence: input.confidence });
      return getChallengeById(input.id);
    }),
  }),

  notifications: router({
    /**
     * Both reads sync first, so a Receipt coming due turns into a notification
     * without a scheduler. The sync is idempotent and never throws, so the
     * bell behaves identically whether or not it had anything to create.
     */
    list: protectedProcedure.query(async ({ ctx }) => {
      await syncResolutionNotifications(ctx.user.id);
      return listNotifications(ctx.user.id);
    }),
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      await syncResolutionNotifications(ctx.user.id);
      return countUnreadNotifications(ctx.user.id);
    }),
    markRead: protectedProcedure
      .input(z.object({ ids: z.array(z.number().int().positive()).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        await markNotificationsRead(ctx.user.id, input?.ids);
        return { success: true } as const;
      }),
  }),

  /**
   * Reporting and takedown.
   *
   * A Receipt is never edited or deleted here. `HIDE` takes it off every
   * public surface and leaves the row, its interactions and its lineage
   * exactly as they were, which is what makes `RESTORE` a real undo and keeps
   * the product's promise that a locked statement stays locked.
   */
  moderation: router({
    /**
     * Files a report against a public Receipt.
     *
     * Requires an account, because one report per person per Receipt is the
     * thing that stops a single reporter manufacturing a queue — and an
     * anonymous report has no key to deduplicate on. People without an account
     * are pointed at the published abuse contact instead.
     */
    report: protectedProcedure
      .input(
        z.object({
          receiptId: z.number().int().positive(),
          reason: reportReasonSchema,
          detail: z.string().trim().max(MAX_REPORT_DETAIL).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Only a Receipt the reporter can actually see. This also means an
        // already-hidden Receipt cannot be reported again — it is already off
        // the public surfaces a report would ask for.
        const result = await getPublicReceipt(input.receiptId);
        if (!result?.receipt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That receipt is private or no longer exists." });
        }
        if (result.receipt.userId === ctx.user.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This is your own receipt. Reporting it would not remove it — receipts cannot be deleted.",
          });
        }
        const outcome = await createReceiptReport({
          receiptId: input.receiptId,
          reporterId: ctx.user.id,
          reason: input.reason,
          detail: input.detail ?? null,
        });
        if (outcome.rateLimited) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "You have reported a lot today. Try again tomorrow, or write to the abuse contact.",
          });
        }
        // A repeat report is the same report. Saying so beats an error the
        // reporter has to interpret, and it leaks nothing they did not do.
        return { received: true, alreadyReported: !outcome.created } as const;
      }),

    /** Whether the signed-in viewer has already reported this Receipt. */
    myReport: protectedProcedure
      .input(z.object({ receiptId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const existing = await getReportByReporter(input.receiptId, ctx.user.id);
        return { reported: Boolean(existing), reason: existing?.reason ?? null };
      }),

    /** The moderation queue. Admin-only: it spans every user's content. */
    queue: adminProcedure
      .input(
        z
          .object({
            status: reportStatusSchema.optional(),
            cursor: z.number().int().positive().optional(),
            limit: z.number().int().min(1).max(100).optional(),
          })
          .optional(),
      )
      .query(({ input }) => getReportQueue(input ?? { status: "OPEN" })),

    /** Everything ever decided about one Receipt, plus its current state. */
    history: adminProcedure
      .input(z.object({ receiptId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const receipt = await getReceiptById(input.receiptId);
        if (!receipt) throw new TRPCError({ code: "NOT_FOUND", message: "No receipt with that id." });
        return {
          receipt,
          actions: await listModerationActions(input.receiptId),
          openReports: await countOpenReports(input.receiptId),
        };
      }),

    /**
     * Records a moderator's decision and applies it. Every call appends an
     * audit row, including `DISMISS` — "we looked and left it up" is a
     * decision the next moderator needs to see.
     */
    act: adminProcedure
      .input(
        z.object({
          receiptId: z.number().int().positive(),
          action: moderationActionSchema,
          note: z.string().trim().max(MAX_REPORT_DETAIL).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const outcome = await applyModerationAction({
          receiptId: input.receiptId,
          moderatorId: ctx.user.id,
          action: input.action,
          note: input.note ?? null,
        });
        if (!outcome) throw new TRPCError({ code: "NOT_FOUND", message: "No receipt with that id." });
        return outcome;
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
