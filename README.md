# THE RECEIPT

> Put it on the record.

THE RECEIPT is a social prediction game. You make a prediction about a future event, set how confident you are and when it should resolve, then lock it permanently. You get back a timestamped receipt. Later, you come back and record whether you were **RIGHT**, **WRONG**, **PARTIALLY RIGHT**, or **TOO EARLY**.

Predictions cannot be edited after they are locked. That is the point — the original statement stays as evidence.

There is no money, betting, or wagering in the product.

**Live demo:** https://thankcheeses.github.io/THE-RECEIPT/

## Features

- **Daily challenge** — one prompt a day, with a YES/NO answer and a confidence level. A prompt is served only once an administrator has approved it; there is no auto-publish path, and a day with nothing approved shows an honest empty state.
- **Custom receipts** — free-text predictions with a category, resolution date, confidence, and public/private visibility.
- **Kinds of receipt** — the author says whether a receipt is a Prediction, Goal, Personal, Fun or Memory. That choice decides what other people can do with it: you can disagree with a claim about the world, but a goal gets support instead, and a memory takes no response at all.
- **Memory** — "what will this mean later". A memory carries no resolution date and is never resolved RIGHT or WRONG, because the existing resolution vocabulary cannot describe what a memory came to mean. It is locked, kept, and handed back by the archive.
- **Dream** — captured by voice from a cold open, transcribed in the browser, and always private. The audio is never uploaded. Dreams take no interactions, never appear on any public surface, are never interpreted, and are deleted outright with the account.
- **Archive** — `/archive` searches everything you have written: plain text matching over the receipt, its title and any resolution note, filterable by type. It is scoped to one author and has no public variant.
- **Resurfacing** — at most one receipt a day, handed back on its anniversary. It states the date and what you wrote, and claims nothing beyond that.
- **Me too** — writing your own receipt after someone else's. It is not a reaction: it creates a real, independently locked receipt that remembers which one it followed.
- **Resolving soon** — open public receipts ordered by how close they are to their resolution date.
- **Immutable records** — no edit path exists; the only post-creation change is resolution by the owner.
- **Resolution** — RIGHT, WRONG, PARTIALLY RIGHT, or TOO EARLY, with an optional note.
- **Public receipt URLs** — `/r/:id` is shareable without signing in; private receipts are never returned by the public procedure.
- **Public feed** — `/feed` browses every public receipt newest-first, filterable by category, with keyset pagination.
- **Public profiles** — `/u/:username` shows a caller's public receipts and a record computed from public receipts only.
- **Streaks** — real daily streaks with a seven-day activity view, plus day-over-day retention data.
- **Challenges** — name another user when creating a receipt; they can accept and lock their own opposing position.
- **Notifications** — in-app bell with unread count for challenges received and accepted.
- **Profiles** — accuracy, category breakdown, confidence calibration, biggest call, and biggest miss.
- **Reporting and moderation** — signed-in people can report a public receipt; administrators can take one off public surfaces. A takedown hides, it never deletes.
- **Analytics** — a small closed event vocabulary. Contents are never recorded: a dream capture logs only its length, and an archive search logs the result count, never the term.
- **Privacy and Terms** — `/privacy` and `/terms`, written against the code and marked as drafts because no lawyer has read them.
- **Sharing** — one interface with platform adapters: OS share sheet, copy link, and composer intents for X, Bluesky, WhatsApp, Reddit and Facebook.

## Interaction policy

What a receipt offers depends on what kind of statement it is, not on its category. The policy lives in `shared/interactionPolicy.ts` and is used by both the client (which buttons to draw) and the server (which responses to accept), so the two cannot drift. The server is authoritative — a disallowed response is rejected even if the request bypasses the UI.

| Kind | Responses | Always available |
| --- | --- | --- |
| Prediction | I agree · I disagree | Me too · Share |
| Goal | Support | Me too · Share |
| Personal | Support | Me too · Share |
| Fun | I agree · I disagree | Me too · Share |
| Memory | — | Me too · Share |
| Dream | — | — |

`REACT` is retired. Fun receipts used to offer a single unnamed reaction, which was a like with a different name; a named reaction vocabulary would have been the same thing with more buttons. A silly claim is still a claim, so Fun now answers like a prediction. The `REACT` type stays in the enum and in the database because rows already recorded under it are responses real people made, and they are still counted and displayed — nothing new is written under it.

A memory takes no response: there is nothing to agree or disagree with, and "support" would answer a question nobody asked. A dream takes none either, and that is structural rather than cosmetic — the server refuses all four, so no surface can add one later by accident.

Support and agreement are stored as distinct interaction types. "147 people support this goal" and "147 people agree this will happen" are different facts, and merging them would lose the difference permanently.

Categories and kinds are independent: one category holds several kinds. A category only suggests a starting point, and the author's choice is what is stored.

## Age, privacy and terms

THE RECEIPT has a product age floor of **13**. It is stated in the footer, at
every point that invites somebody to make an account, and in both legal pages.
Nothing verifies it: no date of birth is collected, and adding a verification
system to police a rule we need that data for nowhere else would mean holding
more about people, not less.

That floor is a rule this product enforces. It is **not** a claim that the
product is COPPA compliant, that COPPA does not apply, or that any other
regime is satisfied. No such assessment has been done.

`/privacy` and `/terms` are written against this code, sentence by sentence,
and are **marked as drafts in the product** because no lawyer has read them.
They deliberately contain no compliance claim, no certification, no audit
claim and no security guarantee. `shared/legal.test.ts` fails if any of those
phrases appears, so adding one means deleting a test on the way.

## Reporting and moderation

A receipt cannot be edited or deleted — not by its author, and not by an administrator. Moderation therefore never rewrites the record; it changes whether the record is *shown*.

- **Reporting** requires an account. One report per person per receipt is enforced by a unique index, which is what keeps the queue meaningful, and an anonymous report has no key to deduplicate on. Signed-out visitors are pointed at the published abuse contact (`VITE_ABUSE_CONTACT`) instead. You cannot report your own receipt, because taking it down is not something reporting can achieve.
- **Takedown** sets the receipt's `moderationStatus` to `HIDDEN`. The row, its interactions and its ME TOO lineage are untouched, so restoring is a genuine undo. Its author still sees it, with a notice, and can still resolve it — moderation and resolution are separate.
- **Public surfaces** all compose one condition, `publicReceiptWhere()` in `server/db.ts`: visible means the author made it public *and* moderation has not hidden it. The feed, Resolving Soon, public profiles, the public link, the Open Graph metadata, the generated cards and the ME TOO count therefore close together. The static demo applies the same rule through `isPubliclyVisible()` in `shared/moderation.ts`.
- **Audit trail.** Every decision appends a row to `moderationActions`, including a dismissal, recording the moderator, the resulting status, an optional note, and how many reports it closed. Nothing in that table is ever updated or deleted.

| Reason | Reason | Reason |
| --- | --- | --- |
| Harassment | Hate | Violence or threats |
| Sexual content | Self-harm | Private information |
| Impersonation | Spam or scam | Illegal content |
| Something else | | |

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
| `/archive` | Your own archive: search and filter everything you have written |
| `/dream` | Dream capture — microphone opens on arrival, always private |
| `/privacy` | Privacy policy (draft) |
| `/terms` | Terms (draft) |
| `/moderation` | Admin-only report queue and takedown controls |
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
pnpm db:preflight           # read-only checks before applying anything
pnpm drizzle-kit migrate    # apply migrations
pnpm db:push                # generate + migrate, in sequence
```

Review generated SQL before applying it to a database that holds real data.

`pnpm db:preflight` never writes. It reports whether the pending migrations can
be applied safely, and exits non-zero when something needs a person. The check
that matters is before **0007**, which adds a UNIQUE index on `users.username`:
if two accounts hold the same handle, MySQL refuses the index, and deciding
whose handle survives is a product decision, not a migration's.

## Sharing

Sharing goes through one interface (`client/src/lib/sharing/`): components ask for the available targets and run one, and hold no platform URLs themselves.

Every target is either a browser capability or a documented public web intent. **Nothing posts on a user's behalf.** An intent opens the platform's own composer with the text prefilled and the user decides whether to send it. No platform credentials are stored or required.

Destinations are grouped by platform, so one platform can offer several — Instagram's story and feed cards are different shapes of the same receipt.

| Platform | Destinations | What it actually does |
| --- | --- | --- |
| This device | Share sheet | Hands off to the OS share sheet (where `navigator.share` exists) |
| Link | Copy link | Copies the canonical `/r/:id` URL |
| X · Bluesky · Reddit · Facebook | Post / Share | Opens that platform's composer; the user posts |
| WhatsApp | Send to a chat | `wa.me` opens a chat. WhatsApp Status has no web intent, so it is not offered |
| Instagram | Story card · Feed card | Saves a 9:16 or 1:1 card |
| TikTok | Story card | Saves a 9:16 card |
| Save a card | Link card | Saves the wide card used for link previews |

Instagram and TikTok have **no web intent for composing a post**. Publishing to them requires their Content Publishing / Content Posting APIs, which need a registered app, platform review, an eligible business or creator account, and server-held credentials. Rather than implying one-tap posting, the product offers the receipt card for the user to post themselves.

Every share points at the canonical receipt URL.

## Social previews

A public receipt at `/r/:id` is served by the Node app with its own Open Graph and Twitter card metadata — title, description, canonical URL, and a generated 1200×630 PNG at `/r/:id/image.png`. The card is drawn from the same visual language as the in-app receipt, so a shared link previews as the receipt it points at.

The tags are read from the database per request, so a receipt created after the last deploy previews correctly. Private receipts are never given metadata: `/r/:id` falls through to the plain application shell and the image endpoint returns 404.

The image is rendered with `satori` + `@resvg/resvg-js` and fonts from `@fontsource`, and cached in memory per receipt and format.

Cards come in three shapes, requested with `?format=`:

| Format | Size | Used for |
| --- | --- | --- |
| `og` (default) | 1200×630 | Link previews |
| `story` | 1080×1920 | Instagram, TikTok and Snapchat stories |
| `square` | 1080×1080 | An Instagram feed post |

The layout adapts rather than being cropped: the taller formats give the receipt a larger share of the canvas, set its contents bigger so a full phone screen does not leave it adrift, and add the tagline in the spare room. An unrecognised `format` is rejected rather than quietly served as a link card.

**The GitHub Pages demo does not do this.** Pages serves static files with no server, so it cannot generate per-receipt tags. Its receipts also live in one browser's `localStorage` and are not reachable by anyone else, so there is nothing for a crawler to preview. The demo keeps the site's generic tags.

## GitHub Pages demo

The demo at https://thankcheeses.github.io/THE-RECEIPT/ is built and published by `.github/workflows/deploy-pages.yml` on every push to `main`.

GitHub Pages serves static files only — no Express, no database. The static build therefore swaps the tRPC HTTP link for `client/src/lib/staticLink.ts`, which resolves every procedure in the browser against `client/src/lib/staticDemo.ts` using `localStorage`. Signing in creates a local demo account rather than running the real OAuth redirect, and data persists per browser instead of per account. Everything else — routes, layout, styling, the daily prompt rotation — is the same code as the server build.

```bash
pnpm build:static   # writes dist/public with base path /THE-RECEIPT/
```

The script copies `index.html` to `404.html` so deep links such as `/THE-RECEIPT/daily` resolve, and writes `.nojekyll`. Override the base path with `VITE_BASE_PATH=/ pnpm build:static` when serving from a domain root.

### The Pages source must be "GitHub Actions"

**Settings → Pages → Build and deployment → Source: GitHub Actions.** This is
not optional and it is not cosmetic.

If the source is left as "Deploy from a branch", GitHub runs its *own* Jekyll
build on every push to `main` — `actions/jekyll-build-pages` over the
repository root — and publishes the result. That build renders `README.md`
through the Primer theme into `index.html`, copies the source tree alongside
it, and deploys a few seconds *after* this workflow's artifact, replacing the
application with a themed README. Nothing fails: the Pages workflow, the
Jekyll workflow and CI all report success while the live site is wrong. This
happened on 20 September 2026.

Two checks now make that state visible instead of silent:

| Check | Where | What it catches |
| --- | --- | --- |
| `scripts/verifyStaticBuild.mjs` | build job, before upload | An artifact that cannot work: missing `404.html` or `.nojekyll`, asset URLs without the base path, a referenced file that is not in the artifact, an unresolved `%VITE_%` placeholder, a bundle too small to be the app, a bundle missing the static-demo store or still carrying `/api/trpc`. |
| `scripts/verifyPagesDeployment.mjs` | `verify` job, after deploy | A deployment that did not take: the live URL not serving this application, a bundle that 404s or comes back as HTML, a broken SPA fallback. It names the Jekyll case explicitly, because that is the one that looks like success. |

Both run in `.github/workflows/deploy-pages.yml` and both are runnable by hand:

```bash
node scripts/verifyStaticBuild.mjs dist/public /THE-RECEIPT/
node scripts/verifyPagesDeployment.mjs https://thankcheeses.github.io/THE-RECEIPT/
```

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
