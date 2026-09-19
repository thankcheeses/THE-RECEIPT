/**
 * Static demo backend.
 *
 * GitHub Pages serves files, not Express — there is no /api/trpc and no MySQL
 * behind it. This module reimplements every procedure the UI calls (see
 * server/routers.ts) against localStorage, so the deployed site renders and
 * behaves exactly like the hosted app instead of failing every query.
 *
 * Only active when VITE_STATIC_DEMO=true; the normal build still talks to the
 * real server over httpBatchLink.
 */
import { CATEGORIES, DAILY_PROMPTS, getTodayPrompt, type Category, type ReceiptStatus } from "@shared/seed";
import { allowsInteraction, defaultSemanticTypeFor, resolveSemanticType, type InteractionType, type SemanticType } from "@shared/interactionPolicy";
import {
  MAX_REPORTS_PER_DAY,
  isPubliclyVisible,
  reportStatusAfter,
  statusAfter,
  type ModerationAction,
  type ModerationStatus,
  type ReportReason,
  type ReportStatus,
} from "@shared/moderation";
import { USERNAME_UNAVAILABLE, normalizeUsername } from "@shared/accountDeletion";

export const IS_STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === "true";

const STORAGE_KEY = "the-receipt-static-demo";
const AUTH_CHANGE_EVENT = "the-receipt:auth-change";

type DemoUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string;
  role: "user" | "admin";
  username: string | null;
  avatar: string | null;
  currentStreak: number;
  longestStreak: number;
  lastDailyDate: Date | null;
  lastActiveDate: Date | null;
  accuracy: number;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

type DemoReceipt = {
  id: number;
  /** Null once the author deletes their account, exactly as on the server. */
  userId: number | null;
  prediction: string;
  category: string;
  confidence: number;
  createdAt: Date;
  resolutionDate: Date;
  status: ReceiptStatus;
  result: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  challengeUserId: number | null;
  dailyChallengeId: number | null;
  resolvedAt: Date | null;
  semanticType: SemanticType | null;
  derivedFromId: number | null;
  moderationStatus: ModerationStatus;
};

type DemoReport = {
  id: number;
  receiptId: number;
  reporterId: number | null;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: number | null;
};

type DemoModerationAction = {
  id: number;
  receiptId: number;
  moderatorId: number | null;
  action: ModerationAction;
  resultingStatus: ModerationStatus;
  note: string | null;
  reportsClosed: number;
  createdAt: Date;
};

type DemoChallenge = {
  id: number;
  receiptId: number;
  challengerId: number | null;
  challengedId: number | null;
  challengerPosition: string;
  challengerConfidence: number;
  challengedPosition: string | null;
  challengedConfidence: number | null;
  status: "OPEN" | "ACCEPTED" | "RESOLVED";
  createdAt: Date;
};

type DemoNotification = {
  id: number;
  userId: number;
  type: "CHALLENGE_RECEIVED" | "CHALLENGE_ACCEPTED" | "RECEIPT_RESOLVED" | "RECEIPT_DUE";
  title: string;
  body: string | null;
  linkPath: string | null;
  actorId: number | null;
  challengeId: number | null;
  receiptId: number | null;
  readAt: Date | null;
  createdAt: Date;
};

type DemoState = {
  user: DemoUser | null;
  receipts: DemoReceipt[];
  challenges: DemoChallenge[];
  notifications: DemoNotification[];
  /**
   * Days the demo user answered the daily, as `YYYY-MM-DD`. Deliberately not a
   * full ISO timestamp: reviveDates() turns those back into Date objects on
   * reload, which would break every lookup against this set.
   */
  dailyActivity: string[];
  /** Locally recorded analytics, so the event calls are exercised, not swallowed. */
  events: Array<{ event: string; properties: unknown; at: Date }>;
  /** One response per receipt in this browser, keyed by receipt id. */
  interactions: Record<string, InteractionType>;
  reports: DemoReport[];
  moderationActions: DemoModerationAction[];
  /** Lower-cased handles of deleted accounts. Never reclaimable. */
  retiredUsernames: string[];
  nextReceiptId: number;
  nextChallengeId: number;
  nextNotificationId: number;
  nextReportId: number;
  nextModerationActionId: number;
};

const RESOLVED_STATUSES: ReceiptStatus[] = ["RIGHT", "WRONG", "PARTIALLY RIGHT"];
/** Mirrors RESOLVABLE_STATUSES in server/db.ts. */
const RESOLVABLE_STATUSES: ReceiptStatus[] = ["PENDING", "LOCKED"];

const emptyState = (): DemoState => ({
  user: null,
  receipts: [],
  challenges: [],
  notifications: [],
  dailyActivity: [],
  events: [],
  interactions: {},
  reports: [],
  moderationActions: [],
  retiredUsernames: [],
  nextReceiptId: 4822,
  nextChallengeId: 1,
  nextNotificationId: 1,
  nextReportId: 1,
  nextModerationActionId: 1,
});

/** JSON has no Date type, so ISO strings are revived on read. */
const reviveDates = <T>(value: T): T => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value)) {
    return new Date(value) as unknown as T;
  }
  if (Array.isArray(value)) return value.map(reviveDates) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = reviveDates(item);
    return out as T;
  }
  return value;
};

let cache: DemoState | null = null;

const readState = (): DemoState => {
  if (cache) return cache;
  let loaded: DemoState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    loaded = raw ? { ...emptyState(), ...reviveDates(JSON.parse(raw)) } : emptyState();
  } catch {
    loaded = emptyState();
  }
  cache = loaded;
  return loaded;
};

const writeState = (state: DemoState) => {
  cache = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing / storage disabled — the session stays in memory only.
  }
};

const mutate = <T>(fn: (state: DemoState) => T): T => {
  const state = readState();
  const result = fn(state);
  writeState(state);
  return result;
};

/** Signs in a local demo account. Stands in for the Manus OAuth round trip. */
export const startDemoLogin = () => {
  mutate((state) => {
    if (!state.user) {
      const now = new Date();
      state.user = {
        id: 1,
        openId: "static-demo",
        name: "Demo Caller",
        email: null,
        loginMethod: "demo",
        role: "user",
        username: null,
        avatar: null,
        currentStreak: 0,
        longestStreak: 0,
        lastDailyDate: null,
        lastActiveDate: null,
        accuracy: 0,
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      };
      // The server records this in upsertUser() on a genuine first sign-in.
      state.events.push({ event: "signup", properties: { loginMethod: "demo" }, at: now });
    }
  });
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
};

export const onDemoAuthChange = (handler: () => void) => {
  window.addEventListener(AUTH_CHANGE_EVENT, handler);
  return () => window.removeEventListener(AUTH_CHANGE_EVENT, handler);
};

/** Mirrors ensureDailyChallenge(): one seeded prompt per calendar day. */
const dailyChallenge = () => {
  const prompt = getTodayPrompt();
  const publishDate = new Date();
  publishDate.setHours(0, 0, 0, 0);
  const resolutionDate = new Date(publishDate);
  resolutionDate.setDate(resolutionDate.getDate() + prompt.resolutionDays);
  // The server autoincrements this per inserted daily challenge; mirror the
  // rotation through DAILY_PROMPTS so the displayed number stays in the same range.
  const day = Math.floor(publishDate.getTime() / 86_400_000);
  return {
    id: (((day % DAILY_PROMPTS.length) + DAILY_PROMPTS.length) % DAILY_PROMPTS.length) + 1,
    prompt: prompt.prompt,
    category: prompt.category,
    publishDate,
    resolutionDate,
    status: "OPEN" as const,
    createdAt: publishDate,
  };
};

const DAY_MS = 86_400_000;

/** Mirrors STREAK_MILESTONES in server/db.ts. */
const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 365];

const startOfDay = (date: Date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

/** The `YYYY-MM-DD` key a Date falls on, in local time. */
const dayKey = (date: Date) => {
  const day = startOfDay(date);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};

/** Mirrors nextStreak() in server/db.ts: yesterday continues, today is a no-op. */
const nextStreak = (current: number, lastDailyDate: Date | null, today: Date) => {
  if (!lastDailyDate) return 1;
  const gap = Math.round((startOfDay(today).getTime() - startOfDay(lastDailyDate).getTime()) / DAY_MS);
  if (gap === 0) return Math.max(current, 1);
  if (gap === 1) return current + 1;
  return 1;
};

const activityWindow = (state: DemoState, days = 7) => {
  const today = startOfDay(new Date());
  const active = new Set(state.dailyActivity);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - index));
    return { date, active: active.has(dayKey(date)) };
  });
};

/** Mirrors toPublicUser() in server/db.ts. */
const publicUser = (user: DemoUser | null) =>
  user && {
    id: user.id,
    username: user.username,
    name: user.name,
    avatar: user.avatar,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    accuracy: user.accuracy,
    createdAt: user.createdAt,
  };

/**
 * Mirrors syncResolutionNotifications() in server/db.ts: the caller's own
 * receipts that are past their resolution date and still open get one
 * notification each, once ever.
 *
 * The server relies on a unique index to make that true under concurrency.
 * One browser is single-threaded, so the existence check below is the whole
 * guard here — the rule it enforces is the same one.
 */
const syncDemoResolutionNotifications = (state: DemoState, user: DemoUser) => {
  const now = Date.now();
  for (const receipt of state.receipts) {
    if (receipt.userId !== user.id) continue;
    if (!RESOLVABLE_STATUSES.includes(receipt.status)) continue;
    if (new Date(receipt.resolutionDate).getTime() > now) continue;
    const exists = state.notifications.some(
      (item) => item.userId === user.id && item.type === "RECEIPT_DUE" && item.receiptId === receipt.id,
    );
    if (exists) continue;
    notify(state, {
      userId: user.id,
      type: "RECEIPT_DUE",
      receiptId: receipt.id,
      actorId: null,
      challengeId: null,
      title: `Receipt #${String(receipt.id).padStart(6, "0")} is ready to resolve.`,
      body: receipt.prediction,
      linkPath: `/receipt/${receipt.id}`,
    });
  }
};

/** The public, visible receipts written after `receiptId` ("ME TOO"). */
const derivedReceipts = (state: DemoState, receiptId: number) =>
  state.receipts.filter((item) => item.derivedFromId === receiptId && isPubliclyVisible(item));

/** Mirrors summarizeCluster() in server/db.ts. */
const summarizeDemoCluster = (members: DemoReceipt[]) => {
  const bucket = { open: 0, right: 0, wrong: 0, partial: 0, tooEarly: 0 };
  for (const receipt of members) {
    if (receipt.status === "PENDING" || receipt.status === "LOCKED") bucket.open++;
    else if (receipt.status === "RIGHT") bucket.right++;
    else if (receipt.status === "WRONG") bucket.wrong++;
    else if (receipt.status === "PARTIALLY RIGHT") bucket.partial++;
    else if (receipt.status === "TOO EARLY") bucket.tooEarly++;
  }
  return {
    total: members.length,
    ...bucket,
    resolved: bucket.right + bucket.wrong + bucket.partial + bucket.tooEarly,
  };
};

const notify = (
  state: DemoState,
  // receiptId is optional: only receipt-scoped notifications carry one.
  input: Omit<DemoNotification, "id" | "readAt" | "createdAt" | "receiptId"> & { receiptId?: number | null },
) => {
  state.notifications.unshift({
    ...input,
    receiptId: input.receiptId ?? null,
    id: state.nextNotificationId++,
    readAt: null,
    createdAt: new Date(),
  });
};

const requireUser = (state: DemoState): DemoUser => {
  if (!state.user) throw new Error("Please login (10001)");
  return state.user;
};

/** Mirrors adminProcedure. The demo account is not an admin, by design. */
const requireAdmin = (state: DemoState): DemoUser => {
  const user = requireUser(state);
  if (user.role !== "admin") throw new Error("You do not have required permission (10002)");
  return user;
};

const forUser = (state: DemoState, userId: number) =>
  state.receipts.filter((receipt) => receipt.userId === userId).sort((a, b) => b.id - a.id);

const profileStats = (state: DemoState, userId: number) => {
  const all = forUser(state, userId);
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
  const misses = resolved.filter((receipt) => receipt.status === "WRONG").sort((a, b) => b.confidence - a.confidence);
  const calls = right.slice().sort((a, b) => b.confidence - a.confidence);
  return {
    total: all.length,
    resolved: resolved.length,
    accuracy,
    right: right.length,
    pending: all.length - resolved.length,
    biggestMiss: misses[0] ?? null,
    biggestCall: calls[0] ?? null,
    byCategory,
  };
};

type Handler = (input: any) => unknown;

const handlers: Record<string, Handler> = {
  "auth.me": () =>
    mutate((state) => {
      if (!state.user) return null;
      const today = startOfDay(new Date());
      const last = state.user.lastActiveDate ? startOfDay(state.user.lastActiveDate) : null;
      if (!last || last.getTime() !== today.getTime()) {
        if (last) {
          const days = Math.round((today.getTime() - last.getTime()) / DAY_MS);
          state.events.push({ event: "user_returned", properties: { daysSinceLastActive: days }, at: new Date() });
        }
        state.user.lastActiveDate = today;
      }
      return state.user;
    }),
  "auth.logout": () =>
    mutate((state) => {
      state.user = null;
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
      return { success: true } as const;
    }),

  "daily.get": () => dailyChallenge(),
  "daily.status": () => {
    const state = readState();
    const user = requireUser(state);
    const daily = dailyChallenge();
    return {
      answered: state.receipts.find((receipt) => receipt.userId === user.id && receipt.dailyChallengeId === daily.id) ?? null,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      week: activityWindow(state, 7),
    };
  },
  "daily.answer": (input: { answer: "YES" | "NO"; confidence: number }) =>
    mutate((state) => {
      const user = requireUser(state);
      const daily = dailyChallenge();
      const existing = state.receipts.find(
        (receipt) => receipt.userId === user.id && receipt.dailyChallengeId === daily.id,
      );
      if (existing) return existing;
      const receipt: DemoReceipt = {
        id: state.nextReceiptId++,
        userId: user.id,
        prediction: `${input.answer} — ${daily.prompt}`,
        category: daily.category,
        confidence: input.confidence,
        createdAt: new Date(),
        resolutionDate: daily.resolutionDate,
        status: "LOCKED",
        result: null,
        visibility: "PUBLIC",
        challengeUserId: null,
        dailyChallengeId: daily.id,
        resolvedAt: null,
        semanticType: "PREDICTION",
        derivedFromId: null,
        moderationStatus: "VISIBLE",
      };
      state.receipts.push(receipt);
      const today = startOfDay(new Date());
      const key = dayKey(today);
      if (!state.dailyActivity.includes(key)) {
        user.currentStreak = nextStreak(user.currentStreak, user.lastDailyDate, today);
        user.longestStreak = Math.max(user.longestStreak, user.currentStreak);
        user.lastDailyDate = today;
        state.dailyActivity.push(key);
      }
      state.events.push({ event: "daily_answered", properties: { answer: input.answer, confidence: input.confidence, streak: user.currentStreak }, at: new Date() });
      if (STREAK_MILESTONES.includes(user.currentStreak)) {
        state.events.push({ event: "streak_milestone", properties: { streak: user.currentStreak }, at: new Date() });
      }
      return receipt;
    }),

  "receipts.recentPublic": () => {
    const state = readState();
    return state.receipts
      .filter(isPubliclyVisible)
      .sort((a, b) => b.id - a.id)
      .slice(0, 12)
      .map((receipt) => ({ receipt, user: publicUser(state.user) }));
  },
  "receipts.publicById": (input: { id: number }) => {
    const state = readState();
    const receipt = state.receipts.find((item) => item.id === input.id && isPubliclyVisible(item));
    if (!receipt) throw new Error("That receipt is private or no longer exists.");
    // Redacted exactly as the server does, so the demo cannot show a field the
    // real build withholds.
    return { receipt, user: publicUser(state.user) };
  },
  "receipts.feed": (input?: { cursor?: number; category?: string; limit?: number }) => {
    const state = readState();
    const limit = Math.min(Math.max(input?.limit ?? 12, 1), 50);
    const all = state.receipts
      .filter(isPubliclyVisible)
      .filter((receipt) => (input?.category ? receipt.category === input.category : true))
      .filter((receipt) => (input?.cursor ? receipt.id < input.cursor : true))
      .sort((a, b) => b.id - a.id);
    const items = all.slice(0, limit);
    return {
      items: items.map((receipt) => ({ receipt, user: publicUser(state.user) })),
      nextCursor: all.length > limit ? items[items.length - 1]?.id ?? null : null,
    };
  },
  "receipts.resolvingSoon": (input?: { limit?: number }) => {
    const state = readState();
    const limit = Math.min(Math.max(input?.limit ?? 12, 1), 50);
    const now = Date.now();
    return state.receipts
      .filter((receipt) => isPubliclyVisible(receipt) && ["PENDING", "LOCKED"].includes(receipt.status))
      // Only the author can resolve one, so an author-less receipt never will be.
      .filter((receipt) => receipt.userId !== null)
      .filter((receipt) => new Date(receipt.resolutionDate).getTime() >= now)
      .sort((a, b) => new Date(a.resolutionDate).getTime() - new Date(b.resolutionDate).getTime())
      .slice(0, limit)
      .map((receipt) => ({ receipt, user: publicUser(state.user) }));
  },
  "receipts.interactions": (input: { id: number }) => {
    const state = readState();
    const receipt = state.receipts.find((item) => item.id === input.id && isPubliclyVisible(item));
    if (!receipt) throw new Error("That receipt is private or no longer exists.");
    const mine = state.interactions[String(input.id)] ?? null;
    const cluster = summarizeDemoCluster(derivedReceipts(state, input.id));
    return {
      // A single-browser demo has one responder, so a count is only ever this
      // person's own response. Reported as such rather than invented.
      counts: mine ? { [mine]: 1 } : {},
      mine,
      derivedCount: cluster.total,
      cluster,
    };
  },
  "receipts.interact": (input: { id: number; type: InteractionType | null }) =>
    mutate((state) => {
      requireUser(state);
      const receipt = state.receipts.find((item) => item.id === input.id && isPubliclyVisible(item));
      if (!receipt) throw new Error("That receipt is private or no longer exists.");
      if (input.type === null) {
        delete state.interactions[String(input.id)];
        return { counts: {}, mine: null };
      }
      if (!allowsInteraction(receipt.semanticType, input.type)) {
        throw new Error(`A ${resolveSemanticType(receipt.semanticType).toLowerCase()} receipt does not take that response.`);
      }
      state.interactions[String(input.id)] = input.type;
      return { counts: { [input.type]: 1 }, mine: input.type };
    }),
  "receipts.mine": () => {
    const state = readState();
    return forUser(state, requireUser(state).id);
  },
  "receipts.create": (input: {
    prediction: string;
    category: Category;
    resolutionDate: Date;
    confidence: number;
    visibility: "PUBLIC" | "PRIVATE";
    challengeUsername?: string;
    semanticType?: SemanticType;
    derivedFromId?: number;
  }) =>
    mutate((state) => {
      const user = requireUser(state);
      const prediction = input.prediction.trim();
      if (prediction.length < 8) throw new Error("Say a bit more — at least 8 characters.");
      if (prediction.length > 280) throw new Error("Keep it under 280 characters.");
      if (!CATEGORIES.includes(input.category)) throw new Error("Pick a category.");
      const resolutionDate = new Date(input.resolutionDate);
      if (resolutionDate.getTime() <= Date.now()) throw new Error("Resolution date must be in the future.");
      if (input.challengeUsername && input.challengeUsername.toLowerCase() === (user.username ?? "").toLowerCase()) {
        throw new Error("Challenge someone else, not yourself.");
      }
      const receipt: DemoReceipt = {
        id: state.nextReceiptId++,
        userId: user.id,
        prediction,
        category: input.category,
        confidence: input.confidence,
        createdAt: new Date(),
        resolutionDate,
        status: "PENDING",
        result: null,
        visibility: input.visibility,
        challengeUserId: input.challengeUsername ? -1 : null,
        dailyChallengeId: null,
        resolvedAt: null,
        semanticType: input.semanticType ?? defaultSemanticTypeFor(input.category),
        // Only a public parent can be linked, matching the server.
        derivedFromId: input.derivedFromId && state.receipts.some((item) => item.id === input.derivedFromId && isPubliclyVisible(item))
          ? input.derivedFromId
          : null,
        moderationStatus: "VISIBLE",
      };
      state.receipts.push(receipt);
      if (input.challengeUsername) {
        const challengeId = state.nextChallengeId++;
        state.challenges.push({
          id: challengeId,
          receiptId: receipt.id,
          challengerId: user.id,
          // No second account exists in a single-browser demo, so the challenge
          // is addressed back to the demo user: it keeps the accept flow
          // reachable instead of permanently stuck on "waiting for them".
          challengedId: user.id,
          challengerPosition: prediction,
          challengerConfidence: input.confidence,
          challengedPosition: null,
          challengedConfidence: null,
          status: "OPEN",
          createdAt: new Date(),
        });
        notify(state, {
          userId: user.id,
          type: "CHALLENGE_RECEIVED",
          title: `@${input.challengeUsername} challenged you.`,
          body: prediction,
          linkPath: `/challenge/${challengeId}`,
          actorId: user.id,
          challengeId,
        });
        state.events.push({ event: "challenge_created", properties: { challengeId }, at: new Date() });
      }
      state.events.push({ event: "receipt_created", properties: { receiptId: receipt.id, category: input.category, confidence: input.confidence, visibility: input.visibility }, at: new Date() });
      return receipt;
    }),
  "receipts.resolve": (input: { id: number; result: ReceiptStatus; note?: string }) =>
    mutate((state) => {
      const user = requireUser(state);
      const receipt = state.receipts.find((item) => item.id === input.id);
      if (!receipt || receipt.userId !== user.id) throw new Error("You can only resolve your own receipts.");
      if (!["PENDING", "LOCKED"].includes(receipt.status)) throw new Error("This receipt is already resolved.");
      // Mirrors canResolveAt() in server/db.ts: a receipt cannot be judged
      // before the date it declared.
      if (Date.now() < new Date(receipt.resolutionDate).getTime()) {
        const due = new Date(receipt.resolutionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        throw new Error(`This receipt resolves on ${due}. Come back then.`);
      }
      receipt.status = input.result;
      receipt.result = input.note ?? null;
      receipt.resolvedAt = new Date();
      user.accuracy = profileStats(state, user.id).accuracy;
      state.events.push({ event: "receipt_resolved", properties: { receiptId: receipt.id, result: input.result }, at: new Date() });
      return receipt;
    }),

  "profile.me": () => {
    const state = readState();
    const user = requireUser(state);
    return { user, stats: profileStats(state, user.id), receipts: forUser(state, user.id).slice(0, 6) };
  },
  "profile.byUsername": (input: { username: string }) => {
    const state = readState();
    // One browser, one account: the demo can only resolve its own profile.
    if (!state.user || (state.user.username ?? "").toLowerCase() !== input.username.toLowerCase()) {
      throw new Error("No caller with that username.");
    }
    const receipts = state.receipts
      .filter((receipt) => receipt.userId === state.user!.id && isPubliclyVisible(receipt))
      .sort((a, b) => b.id - a.id);
    const resolved = receipts.filter((receipt) => RESOLVED_STATUSES.includes(receipt.status));
    const right = resolved.filter((receipt) => receipt.status === "RIGHT");
    const byCategory = Object.entries(
      receipts.reduce<Record<string, { total: number; resolved: number; right: number }>>((acc, receipt) => {
        const current = acc[receipt.category] ?? { total: 0, resolved: 0, right: 0 };
        current.total++;
        if (RESOLVED_STATUSES.includes(receipt.status)) current.resolved++;
        if (receipt.status === "RIGHT") current.right++;
        acc[receipt.category] = current;
        return acc;
      }, {}),
    ).map(([category, stats]) => ({ category, accuracy: stats.resolved ? Math.round((stats.right / stats.resolved) * 100) : 0, total: stats.total }));
    return {
      user: publicUser(state.user),
      stats: {
        total: receipts.length,
        resolved: resolved.length,
        right: right.length,
        pending: receipts.length - resolved.length,
        accuracy: resolved.length ? Math.round((right.length / resolved.length) * 100) : 0,
        byCategory,
      },
      receipts: receipts.slice(0, 12),
    };
  },
  "account.delete": (input: { confirm: string }) =>
    mutate((state) => {
      const user = requireUser(state);
      if (input.confirm !== "DELETE MY ACCOUNT") throw new Error("That account could not be deleted.");
      // Private receipts go unless a challenge depends on them; public ones
      // stay, detached. Mirrors deleteAccount() in server/db.ts.
      const anchored = new Set(state.challenges.map((challenge) => challenge.receiptId));
      const deletable = state.receipts
        .filter((receipt) => receipt.userId === user.id && receipt.visibility === "PRIVATE" && !anchored.has(receipt.id))
        .map((receipt) => receipt.id);
      state.receipts = state.receipts.filter((receipt) => !deletable.includes(receipt.id));
      for (const receipt of state.receipts) {
        if (deletable.includes(receipt.derivedFromId ?? -1)) receipt.derivedFromId = null;
        if (receipt.userId === user.id) receipt.userId = null;
        if (receipt.challengeUserId === user.id) receipt.challengeUserId = null;
      }
      for (const challenge of state.challenges) {
        if (challenge.challengerId === user.id) challenge.challengerId = null;
        if (challenge.challengedId === user.id) challenge.challengedId = null;
      }
      for (const report of state.reports) {
        if (report.reporterId === user.id) report.reporterId = null;
        if (report.resolvedBy === user.id) report.resolvedBy = null;
      }
      for (const action of state.moderationActions) {
        if (action.moderatorId === user.id) action.moderatorId = null;
      }
      state.notifications = state.notifications.filter(
        (item) => item.userId !== user.id && item.actorId !== user.id,
      );
      state.dailyActivity = [];
      state.interactions = {};
      if (user.username) state.retiredUsernames.push(normalizeUsername(user.username));
      state.user = null;
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
      return {
        deletedPrivateReceipts: deletable.length,
        anonymizedReceipts: state.receipts.filter((receipt) => receipt.userId === null).length,
        usernameRetired: Boolean(user.username),
      };
    }),

  "profile.setUsername": (input: { username: string }) =>
    mutate((state) => {
      const user = requireUser(state);
      const username = input.username.trim();
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        throw new Error("Usernames are 3-24 characters: letters, numbers, underscores.");
      }
      // A retired handle is never available again, not even to the person who
      // had it. One message for taken and retired alike, as on the server.
      if (state.retiredUsernames.includes(normalizeUsername(username))) {
        throw new Error(USERNAME_UNAVAILABLE);
      }
      user.username = username;
      return { username };
    }),

  "challenges.list": () => {
    const state = readState();
    const user = requireUser(state);
    return state.challenges
      .filter((challenge) => challenge.challengerId === user.id || challenge.challengedId === user.id)
      .map((challenge) => ({
        challenge,
        receipt: state.receipts.find((receipt) => receipt.id === challenge.receiptId) ?? null,
      }));
  },
  "challenges.get": (input: { id: number }) => {
    const state = readState();
    const challenge = state.challenges.find((item) => item.id === input.id);
    if (!challenge) throw new Error("Challenge not found.");
    return {
      challenge,
      receipt: state.receipts.find((receipt) => receipt.id === challenge.receiptId) ?? null,
    };
  },
  "challenges.respond": (input: { id: number; position: string; confidence: number }) =>
    mutate((state) => {
      const challenge = state.challenges.find((item) => item.id === input.id);
      if (!challenge) throw new Error("This challenge is not for you.");
      if (challenge.status !== "OPEN") throw new Error("You already answered this challenge.");
      challenge.challengedPosition = input.position.trim();
      challenge.challengedConfidence = input.confidence;
      challenge.status = "ACCEPTED";
      // Nobody to tell if the challenger deleted their account, same as the
      // server.
      if (challenge.challengerId !== null) {
        notify(state, {
          userId: challenge.challengerId,
          type: "CHALLENGE_ACCEPTED",
          title: "Your challenge was accepted.",
          body: challenge.challengedPosition,
          linkPath: `/challenge/${challenge.id}`,
          actorId: challenge.challengedId,
          challengeId: challenge.id,
        });
      }
      state.events.push({ event: "challenge_accepted", properties: { challengeId: challenge.id, confidence: input.confidence }, at: new Date() });
      return {
        challenge,
        receipt: state.receipts.find((receipt) => receipt.id === challenge.receiptId) ?? null,
      };
    }),
  "notifications.list": () =>
    mutate((state) => {
      const user = requireUser(state);
      syncDemoResolutionNotifications(state, user);
      return state.notifications.filter((item) => item.userId === user.id).slice(0, 25);
    }),
  "notifications.unreadCount": () =>
    mutate((state) => {
      const user = requireUser(state);
      syncDemoResolutionNotifications(state, user);
      return state.notifications.filter((item) => item.userId === user.id && !item.readAt).length;
    }),
  "notifications.markRead": (input?: { ids?: number[] }) =>
    mutate((state) => {
      const user = requireUser(state);
      for (const item of state.notifications) {
        if (item.userId !== user.id || item.readAt) continue;
        if (input?.ids?.length && !input.ids.includes(item.id)) continue;
        item.readAt = new Date();
      }
      return { success: true } as const;
    }),

  // Moderation. The demo has one account, which authors every receipt in the
  // browser, so the report flow is never offered here for the same reason it
  // is not on the server: you cannot report your own receipt. The handlers
  // exist so the UI's calls resolve instead of failing as unknown procedures.
  "moderation.report": (input: { receiptId: number; reason: ReportReason; detail?: string }) =>
    mutate((state) => {
      const user = requireUser(state);
      const receipt = state.receipts.find((item) => item.id === input.receiptId && isPubliclyVisible(item));
      if (!receipt) throw new Error("That receipt is private or no longer exists.");
      if (receipt.userId === user.id) {
        throw new Error("This is your own receipt. Reporting it would not remove it — receipts cannot be deleted.");
      }
      const existing = state.reports.find((item) => item.receiptId === input.receiptId && item.reporterId === user.id);
      if (existing) return { received: true, alreadyReported: true } as const;
      const today = startOfDay(new Date()).getTime();
      const todayCount = state.reports.filter(
        (item) => item.reporterId === user.id && startOfDay(new Date(item.createdAt)).getTime() === today,
      ).length;
      if (todayCount >= MAX_REPORTS_PER_DAY) {
        throw new Error("You have reported a lot today. Try again tomorrow, or write to the abuse contact.");
      }
      state.reports.unshift({
        id: state.nextReportId++,
        receiptId: input.receiptId,
        reporterId: user.id,
        reason: input.reason,
        detail: input.detail ?? null,
        status: "OPEN",
        createdAt: new Date(),
        resolvedAt: null,
        resolvedBy: null,
      });
      return { received: true, alreadyReported: false } as const;
    }),

  "moderation.myReport": (input: { receiptId: number }) => {
    const state = readState();
    const user = requireUser(state);
    const existing = state.reports.find((item) => item.receiptId === input.receiptId && item.reporterId === user.id);
    return { reported: Boolean(existing), reason: existing?.reason ?? null };
  },

  "moderation.queue": (input?: { status?: ReportStatus; cursor?: number; limit?: number }) => {
    const state = readState();
    requireAdmin(state);
    const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100);
    const all = state.reports
      .filter((report) => (input?.status ? report.status === input.status : true))
      .filter((report) => (input?.cursor ? report.id < input.cursor : true))
      .sort((a, b) => b.id - a.id);
    const items = all.slice(0, limit);
    return {
      items: items.map((report) => ({
        report,
        receipt: state.receipts.find((item) => item.id === report.receiptId) ?? null,
        reporter: publicUser(state.user),
      })),
      nextCursor: all.length > limit ? items[items.length - 1]?.id ?? null : null,
    };
  },

  "moderation.history": (input: { receiptId: number }) => {
    const state = readState();
    requireAdmin(state);
    const receipt = state.receipts.find((item) => item.id === input.receiptId);
    if (!receipt) throw new Error("No receipt with that id.");
    return {
      receipt,
      actions: state.moderationActions.filter((item) => item.receiptId === input.receiptId).sort((a, b) => b.id - a.id),
      openReports: state.reports.filter((item) => item.receiptId === input.receiptId && item.status === "OPEN").length,
    };
  },

  "moderation.act": (input: { receiptId: number; action: ModerationAction; note?: string }) =>
    mutate((state) => {
      const user = requireAdmin(state);
      const receipt = state.receipts.find((item) => item.id === input.receiptId);
      if (!receipt) throw new Error("No receipt with that id.");
      const next = statusAfter(input.action);
      if (next) receipt.moderationStatus = next;
      const open = state.reports.filter((item) => item.receiptId === input.receiptId && item.status === "OPEN");
      for (const report of open) {
        report.status = reportStatusAfter(input.action);
        report.resolvedAt = new Date();
        report.resolvedBy = user.id;
      }
      state.moderationActions.unshift({
        id: state.nextModerationActionId++,
        receiptId: input.receiptId,
        moderatorId: user.id,
        action: input.action,
        resultingStatus: receipt.moderationStatus,
        note: input.note ?? null,
        reportsClosed: open.length,
        createdAt: new Date(),
      });
      return { receiptId: input.receiptId, moderationStatus: receipt.moderationStatus, reportsClosed: open.length };
    }),

  "analytics.summary": () => {
    const state = readState();
    const totals = new Map<string, number>();
    for (const item of state.events) totals.set(item.event, (totals.get(item.event) ?? 0) + 1);
    return {
      events: Array.from(totals, ([event, total]) => ({ event, total })),
      // A single-browser demo has one user, so retention is only ever that
      // user's own activity. Reported honestly rather than invented.
      retention: activityWindow(state, 14).map((day, index, all) => ({
        date: day.date,
        active: day.active ? 1 : 0,
        returning: day.active && all[index - 1]?.active ? 1 : 0,
        retention: day.active && all[index - 1]?.active ? 100 : 0,
      })),
    };
  },

  "analytics.track": (input: { event: string; properties?: Record<string, unknown> }) =>
    mutate((state) => {
      // Kept to the last 200 so a long-lived browser cannot grow the record
      // past what localStorage will hold.
      state.events.push({ event: input.event, properties: input.properties ?? null, at: new Date() });
      if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
      return { success: true } as const;
    }),
};

export const callStaticProcedure = async (path: string, input: unknown) => {
  const handler = handlers[path];
  if (!handler) throw new Error(`${path} is not available in the static demo build.`);
  return handler(input);
};
