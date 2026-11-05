/**
 * The things that decide whether this container can serve traffic.
 *
 * THE RECEIPT has never been deployed as a server. Reading the boot path with
 * that in mind turned up three places where a broken deployment would come up
 * looking healthy — the same failure shape as the GitHub Pages incident, where
 * every job reported success while the live site served the wrong thing.
 *
 *   1. The port. `findAvailablePort` scans upward from $PORT and binds the
 *      first free one. That is a helpful development convenience and actively
 *      harmful in production: every container platform assigns a port and
 *      routes to that port only. Binding 3001 because 3000 was taken means the
 *      process starts, logs a cheerful "Server running on…", and the platform's
 *      health checks hit a port nobody is listening on. The deploy fails with
 *      no explanation anywhere near the cause.
 *
 *   2. No health endpoint existed at all, so a platform could only ask "did a
 *      TCP port open". That cannot distinguish a process that is up from an
 *      application that can actually answer.
 *
 *   3. `getDb()` returns null when DATABASE_URL is unset. Its try/catch wraps
 *      only `drizzle(url)` — mysql2 pool construction, which does not open a
 *      connection — so an unreachable database is not caught there at all; it
 *      surfaces later, at query time. Either way the server boots perfectly
 *      happily with no working database and serves the client shell, while
 *      data-dependent calls fail or quietly return nothing, with no server-side
 *      signal saying why. (An earlier version of this comment said getDb
 *      swallows connection failures and that every action fails. Both overstate
 *      it; the reachability check below is what actually establishes the
 *      database is there.)
 *
 * Hence the split below. /healthz answers "is this process alive" and touches
 * nothing. /readyz answers "can this process actually serve", which is the
 * question worth asking, and names what is missing when the answer is no.
 */
import { sql } from "drizzle-orm";
import { type Express } from "express";
import fs from "node:fs";
import { getDb } from "../db";
import { staticDistPath } from "./vite";

export type Check = { ok: boolean; detail: string };

export type Readiness = {
  ok: boolean;
  checks: { database: Check; staticBuild: Check };
};

/**
 * Resolves the port to bind.
 *
 * Returns the port and whether scanning for a free one is permitted. Only
 * development may scan; anywhere else, bind what the platform assigned or fail.
 *
 * `mayScan` keys off `NODE_ENV === "development"` rather than
 * `!== "production"`, and that asymmetry is the whole point. index.ts decides
 * how to serve the client with `NODE_ENV === "development"`, so with NODE_ENV
 * unset it serves the built static files. Had this function asked
 * `!== "production"` instead, that same unset NODE_ENV would have served static
 * files *and* scanned upward off the assigned port — production behaviour on one
 * line, development behaviour on the other, which is exactly the silent
 * misdeployment this module exists to prevent. The two predicates must name the
 * same environment, so both name development.
 *
 * `env` is typed as a string record so `process.env` can be passed directly:
 * NodeJS.ProcessEnv against an all-optional literal type trips TypeScript's
 * weak-type check (TS2559) and fails `pnpm check`.
 *
 * @throws when PORT is set to something that is not a usable port, because
 *   defaulting to 3000 there would hide a misconfigured deployment behind a
 *   server that appears to start correctly.
 */
export function resolvePort(env: Readonly<Record<string, string | undefined>>): {
  port: number;
  mayScan: boolean;
} {
  const raw = env.PORT?.trim();
  const isDevelopment = env.NODE_ENV === "development";

  if (raw === undefined || raw === "") {
    return { port: 3000, mayScan: isDevelopment };
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT is ${JSON.stringify(raw)}, which is not a port number between 1 and 65535.`);
  }

  return { port, mayScan: isDevelopment };
}

/**
 * Whether this process can serve requests.
 *
 * Dependencies are injected so the rules are testable without a database or a
 * built client. `databaseUrl` is read rather than relying on getDb's return
 * value alone: getDb answers null both for "not configured" and for "configured
 * but unreachable", and those need different messages to whoever is deploying.
 */
export async function readiness(
  options: {
    databaseUrl?: string;
    ping?: () => Promise<void>;
    distPath?: string;
    exists?: (path: string) => boolean;
    servesStaticBuild?: boolean;
  } = {},
): Promise<Readiness> {
  const databaseUrl = "databaseUrl" in options ? options.databaseUrl : process.env.DATABASE_URL;
  const distPath = options.distPath ?? staticDistPath();
  const exists = options.exists ?? ((path: string) => fs.existsSync(path));
  // In development Vite serves the client from memory and dist/public does not
  // exist, so checking for it there reports a missing build on a server that is
  // serving the application perfectly well — a health endpoint that lies in the
  // one direction that matters, by naming a cause that is not the cause.
  const servesStaticBuild = options.servesStaticBuild ?? process.env.NODE_ENV !== "development";

  const ping =
    options.ping ??
    (async () => {
      const db = await getDb();
      if (!db) throw new Error("the driver did not connect");
      await db.execute(sql`select 1`);
    });

  let database: Check;
  if (!databaseUrl) {
    database = { ok: false, detail: "DATABASE_URL is not set, so every request that reads or writes will fail." };
  } else {
    try {
      await ping();
      database = { ok: true, detail: "reachable" };
    } catch (error) {
      database = { ok: false, detail: `DATABASE_URL is set but unreachable: ${(error as Error).message}` };
    }
  }

  let staticBuild: Check;
  if (!servesStaticBuild) {
    staticBuild = { ok: true, detail: "not applicable — Vite serves the client in development" };
  } else {
    const indexHtml = `${distPath}/index.html`;
    staticBuild = exists(indexHtml)
      ? { ok: true, detail: distPath }
      : { ok: false, detail: `${indexHtml} is missing — run \`pnpm build\` before starting the server.` };
  }

  return { ok: database.ok && staticBuild.ok, checks: { database, staticBuild } };
}

/**
 * Registers the health endpoints.
 *
 * MUST be called before serveStatic, whose `app.use("*")` fallback answers
 * everything with index.html and would otherwise swallow both routes.
 */
export function registerHealthRoutes(app: Express): void {
  const startedAt = Date.now();

  // Liveness. Touches nothing, so it stays true for as long as the event loop
  // is turning, which is the only thing it is meant to report.
  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      commit: process.env.GIT_SHA ?? null,
    });
  });

  // Readiness. 503 until the process can actually serve, with the reason.
  app.get("/readyz", async (_req, res) => {
    const result = await readiness();
    res.status(result.ok ? 200 : 503).json(result);
  });
}
