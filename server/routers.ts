import { COOKIE_NAME } from "@shared/const";
import { CATEGORIES, DAILY_PROMPTS, formatReceiptNumber } from "@shared/seed";
import { PROMPT_STANDARD, isBlocked, screenPrompt } from "@shared/promptReview";
import { COMPOSABLE_TYPES, INTERACTION_TYPES, SEMANTIC_TYPES, allowsInteraction, defaultSemanticTypeFor, isPrivateOnlyType, isResolvableType, resolveSemanticType } from "@shared/interactionPolicy";
import { DREAM_MAX_LENGTH, DREAM_MIN_LENGTH, DREAM_TITLE_MAX_LENGTH, dreamTitleFrom } from "@shared/dream";
import { MAX_REPORT_DETAIL, MODERATION_ACTIONS, REPORT_REASONS, REPORT_STATUSES } from "@shared/moderation";
import { USERNAME_UNAVAILABLE } from "@shared/accountDeletion";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { challenges, dailyChallenges, receipts, users } from "../drizzle/schema";
import { getMeTooCluster, RESOLVABLE_STATUSES, syncResolutionNotifications, deleteAccount, isUsernameAvailable, applyModerationAction, countOpenReports, createReceiptReport, getReportByReporter, getReportQueue, listModerationActions, canResolveAt, clearInteraction, countUnreadNotifications, createNotification, getInteractionCounts, getResolvingSoon, getViewerInteraction, recordUserReturn, setInteraction, getChallengeById, getDailyActivityWindow, getDb, getDailyChallengeForDate, getEventTotals, getProfileStats, getPublicReceipt, getRecentPublicReceipts, getReceiptById, getPublicFeed, getPublicProfileStats, getRetentionSummary, getUserById, getUserByUsername, listPublicReceiptsForUser, toPublicUser, listChallengesForUser, listNotifications, listReceiptsForUser, markNotificationsRead, recordAchievement, recordDailyActivity, trackEvent, ARCHIVE_PAGE_SIZE, archiveSummary, findSimilarInArchive, getResurfaced, searchMyReceipts } from "./db";

const categorySchema = z.enum(CATEGORIES);
const semanticTypeSchema = z.enum(SEMANTIC_TYPES);
// What the compose form may ask for. DREAM is captured through its own route
// and is not a thing you can select your way into.
const composableTypeSchema = z.enum(COMPOSABLE_TYPES);
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
  "archive_searched",
  "receipt_resurfaced",
  "dream_captured",
] as const;
const analyticsEventSchema = z.enum(ANALYTICS_EVENTS);

/**
 * Today's prompt, if a person has approved one.
 *
 * This used to publish a prompt on first read, which meant whatever the
 * rotation produced went live to everybody without anyone having looked at it.
 * Now nothing is served that an administrator has not approved: no approved
 * prompt means no prompt today, which is the honest outcome of a review gate
 * and is handled as an empty state rather than an error.
 */
async function openDailyChallenge() {
  const existing = await getDailyChallengeForDate(new Date());
  return existing && existing.status === "OPEN" ? existing : null;
}

/** The same, for the paths that genuinely cannot proceed without one. */
async function requireDailyChallenge() {
  const daily = await openDailyChallenge();
  if (!daily) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "There's no prompt today. Write your own receipt instead.",
    });
  }
  return daily;
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
    get: publicProcedure.query(() => openDailyChallenge()),
    answer: protectedProcedure.input(z.object({ answer: z.enum(["YES", "NO"]), confidence: z.number().int().min(0).max(100) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const daily = await requireDailyChallenge();
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
      const daily = await openDailyChallenge();
      const user = (await getUserById(ctx.user.id)) ?? ctx.user;
      const db = await getDb();
      const answered = db && daily
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
    /**
     * Counts per interaction type, the viewer's own response, and the ME TOO
     * cluster — the Receipts people independently wrote after this one, and
     * how they have turned out.
     *
     * `derivedCount` is kept as the cluster's total so nothing that reads it
     * has to change; the cluster is the same number with its outcomes.
     */
    interactions: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const result = await getPublicReceipt(input.id);
      if (!result?.receipt) throw new TRPCError({ code: "NOT_FOUND", message: "That receipt is private or no longer exists." });
      const cluster = await getMeTooCluster(input.id);
      return {
        counts: await getInteractionCounts(input.id),
        mine: ctx.user ? await getViewerInteraction(input.id, ctx.user.id) : null,
        derivedCount: cluster.total,
        cluster,
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
    create: protectedProcedure.input(z.object({ prediction: z.string().trim().min(8).max(280), category: categorySchema, resolutionDate: z.coerce.date().optional(), confidence: z.number().int().min(0).max(100), visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"), challengeUsername: z.string().trim().max(40).optional(), semanticType: composableTypeSchema.optional(), derivedFromId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const semanticType = input.semanticType ?? defaultSemanticTypeFor(input.category);
      // A memory is not answered by reality, so it carries no resolution date
      // and none is asked for. Everything else must name the day it can be
      // checked — that date is the entire point of writing it down.
      const resolvable = isResolvableType(semanticType);
      if (resolvable && !input.resolutionDate) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the date this can be checked." });
      if (resolvable && input.resolutionDate!.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Resolution date must be in the future." });
      const resolutionDate = resolvable ? input.resolutionDate! : null;
      // A private-only type is clamped here rather than trusted from the wire.
      const visibility = isPrivateOnlyType(semanticType) ? "PRIVATE" : input.visibility;
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
      const result = await db.insert(receipts).values({ userId: ctx.user.id, prediction: input.prediction, category: input.category, confidence: input.confidence, resolutionDate, status: "PENDING", visibility, challengeUserId: challengedUser?.id, semanticType, derivedFromId });
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
      await trackEvent("receipt_created", ctx.user.id, { receiptId, category: input.category, confidence: input.confidence, visibility, challenged: Boolean(challengedUser), semanticType, derived: Boolean(derivedFromId) });
      return receipt;
    }),
    resolve: protectedProcedure.input(z.object({ id: z.number().int().positive(), result: statusSchema, note: z.string().trim().max(280).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const receipt = await getReceiptById(input.id);
      if (!receipt || receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only resolve your own receipts." });
      if (!(RESOLVABLE_STATUSES as readonly string[]).includes(receipt.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This receipt is already resolved." });
      // Memories and dreams are never right or wrong. Refusing here rather
      // than only hiding the buttons is what makes that a property of the
      // product instead of a property of one screen.
      if (!isResolvableType(receipt.semanticType) || !receipt.resolutionDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `A ${resolveSemanticType(receipt.semanticType).toLowerCase()} receipt isn't right or wrong. It's just kept.` });
      }
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

  /**
   * Daily prompt review.
   *
   * Every route here is admin-only, and the approval is the point: a prompt
   * reaches everybody at once, so a person signs off on it with their account
   * attached before anybody sees it. `screenPrompt` narrows what the reviewer
   * has to read carefully; it does not approve anything and cannot.
   */
  promptReview: router({
    /** Candidate prompts, screened, plus whatever is already scheduled. */
    queue: adminProcedure.query(async () => {
      const db = await getDb();
      const scheduled = db
        ? await db.select().from(dailyChallenges).orderBy(desc(dailyChallenges.publishDate)).limit(30)
        : [];
      const used = new Set(scheduled.map((row) => row.prompt));
      const candidates = DAILY_PROMPTS.filter((item) => !used.has(item.prompt)).map((item) => ({
        ...item,
        flags: screenPrompt({ prompt: item.prompt, resolutionDays: item.resolutionDays }),
      }));
      return {
        scheduled: scheduled.map((row) => ({ ...row, flags: screenPrompt({ prompt: row.prompt }) })),
        candidates,
        standard: PROMPT_STANDARD,
      };
    }),
    /** Puts a candidate in the queue as a draft. It is not live yet. */
    schedule: adminProcedure
      .input(z.object({ prompt: z.string().trim().min(1).max(280), category: categorySchema, resolutionDays: z.number().int().min(1).max(60), publishDate: z.coerce.date() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
        const flags = screenPrompt({ prompt: input.prompt, resolutionDays: input.resolutionDays });
        // A blocked subject is not something a reviewer can wave through: the
        // prompt has to change, not the decision about it.
        if (isBlocked(flags)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `That prompt is off-limits: ${flags[0].note}` });
        }
        const publishDate = new Date(input.publishDate);
        publishDate.setHours(0, 0, 0, 0);
        const resolutionDate = new Date(publishDate);
        resolutionDate.setDate(resolutionDate.getDate() + input.resolutionDays);
        const inserted = await db.insert(dailyChallenges).values({
          prompt: input.prompt,
          category: input.category,
          publishDate,
          resolutionDate,
          status: "DRAFT",
        });
        return { id: Number(inserted[0].insertId), flags };
      }),
    /** A person signs it off. Their id is recorded against it. */
    approve: adminProcedure
      .input(z.object({ id: z.number().int().positive(), note: z.string().trim().max(280).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
        const rows = await db.select().from(dailyChallenges).where(eq(dailyChallenges.id, input.id)).limit(1);
        const draft = rows[0];
        if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No prompt with that id." });
        if (draft.status !== "DRAFT") throw new TRPCError({ code: "BAD_REQUEST", message: "Only a draft can be approved." });
        // Re-screened at the moment of approval rather than trusting the check
        // done when it was scheduled — the text could have been edited since.
        if (isBlocked(screenPrompt({ prompt: draft.prompt }))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That prompt is off-limits and cannot be approved." });
        }
        await db
          .update(dailyChallenges)
          .set({ status: "OPEN", approvedBy: ctx.user.id, approvedAt: new Date(), reviewNote: input.note ?? null })
          .where(eq(dailyChallenges.id, input.id));
        return { id: input.id, status: "OPEN" as const };
      }),
    /** Turned down, with a reason. The row stays, so the decision is on record. */
    reject: adminProcedure
      .input(z.object({ id: z.number().int().positive(), note: z.string().trim().min(1).max(280) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
        await db
          .update(dailyChallenges)
          .set({ status: "REJECTED", approvedBy: ctx.user.id, approvedAt: new Date(), reviewNote: input.note })
          .where(eq(dailyChallenges.id, input.id));
        return { id: input.id, status: "REJECTED" as const };
      }),
  }),

  /**
   * The archive. Everything here is scoped to the caller's own Receipts —
   * there is no public variant of any of it, which is what keeps a private
   * Receipt, a hidden one, or a dream from reaching anybody else through
   * search.
   */
  archive: router({
    search: protectedProcedure
      .input(
        z.object({
          query: z.string().trim().max(120).optional(),
          semanticType: semanticTypeSchema.optional(),
          status: z.enum(["PENDING", "LOCKED", "RIGHT", "WRONG", "PARTIALLY RIGHT", "TOO EARLY"]).optional(),
          cursor: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(50).optional(),
        }).optional(),
      )
      .query(async ({ ctx, input }) => {
        const page = await searchMyReceipts({ userId: ctx.user.id, ...(input ?? {}) });
        // The term itself is never recorded: it is the contents of somebody's
        // private archive. Only that a search happened, and how well it did.
        if (input?.query) await trackEvent("archive_searched", ctx.user.id, { results: page.items.length, filtered: Boolean(input.semanticType || input.status) });
        return page;
      }),
    summary: protectedProcedure.query(({ ctx }) => archiveSummary(ctx.user.id)),
    /**
     * The one Receipt worth handing back today, or nothing.
     *
     * Returning null is the common case and is not a failure. An archive that
     * produces something every single day is a feed.
     */
    resurfaced: protectedProcedure.query(async ({ ctx }) => {
      const found = await getResurfaced(ctx.user.id);
      if (found) await trackEvent("receipt_resurfaced", ctx.user.id, { kind: found.kind, years: found.years });
      return found;
    }),
    /**
     * Something like this, already in your archive. Read while composing, so
     * it can be shown before the new Receipt is locked rather than after.
     */
    similar: protectedProcedure
      .input(z.object({ text: z.string().trim().max(280), excludeId: z.number().int().positive().optional() }))
      .query(({ ctx, input }) => findSimilarInArchive(ctx.user.id, input.text, input.excludeId)),
  }),

  /**
   * Dreams.
   *
   * Capture is its own route rather than a flag on `receipts.create` because
   * the rules are genuinely different: no resolution date, no confidence to
   * speak of, no visibility choice, no interactions, and a title derived from
   * the transcript. Folding it into the general path would mean a stack of
   * conditionals where a missed one leaks a dream onto a public surface.
   */
  dreams: router({
    capture: protectedProcedure
      .input(z.object({ transcript: z.string().trim().min(DREAM_MIN_LENGTH).max(DREAM_MAX_LENGTH), title: z.string().trim().max(DREAM_TITLE_MAX_LENGTH).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
        const inserted = await db.insert(receipts).values({
          userId: ctx.user.id,
          prediction: input.transcript,
          title: input.title?.trim() || dreamTitleFrom(input.transcript),
          category: "LIFE",
          // A dream is not a claim, so there is nothing to be confident about.
          // Stored as zero rather than inventing a number to display.
          confidence: 0,
          // Nothing answers a dream. See isResolvableType.
          resolutionDate: null,
          status: "PENDING",
          // Not read from input at all: there is no code path by which a dream
          // becomes public.
          visibility: "PRIVATE",
          semanticType: "DREAM",
        });
        const receiptId = Number(inserted[0].insertId);
        // Length only. The transcript is the most private thing in the app and
        // no part of it, and no derived summary of it, goes to analytics.
        await trackEvent("dream_captured", ctx.user.id, { receiptId, length: input.transcript.length });
        const receipt = await getReceiptById(receiptId);
        if (!receipt) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Dream was not saved" });
        return receipt;
      }),
    /**
     * Renames a dream. The title is a label on the record; the transcript
     * itself is locked like every other Receipt and there is no route that
     * edits it.
     */
    rename: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), title: z.string().trim().min(1).max(DREAM_TITLE_MAX_LENGTH) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
        const receipt = await getReceiptById(input.id);
        if (!receipt || receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only rename your own dreams." });
        if (resolveSemanticType(receipt.semanticType) !== "DREAM") throw new TRPCError({ code: "BAD_REQUEST", message: "Only a dream can be renamed." });
        await db.update(receipts).set({ title: input.title }).where(eq(receipts.id, input.id));
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
