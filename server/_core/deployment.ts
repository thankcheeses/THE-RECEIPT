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
 *   3. `getDb()` returns null when DATABASE_URL is unset and swallows
 *      connection failures with a console.warn. The server therefore boots
 *      perfectly happily with no database, serves the client shell, and fails
 *      every single action at runtime with nothing on the server side saying
 *      why.
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
 * Returns the port and whether scanning for a free one is permitted. In
 * production it never is: bind what the platform assigned or fail.
 *
 * @throws when PORT is set to something that is not a usable port, because
 *   defaulting to 3000 there would hide a misconfigured deployment behind a
 *   server that appears to start correctly.
 */
export function resolvePort(env: { PORT?: string; NODE_ENV?: string }): {
  port: number;
  mayScan: boolean;
} {
  const raw = env.PORT?.trim();
  const isProduction = env.NODE_ENV === "production";

  if (raw === undefined || raw === "") {
    return { port: 3000, mayScan: !isProduction };
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT is ${JSON.stringify(raw)}, which is not a port number between 1 and 65535.`);
  }

  return { port, mayScan: !isProduction };
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
  } = {},
): Promise<Readiness> {
  const databaseUrl = "databaseUrl" in options ? options.databaseUrl : process.env.DATABASE_URL;
  const distPath = options.distPath ?? staticDistPath();
  const exists = options.exists ?? ((path: string) => fs.existsSync(path));

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

  const indexHtml = `${distPath}/index.html`;
  const staticBuild = exists(indexHtml)
    ? { ok: true, detail: distPath }
    : { ok: false, detail: `${indexHtml} is missing — run \`pnpm build\` before starting the server.` };

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
