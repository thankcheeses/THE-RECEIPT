import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerHealthRoutes, resolvePort } from "./deployment";
import { registerReceiptPreview } from "../receiptPreview";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Before serveStatic, whose `app.use("*")` fallback would answer these with
  // index.html and make every health check look like a healthy 200.
  registerHealthRoutes(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    // Social crawlers need per-receipt metadata, so /r/:id is answered here
    // before the static handler falls everything through to index.html.
    registerReceiptPreview(app, path.resolve(import.meta.dirname, "public"));
    serveStatic(app);
  }

  const { port: preferredPort, mayScan } = resolvePort(process.env);

  // Production binds exactly what the platform assigned. Scanning upward would
  // leave the process listening on a port nothing routes to, which presents as
  // a failing health check with no hint that the port is the reason.
  if (!mayScan) {
    server.once("error", (error: NodeJS.ErrnoException) => {
      console.error(
        `Could not bind port ${preferredPort}: ${error.code ?? error.message}. ` +
          `Refusing to listen elsewhere — the platform routes to ${preferredPort} only.`,
      );
      process.exit(1);
    });
    server.listen(preferredPort, () => {
      console.log(`Listening on port ${preferredPort} (production). Readiness: /readyz`);
    });
    return;
  }

  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch((error) => {
  // Exiting non-zero is what makes a platform report a failed deploy instead of
  // a running container that answers nothing.
  console.error("Server failed to start:", error);
  process.exit(1);
});
