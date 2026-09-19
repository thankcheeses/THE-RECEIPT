# THE RECEIPT

> Put it on the record.

THE RECEIPT is a social prediction game. You make a prediction about a future event, set how confident you are and when it should resolve, then lock it permanently. You get back a timestamped receipt. Later, you come back and record whether you were **RIGHT**, **WRONG**, **PARTIALLY RIGHT**, or **TOO EARLY**.

Predictions cannot be edited after they are locked. That is the point — the original statement stays as evidence.

There is no money, betting, or wagering in the product.

**Live demo:** https://thankcheeses.github.io/THE-RECEIPT/

## Features

- **Daily challenge** — one prompt a day from a catalog of 50+ prompts across nine categories, with a YES/NO answer and a confidence level.
- **Custom receipts** — free-text predictions with a category, resolution date, confidence, and public/private visibility.
- **Immutable records** — no edit path exists; the only post-creation change is resolution by the owner.
- **Resolution** — RIGHT, WRONG, PARTIALLY RIGHT, or TOO EARLY, with an optional note.
- **Public receipt URLs** — `/r/:id` is shareable without signing in; private receipts are never returned by the public procedure.
- **Public feed** — `/feed` browses every public receipt newest-first, filterable by category, with keyset pagination.
- **Public profiles** — `/u/:username` shows a caller's public receipts and a record computed from public receipts only.
- **Streaks** — real daily streaks with a seven-day activity view, plus day-over-day retention data.
- **Challenges** — name another user when creating a receipt; they can accept and lock their own opposing position.
- **Notifications** — in-app bell with unread count for challenges received and accepted.
- **Profiles** — accuracy, category breakdown, confidence calibration, biggest call, and biggest miss.
- **Analytics** — a small closed event vocabulary covering signup, receipt creation, sharing, and resolution.
- **Sharing** — one interface with platform adapters: OS share sheet, copy link, and composer intents for X, Bluesky, WhatsApp, Reddit and Facebook.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/daily` | Daily challenge and confidence lock |
| `/create` | Custom prediction form with live receipt preview |
| `/receipts` | Authenticated receipt archive |
| `/receipt/:id` | Authenticated receipt detail and resolution |
| `/feed` | Public receipt feed with category filters |
| `/r/:id` | Public receipt detail |
| `/u/:username` | Public profile: a caller's public receipts and record |
| `/challenges` | Authenticated challenge list |
| `/challenge/:id` | Head-to-head challenge detail and acceptance |
| `/leaderboard` | Leaderboard views (currently demo-seeded and labeled as such in the UI) |
| `/profile` | Authenticated profile and statistics |

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Wouter · Express 4 · tRPC 11 · Drizzle ORM · MySQL/TiDB · Zod · Satori + resvg (social cards) · Vitest · pnpm

The app runs as a single Node process: Express serves the client and hosts tRPC under `/api/trpc`.

## Running locally

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm dev
```

Set the environment variables listed in [`ENVIRONMENT.md`](ENVIRONMENT.md) before starting. They are read server-side; never commit real values.

## Tests, checks, and build

```bash
pnpm test     # Vitest
pnpm check    # TypeScript, no emit
pnpm build    # Vite client bundle + esbuild server bundle
pnpm start    # run the production build
```

## Database

The schema is in `drizzle/schema.ts`; generated SQL migrations are in `drizzle/`.

```bash
pnpm drizzle-kit generate   # generate SQL from a schema change
pnpm drizzle-kit migrate    # apply migrations
pnpm db:push                # both, in sequence
```

Review generated SQL before applying it to a database that holds real data.

## Sharing

Sharing goes through one interface (`client/src/lib/sharing/`): components ask for the available targets and run one, and hold no platform URLs themselves.

Every target is either a browser capability or a documented public web intent. **Nothing posts on a user's behalf.** An intent opens the platform's own composer with the text prefilled and the user decides whether to send it. No platform credentials are stored or required.

| Target | What it actually does |
| --- | --- |
| Share… | Hands off to the OS share sheet (where `navigator.share` exists) |
| Copy link | Copies the canonical `/r/:id` URL |
| X, Bluesky, WhatsApp, Reddit, Facebook | Opens that platform's composer with text prefilled; the user posts |
| Save receipt image | Downloads the generated card |

Instagram and TikTok have **no web intent for composing a post**. Publishing to them requires their Content Publishing / Content Posting APIs, which need a registered app, platform review, an eligible business or creator account, and server-held credentials. Rather than implying one-tap posting, the product offers the receipt card for the user to post themselves.

Every share points at the canonical receipt URL.

## Social previews

A public receipt at `/r/:id` is served by the Node app with its own Open Graph and Twitter card metadata — title, description, canonical URL, and a generated 1200×630 PNG at `/r/:id/image.png`. The card is drawn from the same visual language as the in-app receipt, so a shared link previews as the receipt it points at.

The tags are read from the database per request, so a receipt created after the last deploy previews correctly. Private receipts are never given metadata: `/r/:id` falls through to the plain application shell and the image endpoint returns 404.

The image is rendered with `satori` + `@resvg/resvg-js` and fonts from `@fontsource`, and cached briefly in memory.

**The GitHub Pages demo does not do this.** Pages serves static files with no server, so it cannot generate per-receipt tags. Its receipts also live in one browser's `localStorage` and are not reachable by anyone else, so there is nothing for a crawler to preview. The demo keeps the site's generic tags.

## GitHub Pages demo

The demo at https://thankcheeses.github.io/THE-RECEIPT/ is built and published by `.github/workflows/deploy-pages.yml` on every push to `main`.

GitHub Pages serves static files only — no Express, no database. The static build therefore swaps the tRPC HTTP link for `client/src/lib/staticLink.ts`, which resolves every procedure in the browser against `client/src/lib/staticDemo.ts` using `localStorage`. Signing in creates a local demo account rather than running the real OAuth redirect, and data persists per browser instead of per account. Everything else — routes, layout, styling, the daily prompt rotation — is the same code as the server build.

```bash
pnpm build:static   # writes dist/public with base path /THE-RECEIPT/
```

The script copies `index.html` to `404.html` so deep links such as `/THE-RECEIPT/daily` resolve, and writes `.nojekyll`. Override the base path with `VITE_BASE_PATH=/ pnpm build:static` when serving from a domain root.

To enable Pages on a fork: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Deployment

Any Node host works. It needs Node.js 22+, pnpm, a MySQL/TiDB database, the environment variables from [`ENVIRONMENT.md`](ENVIRONMENT.md), and an OAuth callback URL matching the deployment origin.

```bash
pnpm install
pnpm build
pnpm start
```

Apply pending database migrations before starting a new build against an existing database.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT — see the `license` field in `package.json`.
