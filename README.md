# THE RECEIPT

> Put it on the record.

THE RECEIPT is a social prediction game. Users make predictions about future events, choose a confidence level and resolution date, lock the prediction permanently, then return later to see whether they were **RIGHT**, **WRONG**, **PARTIALLY RIGHT**, or **TOO EARLY**.

The product is intentionally human-first: no betting, money, crypto, prizes, AI chatbot, or AI-generated prediction system is part of the current MVP.

## Current MVP

- Mobile-first landing page and daily challenge flow.
- Curated daily prompt catalog with 50+ prompts across nine categories.
- Custom receipt creation with category, resolution date, confidence, visibility, and optional username challenge.
- Immutable receipt records rendered as thermal-paper artifacts.
- Public receipt URLs under `/r/:id` with a “Make your receipt” acquisition CTA.
- Private authenticated archive with ALL, PENDING, RIGHT, and WRONG filters.
- Receipt resolution with RIGHT, WRONG, PARTIALLY RIGHT, and TOO EARLY states.
- Challenge list and head-to-head detail view.
- Profile statistics, category breakdown, confidence calibration summary, biggest miss, and biggest call.
- Demo-labeled leaderboard and example content so empty states do not look dead.
- Manus OAuth authentication, Drizzle/MySQL persistence, tRPC procedures, server-side validation, and Vitest coverage.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Product landing page and entry points |
| `/daily` | Current daily challenge and confidence lock flow |
| `/create` | Custom prediction form and live receipt preview |
| `/receipts` | Authenticated receipt archive |
| `/receipt/:id` | Authenticated receipt detail and resolution |
| `/r/:id` | Public receipt detail and sharing loop |
| `/challenges` | Authenticated challenge list |
| `/challenge/:id` | Head-to-head challenge detail |
| `/leaderboard` | Demo-seeded leaderboard views |
| `/profile` | Authenticated profile and statistics |

## Local development

This project uses the Manus WebDev full-stack template: React, Vite, Tailwind CSS, Express, tRPC, Drizzle ORM, MySQL/TiDB, and Manus OAuth.

```bash
pnpm install
cp .env.example .env
pnpm check
pnpm test
pnpm build
pnpm dev
```

The application expects the environment variables listed in `.env.example`. In a Manus deployment, these are normally injected by the platform. Do not commit `.env` files or real credentials.

## Database

The schema is in `drizzle/schema.ts`. Migrations are in `drizzle/` and must be reviewed before applying them. The current project has the baseline migration plus the receipt-domain migration.

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

The existing `pnpm db:push` script runs generation and migration together. Use it only when the target database and migration change are understood.

## Verification

```bash
pnpm check
pnpm test
pnpm build
```

The test suite currently covers auth logout cookie clearing and the receipt seed/domain contract. `INTERACTION_AUDIT.md` documents the route-level interaction contract and durable outcomes.

## Deployment

For Manus WebDev, use the saved project checkpoint and the platform’s publish flow. The production build is created with `pnpm build` and started with `pnpm start`. For another Node hosting provider, provide Node.js 22+, pnpm, the required environment variables, a MySQL/TiDB database, and the same build/start commands.

### GitHub Pages (static demo)

`https://thankcheeses.github.io/THE-RECEIPT/` serves the same interface as the hosted app, built by `.github/workflows/deploy-pages.yml` on every push to `main`.

GitHub Pages serves files only — there is no Express server and no MySQL behind it — so the static build swaps the tRPC HTTP link for `client/src/lib/staticLink.ts`, which resolves every procedure in the browser against `client/src/lib/staticDemo.ts` (localStorage). Sign-in creates a local demo account instead of running the Manus OAuth redirect, and receipts persist per browser rather than per account. Everything else — routes, layout, styling, the daily prompt rotation — is the same code as the server build.

Build it locally with:

```bash
pnpm build:static          # writes dist/public with base path /THE-RECEIPT/
```

The script copies `index.html` to `404.html` so deep links such as `/THE-RECEIPT/daily` resolve, and writes `.nojekyll` so Jekyll leaves the assets alone. Override the base path with `VITE_BASE_PATH=/ pnpm build:static` when serving from a domain root.

Enable it once under **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Repository guide

- `HANDOFF.md` — continuation guide for another developer or coding agent.
- `PRODUCT.md` — current product definition and non-goals.
- `DESIGN_SYSTEM.md` — actual visual tokens and component rules.
- `ARCHITECTURE.md` — current application architecture and request flow.
- `DATA_MODEL.md` — actual tables, fields, lifecycle, and authorization rules.
- `CONTRIBUTING.md` — safe development workflow.
- `CHANGELOG.md` — current implementation history.
- `INTERACTION_AUDIT.md` — route-to-outcome interaction matrix.

## GitHub preparation

The source is prepared for a repository under the `thankcheeses` GitHub account/organization, but no GitHub repository was created or pushed from this session because no GitHub connector or authenticated GitHub remote is configured. Use the exported project directory or ZIP, create the repository, then add its remote and push the desired branch.

```bash
git remote add github https://github.com/thankcheeses/the-receipt.git
git push -u github main
```

Confirm the repository name and branch policy before running those commands.
