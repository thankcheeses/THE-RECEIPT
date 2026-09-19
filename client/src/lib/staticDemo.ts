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
  accuracy: number;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

type DemoReceipt = {
  id: number;
  userId: number;
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
};

type DemoChallenge = {
  id: number;
  receiptId: number;
  challengerId: number;
  challengedId: number;
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
  type: "CHALLENGE_RECEIVED" | "CHALLENGE_ACCEPTED" | "RECEIPT_RESOLVED";
  title: string;
  body: string | null;
  linkPath: string | null;
  actorId: number | null;
  challengeId: number | null;
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
  nextReceiptId: number;
  nextChallengeId: number;
  nextNotificationId: number;
};

const RESOLVED_STATUSES: ReceiptStatus[] = ["RIGHT", "WRONG", "PARTIALLY RIGHT"];

const emptyState = (): DemoState => ({
  user: null,
  receipts: [],
  challenges: [],
  notifications: [],
  dailyActivity: [],
  events: [],
  nextReceiptId: 4822,
  nextChallengeId: 1,
  nextNotificationId: 1,
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
        accuracy: 0,
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      };
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

const notify = (state: DemoState, input: Omit<DemoNotification, "id" | "readAt" | "createdAt">) => {
  state.notifications.unshift({ ...input, id: state.nextNotificationId++, readAt: null, createdAt: new Date() });
};

const requireUser = (state: DemoState): DemoUser => {
  if (!state.user) throw new Error("Please login (10001)");
  return state.user;
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
  "auth.me": () => readState().user,
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
      return receipt;
    }),

  "receipts.recentPublic": () => {
    const state = readState();
    return state.receipts
      .filter((receipt) => receipt.visibility === "PUBLIC")
      .sort((a, b) => b.id - a.id)
      .slice(0, 12)
      .map((receipt) => ({ receipt, user: state.user }));
  },
  "receipts.publicById": (input: { id: number }) => {
    const state = readState();
    const receipt = state.receipts.find((item) => item.id === input.id && item.visibility === "PUBLIC");
    if (!receipt) throw new Error("That receipt is private or no longer exists.");
    return { receipt, user: state.user };
  },
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
  "profile.setUsername": (input: { username: string }) =>
    mutate((state) => {
      const user = requireUser(state);
      const username = input.username.trim();
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        throw new Error("Usernames are 3-24 characters: letters, numbers, underscores.");
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
      notify(state, {
        userId: challenge.challengerId,
        type: "CHALLENGE_ACCEPTED",
        title: "Your challenge was accepted.",
        body: challenge.challengedPosition,
        linkPath: `/challenge/${challenge.id}`,
        actorId: challenge.challengedId,
        challengeId: challenge.id,
      });
      state.events.push({ event: "challenge_accepted", properties: { challengeId: challenge.id, confidence: input.confidence }, at: new Date() });
      return {
        challenge,
        receipt: state.receipts.find((receipt) => receipt.id === challenge.receiptId) ?? null,
      };
    }),
  "notifications.list": () => {
    const state = readState();
    const user = requireUser(state);
    return state.notifications.filter((item) => item.userId === user.id).slice(0, 25);
  },
  "notifications.unreadCount": () => {
    const state = readState();
    if (!state.user) return 0;
    return state.notifications.filter((item) => item.userId === state.user!.id && !item.readAt).length;
  },
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
