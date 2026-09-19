# THE RECEIPT — Architecture

## Stack

- React 19 and TypeScript
- Vite client build
- Tailwind CSS 4 with project-specific CSS tokens
- Express 4 runtime
- tRPC 11 for typed client/server procedures
- Drizzle ORM with MySQL/TiDB
- Manus OAuth and session context
- Vitest for tests
- pnpm for package management

## Runtime shape

The application runs as one Node server process. The Express entrypoint in `server/_core/index.ts` hosts the Vite development bridge and production assets, while tRPC requests are served under `/api/trpc`. The client binds to the typed `AppRouter` through `client/src/lib/trpc.ts`.

## Frontend flow

`client/src/main.tsx` creates the React Query client, tRPC client, session-aware fetch behavior, and app providers. `client/src/App.tsx` owns the route switch and the current feature UI. Global styles are in `client/src/index.css`; the app deliberately keeps the visual system in one source so future agents can see the complete token and responsive behavior.

## Backend flow

`server/routers.ts` contains the public and protected procedures. `server/db.ts` contains database access helpers and profile aggregation. `server/_core/` is scaffold infrastructure and should not be modified casually. Shared domain constants live in `shared/seed.ts`.

## Request examples

- Public home: `daily.get` and `receipts.recentPublic`.
- Daily lock: authenticated client calls `daily.answer`, which ensures today’s challenge exists and inserts a receipt.
- Custom lock: authenticated client calls `receipts.create`, which validates input, optionally resolves a challenged username, inserts the receipt, and optionally inserts a challenge.
- Resolution: authenticated owner calls `receipts.resolve`; ownership is checked server-side before status and accuracy are updated.
- Public detail: `receipts.publicById` joins the public receipt to its user and refuses private rows.

## Database and migrations

The schema source is `drizzle/schema.ts`. Generated SQL migrations are in `drizzle/`. The current domain tables are `users`, `dailyChallenges`, `receipts`, `challenges`, and `achievements`. The project should use Drizzle generation/migration workflows rather than hand-editing production schema.

## Authentication and secrets

Runtime credentials are provided through environment variables. `.env.example` documents the required names without values. Secrets are read server-side through `server/_core/env.ts`; no credentials should be placed in client code or committed files.

## Deployment assumptions

The project’s intended managed runtime is the Manus WebDev deployment environment. `pnpm build` creates Vite assets and bundles the Node server; `pnpm start` starts the production bundle. A compatible external host needs Node.js 22+, a MySQL/TiDB database, the environment variables, and an OAuth callback configuration that matches the deployment origin.

## Extension rules

Prefer adding a typed tRPC procedure and a small database helper over introducing REST endpoints. Add schema changes through Drizzle. Keep public/private authorization explicit. Preserve the single-process runtime and avoid background-worker assumptions unless the hosting plan is changed intentionally.
