# Changelog

## Unreleased

- Receipt cards render in three formats — 1200×630 link, 1080×1920 story, 1080×1080 square — requested with `?format=` on `/r/:id/image.png`. The layout scales to each rather than being cropped.
- Share destinations are grouped by platform, so Instagram can offer both a story and a feed card. Instagram and TikTok get correctly shaped cards rather than a fake posting integration.

- Added author-selected receipt kinds (Prediction, Goal, Personal, Fun) and a shared interaction policy that decides which responses a receipt offers. Goals and personal receipts take support rather than agreement or disagreement; the server enforces the same rule the client renders.
- Added "Me too": a real, independently authored receipt that records which receipt it followed (`derivedFromId`), rather than a reaction counter.
- Support and agreement are persisted as distinct interaction types in a new `receiptInteractions` table.
- Added a "Resolving soon" feed mode over open public receipts, with a covering index.

- Added a sharing abstraction with platform adapters: OS share sheet, copy link, composer intents for X, Bluesky, WhatsApp, Reddit and Facebook, and a receipt-image download for platforms that have no web intent. Nothing posts on the user's behalf.

- Added a public feed at `/feed`: newest-first, category filters, keyset pagination, and empty/loading/error states, built on the existing public-receipt data.
- Added public profiles at `/u/:username`, showing only public receipts with statistics computed over public receipts alone.
- Added indexes covering the feed's access paths on `receipts`.

- Added server-rendered social previews for public receipts: per-receipt Open Graph and Twitter card metadata on `/r/:id`, plus a generated 1200×630 PNG at `/r/:id/image.png` drawn from the existing receipt design. Private receipts get neither.

- Resolution now requires the receipt to be due: `receipts.resolve` rejects any attempt before the declared `resolutionDate`, and the detail page shows a "not due yet" state instead of buttons that would fail.
- Added `landing_view`, `user_returned`, and `streak_milestone` analytics events, plus `users.lastActiveDate` to detect a return visit (`lastSignedIn` is refreshed on every request and cannot).
- Added an admin-only `/analytics` route rendering 30-day event totals and 14-day retention from real recorded events.
- Added a CI workflow running typecheck, tests, and both builds on pull requests and pushes to `main`.
- The per-request auth refresh no longer triggers the signup-detection query.

- Added real streak calculation: `users.lastDailyDate` plus a `dailyActivity` table, advanced on each daily answer and idempotent per day.
- Added daily retention tracking — `getRetentionSummary()` reports day-over-day active and returning users; `getDailyActivityWindow()` backs the per-user week view.
- Replaced the daily page's hardcoded "0 DAYS" and static dots with the signed-in user's real streak and last seven days.
- Added challenge acceptance: the challenged user locks their position from the challenge detail route, flipping the challenge to ACCEPTED.
- Added in-app notifications with a header bell and unread badge, raised on challenge received and challenge accepted.
- Added an append-only `analyticsEvents` table and a closed event vocabulary covering signup, daily answers, receipt creation, sharing, and resolution.
- Added an admin-only `analytics.summary` procedure returning 30-day event totals and 14-day retention.
- Extended the GitHub Pages static demo to cover every new procedure, so the published build keeps working without a server.
- Removed internal planning and handoff documentation from the repository and rewrote `README.md` as a public project readme.

## 1.0.0 — MVP baseline

- Established THE RECEIPT as a social prediction game centered on immutable thermal-paper receipt artifacts.
- Added mobile-first home, daily receipt, custom receipt, detail, archive, challenge, leaderboard, and profile routes.
- Added 50+ curated daily prompts across CULTURE, SPORTS, TECH, BUSINESS, INTERNET, LIFE, SCIENCE, ENTERTAINMENT, and ABSURD.
- Added Manus OAuth-backed authentication and protected tRPC procedures.
- Added Drizzle/MySQL tables for users, daily challenges, receipts, challenges, and achievements.
- Added public shareable receipt URLs with private receipt protection.
- Added resolution states and profile accuracy aggregation.
- Added demo-labeled receipts and leaderboard rows for non-empty MVP presentation.
- Added domain and auth tests, and responsive visual verification.
