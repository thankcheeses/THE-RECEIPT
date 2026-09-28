/**
 * What has to be true before this container can serve anybody.
 *
 * Every case here is a way a deployment comes up looking healthy while being
 * unable to answer a request — the failure shape that cost a day on GitHub
 * Pages, where the workflow, the deploy and CI all reported success while the
 * live site served a rendered README.
 */
import { describe, expect, it } from "vitest";
import { readiness, resolvePort } from "./_core/deployment";

describe("the port the server binds", () => {
  it("defaults to 3000 when PORT is unset", () => {
    expect(resolvePort({})).toEqual({ port: 3000, mayScan: true });
  });

  it("uses PORT when the platform assigns one", () => {
    expect(resolvePort({ PORT: "8080", NODE_ENV: "production" })).toEqual({ port: 8080, mayScan: false });
  });

  it("refuses to scan for another port in production", () => {
    // The whole point. A platform routes to the port it assigned and to no
    // other, so listening elsewhere is indistinguishable from not listening.
    expect(resolvePort({ PORT: "8080", NODE_ENV: "production" }).mayScan).toBe(false);
    expect(resolvePort({ NODE_ENV: "production" }).mayScan).toBe(false);
  });

  it("still scans in development, where it is a convenience", () => {
    expect(resolvePort({ PORT: "3000", NODE_ENV: "development" }).mayScan).toBe(true);
    expect(resolvePort({}).mayScan).toBe(true);
  });

  it.each(["0", "-1", "70000", "not-a-port", "8080abc", "3000.5"])(
    "throws rather than silently defaulting when PORT is %j",
    (value) => {
      // Falling back to 3000 here would hide a typo'd deployment behind a
      // server that looks like it started correctly.
      expect(() => resolvePort({ PORT: value })).toThrow(/not a port number/);
    },
  );

  it("treats an empty PORT as unset rather than as an error", () => {
    // Platforms and compose files both produce PORT="" when a value is omitted.
    expect(resolvePort({ PORT: "" })).toEqual({ port: 3000, mayScan: true });
    expect(resolvePort({ PORT: "   " })).toEqual({ port: 3000, mayScan: true });
  });
});

const built = { distPath: "/app/dist/public", exists: () => true };
const reachable = { ping: async () => undefined };

describe("readiness", () => {
  it("is ready when the database answers and the client is built", async () => {
    const result = await readiness({ databaseUrl: "mysql://host/db", ...reachable, ...built });
    expect(result.ok).toBe(true);
    expect(result.checks.database.ok).toBe(true);
    expect(result.checks.staticBuild.ok).toBe(true);
  });

  it("is NOT ready when DATABASE_URL is unset", async () => {
    // This is the project's current state, and it is exactly the state that
    // used to boot silently: getDb() returns null and every query no-ops.
    const result = await readiness({ databaseUrl: undefined, ...built });
    expect(result.ok).toBe(false);
    expect(result.checks.database.detail).toMatch(/DATABASE_URL is not set/);
  });

  it("distinguishes 'not configured' from 'configured but unreachable'", async () => {
    // getDb() returns null for both. Whoever is deploying needs to know which.
    const unreachable = await readiness({
      databaseUrl: "mysql://host/db",
      ping: async () => {
        throw new Error("ECONNREFUSED");
      },
      ...built,
    });
    expect(unreachable.checks.database.detail).toMatch(/set but unreachable/);
    expect(unreachable.checks.database.detail).toMatch(/ECONNREFUSED/);

    const unset = await readiness({ databaseUrl: "", ...built });
    expect(unset.checks.database.detail).toMatch(/not set/);
    expect(unset.checks.database.detail).not.toMatch(/unreachable/);
  });

  it("is NOT ready when the client was never built", async () => {
    // serveStatic only console.errors a missing build directory, then serves
    // 404s for index.html forever.
    const result = await readiness({
      databaseUrl: "mysql://host/db",
      ...reachable,
      distPath: "/app/dist/public",
      exists: () => false,
    });
    expect(result.ok).toBe(false);
    expect(result.checks.staticBuild.detail).toMatch(/index\.html is missing/);
  });

  it("checks for index.html specifically, not merely the directory", async () => {
    const seen: string[] = [];
    await readiness({
      databaseUrl: "mysql://host/db",
      ...reachable,
      distPath: "/app/dist/public",
      exists: (path) => {
        seen.push(path);
        return true;
      },
    });
    expect(seen).toEqual(["/app/dist/public/index.html"]);
  });

  it("reports both failures at once rather than stopping at the first", async () => {
    const result = await readiness({ databaseUrl: undefined, distPath: "/app/dist/public", exists: () => false });
    expect(result.ok).toBe(false);
    expect(result.checks.database.ok).toBe(false);
    expect(result.checks.staticBuild.ok).toBe(false);
  });
});
