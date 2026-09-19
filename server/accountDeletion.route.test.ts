import { beforeEach, describe, expect, it, vi } from "vitest";
import { USERNAME_UNAVAILABLE } from "@shared/accountDeletion";

const deleted: number[] = [];
let retired = new Set<string>();
let holders: Record<string, number> = {};
const cleared: string[] = [];

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    deleteAccount: async (userId: number) => {
      deleted.push(userId);
      return { deletedPrivateReceipts: 0, anonymizedReceipts: 2, usernameRetired: true };
    },
    // The real availability rule, run against in-memory stand-ins.
    isUsernameAvailable: async (username: string, forUserId: number) => {
      const holder = holders[username.toLowerCase()];
      if (holder !== undefined && holder !== forUserId) return false;
      return !retired.has(username.toLowerCase());
    },
    getDb: async () => ({ update: () => ({ set: () => ({ where: async () => undefined }) }) }) as never,
  };
});

const { appRouter } = await import("./routers");
type Ctx = Parameters<typeof appRouter.createCaller>[0];

const caller = (userId = 1, role: "user" | "admin" = "user") =>
  appRouter.createCaller({
    user: { id: userId, openId: `u${userId}`, role, username: null },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: (name: string) => cleared.push(name) },
  } as unknown as Ctx);

const anonymous = () =>
  appRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: (name: string) => cleared.push(name) },
  } as unknown as Ctx);

beforeEach(() => {
  deleted.length = 0;
  cleared.length = 0;
  retired = new Set();
  holders = {};
});

describe("account.delete", () => {
  it("deletes the caller's own account", async () => {
    const result = await caller(7).account.delete({ confirm: "DELETE MY ACCOUNT" });
    expect(deleted).toEqual([7]);
    expect(result).toMatchObject({ anonymizedReceipts: 2, usernameRetired: true });
  });

  it("clears the session, because the account it names is gone", async () => {
    await caller(7).account.delete({ confirm: "DELETE MY ACCOUNT" });
    expect(cleared).toHaveLength(1);
  });

  it("refuses without the exact confirmation", async () => {
    for (const confirm of ["", "delete my account", "yes", "DELETE MY ACCOUNT "]) {
      await expect(caller(7).account.delete({ confirm } as never)).rejects.toThrow();
    }
    expect(deleted).toHaveLength(0);
  });

  it("requires an account", async () => {
    await expect(anonymous().account.delete({ confirm: "DELETE MY ACCOUNT" })).rejects.toThrow(/login/i);
    expect(deleted).toHaveLength(0);
  });

  /**
   * The important authorization property: there is no id parameter, so the
   * procedure has no way to name another account — not for an ordinary user
   * and not for an admin. Deletion is always self-service.
   */
  it("ignores a smuggled user id and deletes only the caller", async () => {
    // The input schema has no id field, so an extra key is stripped rather
    // than honoured. The account that goes is always the authenticated one.
    await caller(1).account.delete({ confirm: "DELETE MY ACCOUNT", userId: 2 } as never);
    expect(deleted).toEqual([1]);
  });

  it("gives an admin no override — they can only delete themselves", async () => {
    await caller(9, "admin").account.delete({ confirm: "DELETE MY ACCOUNT" });
    expect(deleted).toEqual([9]);
  });
});

describe("profile.setUsername respects retirement", () => {
  it("accepts a free username", async () => {
    expect(await caller(1).profile.setUsername({ username: "nia" })).toEqual({ username: "nia" });
  });

  it("refuses one held by somebody else", async () => {
    holders.nia = 2;
    await expect(caller(1).profile.setUsername({ username: "nia" })).rejects.toThrow(USERNAME_UNAVAILABLE);
  });

  it("refuses one retired by a deleted account", async () => {
    retired.add("nia");
    await expect(caller(1).profile.setUsername({ username: "nia" })).rejects.toThrow(USERNAME_UNAVAILABLE);
  });

  it("refuses a retired handle re-cased, so retirement cannot be sidestepped", async () => {
    retired.add("nia");
    await expect(caller(1).profile.setUsername({ username: "NiA" })).rejects.toThrow(USERNAME_UNAVAILABLE);
  });

  it("refuses it to the very person who retired it", async () => {
    // Signing up again does not get the handle back: the whole point is that
    // the old identity cannot be resumed.
    retired.add("nia");
    await expect(caller(99).profile.setUsername({ username: "nia" })).rejects.toThrow(USERNAME_UNAVAILABLE);
  });

  it("says the same thing whether taken or retired", async () => {
    holders.taken = 2;
    retired.add("gone");
    const takenError = await caller(1).profile.setUsername({ username: "taken" }).catch((error) => error.message);
    const retiredError = await caller(1).profile.setUsername({ username: "gone" }).catch((error) => error.message);
    expect(takenError).toBe(retiredError);
  });

  it("lets someone keep their own username", async () => {
    holders.nia = 1;
    expect(await caller(1).profile.setUsername({ username: "nia" })).toEqual({ username: "nia" });
  });
});
