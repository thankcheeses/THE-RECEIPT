import { COOKIE_NAME } from "@shared/const";
import { CATEGORIES, DAILY_PROMPTS, getTodayPrompt, formatReceiptNumber } from "@shared/seed";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { challenges, dailyChallenges, receipts, users } from "../drizzle/schema";
import { getChallengeById, getDb, getDailyChallengeForDate, getProfileStats, getPublicReceipt, getRecentPublicReceipts, getReceiptById, getUserByUsername, listChallengesForUser, listReceiptsForUser, recordAchievement } from "./db";

const categorySchema = z.enum(CATEGORIES);
const statusSchema = z.enum(["RIGHT", "WRONG", "PARTIALLY RIGHT", "TOO EARLY"]);

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
    me: publicProcedure.query((opts) => opts.ctx.user),
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
      return receipt;
    }),
  }),

  receipts: router({
    recentPublic: publicProcedure.query(() => getRecentPublicReceipts()),
    publicById: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const result = await getPublicReceipt(input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "That receipt is private or no longer exists." });
      return result;
    }),
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
        await db.insert(challenges).values({ receiptId, challengerId: ctx.user.id, challengedId: challengedUser.id, challengerPosition: input.prediction, challengerConfidence: input.confidence, status: "OPEN" });
      }
      await recordAchievement(ctx.user.id, "CALLER");
      const receipt = await getReceiptById(receiptId);
      if (!receipt) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Receipt was not created" });
      return receipt;
    }),
    resolve: protectedProcedure.input(z.object({ id: z.number().int().positive(), result: statusSchema, note: z.string().trim().max(280).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const receipt = await getReceiptById(input.id);
      if (!receipt || receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only resolve your own receipts." });
      if (!["PENDING", "LOCKED"].includes(receipt.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This receipt is already resolved." });
      await db.update(receipts).set({ status: input.result, result: input.note ?? null, resolvedAt: new Date() }).where(eq(receipts.id, input.id));
      const stats = await getProfileStats(ctx.user.id);
      await db.update(users).set({ accuracy: stats.accuracy }).where(eq(users.id, ctx.user.id));
      if (input.result === "RIGHT") await recordAchievement(ctx.user.id, "CALLER");
      return getReceiptById(input.id);
    }),
  }),

  profile: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user;
      const stats = await getProfileStats(user.id);
      return { user, stats, receipts: (await listReceiptsForUser(user.id)).slice(0, 6) };
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
      await db.update(challenges).set({ challengedPosition: input.position, challengedConfidence: input.confidence, status: "ACCEPTED" }).where(eq(challenges.id, input.id));
      return getChallengeById(input.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
