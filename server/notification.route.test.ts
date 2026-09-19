/**
 * How the bell's two reads behave.
 *
 * Generation has no scheduler behind it, so it hangs off these procedures.
 * That makes two things worth pinning: both reads actually trigger it, and
 * neither is reachable without an account.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const synced: Array<number> = [];
const listed: Array<number> = [];
const counted: Array<number> = [];

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  syncResolutionNotifications: async (userId: number) => {
    synced.push(userId);
    return 0;
  },
  listNotifications: async (userId: number) => {
    listed.push(userId);
    return [
      {
        id: 1,
        userId,
        type: "RECEIPT_DUE" as const,
        title: "Receipt #004821 is ready to resolve.",
        body: "This will absolutely happen.",
        linkPath: "/receipt/4821",
        actorId: null,
        challengeId: null,
        receiptId: 4821,
        readAt: null,
        createdAt: new Date(),
      },
    ];
  },
  countUnreadNotifications: async (userId: number) => {
    counted.push(userId);
    return 1;
  },
}));

const { appRouter } = await import("./routers");
type Ctx = Parameters<typeof appRouter.createCaller>[0];

const caller = (userId = 1) =>
  appRouter.createCaller({
    user: { id: userId, openId: `u${userId}`, role: "user" },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as Ctx);

const anonymous = () =>
  appRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as Ctx);

beforeEach(() => {
  synced.length = 0;
  listed.length = 0;
  counted.length = 0;
});

describe("notifications.list", () => {
  it("generates due notifications before reading, so a poll surfaces them", async () => {
    await caller(7).notifications.list();
    expect(synced).toEqual([7]);
    expect(listed).toEqual([7]);
  });

  it("returns the caller's own notifications, receipt link included", async () => {
    const items = await caller(7).notifications.list();
    expect(items[0]).toMatchObject({ userId: 7, type: "RECEIPT_DUE", linkPath: "/receipt/4821", receiptId: 4821 });
  });

  it("requires an account", async () => {
    await expect(anonymous().notifications.list()).rejects.toThrow(/login/i);
    expect(synced).toHaveLength(0);
  });
});

describe("notifications.unreadCount", () => {
  it("generates due notifications before counting", async () => {
    // Otherwise the badge would lag a poll behind the panel.
    await caller(7).notifications.unreadCount();
    expect(synced).toEqual([7]);
    expect(counted).toEqual([7]);
  });

  it("requires an account", async () => {
    await expect(anonymous().notifications.unreadCount()).rejects.toThrow(/login/i);
    expect(synced).toHaveLength(0);
  });
});

describe("generation is always for the caller", () => {
  it("never syncs a user id other than the authenticated one", async () => {
    await caller(3).notifications.list();
    await caller(9).notifications.unreadCount();
    // No procedure takes a user id, so this cannot be steered from outside.
    expect(synced).toEqual([3, 9]);
  });
});
