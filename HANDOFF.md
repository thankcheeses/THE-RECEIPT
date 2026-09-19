# THE RECEIPT — Developer Handoff

## What this is

THE RECEIPT is an internet-native social prediction game. The product promise is: **you said it, we timestamped it, now let’s see if you were right.** The receipt is the recognizable product object and the core loop is more important than feature breadth.

## Core loop

1. Discover today’s question or open the custom form.
2. Write a prediction or choose YES/NO for the daily question.
3. Set confidence and, for custom receipts, a resolution date.
4. Confirm that the receipt cannot be edited.
5. Lock it; the server persists the receipt and the UI renders a thermal-paper artifact.
6. Share the public URL or keep it private.
7. Return after the resolution date and record RIGHT, WRONG, PARTIALLY RIGHT, or TOO EARLY.
8. Review archive, statistics, challenges, and leaderboard context.
9. Make another prediction.

## Current features

The MVP includes the home page, daily receipt, custom receipt creation, receipt detail, public receipt sharing, personal archive, challenges, leaderboard, profile, Manus OAuth authentication, Drizzle/MySQL persistence, seed prompts, demo content, and basic tests. See `README.md` and `INTERACTION_AUDIT.md` for route-level detail.

## Current pages and components

`client/src/App.tsx` contains the route system and the intentionally compact shared UI primitives: `Header`, `Page`, `ButtonLink`, `Tag`, `ReceiptPaper`, `SectionLabel`, and `AuthPrompt`. The receipt-paper component is the signature reusable component. `client/src/index.css` contains the visual system, responsive breakpoints, receipt perforation treatment, states, and motion.

The backend is centered in `server/routers.ts` and `server/db.ts`. The database schema is in `drizzle/schema.ts`; shared categories, prompts, demo receipts, and receipt-number formatting are in `shared/seed.ts`.

## Authentication

Authentication uses the Manus OAuth flow already provided by the scaffold. `useAuth()` reads `trpc.auth.me`, starts login through `startLogin()` from `client/src/const.ts`, and uses the existing session cookie/Bearer fallback behavior from `client/src/main.tsx`. Protected procedures use Manus’s `protectedProcedure`; public receipt reading uses `publicProcedure` and checks `visibility = PUBLIC`.

This is not email/password or magic-link auth in the current implementation. Do not replace the existing Manus OAuth plumbing without a deliberate migration plan.

## Prediction and receipt lifecycle

A daily response creates a `receipts` row with `status = LOCKED` and a `dailyChallengeId`. A custom prediction creates a row with `status = PENDING`. The server validates the prediction length, confidence range, future resolution date, visibility, and optional challenged username before insertion.

There is no edit procedure. A receipt is immutable after creation. The only supported later mutation is resolution by the owner, transitioning `PENDING` or `LOCKED` to `RIGHT`, `WRONG`, `PARTIALLY RIGHT`, or `TOO EARLY`, with an optional result note and `resolvedAt` timestamp.

## Current gamification

The schema stores `currentStreak`, `longestStreak`, and `accuracy` on users, but only the basic accuracy update path is currently implemented. Achievements are recorded for `FIRST DAILY RECEIPT` and `CALLER`. The profile calculates simple resolved accuracy, category accuracy, biggest miss, and biggest call from receipt history. Real streak rollups and milestone automation are not implemented yet.

## Current challenge behavior

Custom receipt creation can accept a username. If that username exists, the server creates a `challenges` row containing the challenger’s position and confidence. The challenge list and detail routes render the stored state. The server has a `challenges.respond` procedure for a challenged user to submit a position and confidence, but the current UI does not yet expose the response form. Notifications, challenge reminders, and automatic challenge resolution are not implemented.

## Sharing behavior

Public receipts are available at `/r/:id` without sign-in. The detail page provides copy-link and native share behavior, then points visitors to `/create`. Private receipts are not returned by the public procedure. The current project uses client-side route rendering; if search/social crawler previews become a priority, add an intentional SSR/meta-card solution rather than redesigning the client.

## Analytics

The scaffold includes the Umami script placeholders in `client/index.html`, but product-specific funnel events are not currently instrumented. There is no dedicated analytics table or internal analytics view. Signup, receipt creation, daily participation, sharing, resolution, and retention events should be evaluated before implementation and added as a small event vocabulary, not as a broad analytics platform.

## Visual language

The permanent foundation is playful, premium, slightly obsessive, and receipt-native: warm paper, acid green, coral, lavender, monospaced labels, expressive Space Grotesk headings, and a physical receipt with perforated edges. The interface should feel closer to thermal receipts, ticket stubs, sports scoreboards, and internet culture than to enterprise software or a dashboard.

Typography currently uses DM Sans for body copy, Space Grotesk for display/strong headings, and DM Mono for metadata, labels, timestamps, and stamps. Exact tokens are documented in `DESIGN_SYSTEM.md`.

## Design do-not-dos

Do not turn the product into a generic SaaS dashboard, AI chatbot, finance app, betting interface, crypto product, productivity tool, or generic social network. Do not replace the receipt artifact with a conventional card. Do not add features merely because they are technically impressive. Preserve mobile-first reachability of the daily flow.

## Current limitations and technical debt

- Streak fields exist but are not calculated from daily participation.
- Daily challenge creation is lazy and date-based; an operational scheduled seed/close process does not exist.
- Challenge response is server-supported but not fully surfaced in the UI.
- No notification channel is wired.
- Product analytics events are not defined or emitted.
- Leaderboard data is demo-only and not backed by a leaderboard query.
- No SSR/social image metadata exists for public receipt URLs.
- Foreign-key constraints and indexes are minimal in the current schema.
- The main client route file is intentionally compact for the MVP but should be split by feature only when making a meaningful change.
- The project relies on the Manus scaffold’s OAuth/runtime configuration.

## Intentionally not implemented

Subscriptions, payments, ads, AI-generated predictions, AI chat, AI life advice, crypto, betting, cash prizes, complex recommendation systems, advanced moderation, complicated messaging, elaborate friend graphs, enterprise functionality, and native mobile apps are explicitly out of scope.

## Recommended next development steps

1. Add a small, tested event vocabulary for signup, daily participation, receipt creation, public share click, resolution, and retention, then use it to measure whether the loop works.
2. Implement real daily streak rollups and milestone awards after defining timezone behavior and backfill rules.
3. Complete challenge acceptance in the UI and add a low-cost in-app notification state before considering external notifications.
4. Add a focused SSR/meta-card layer for public receipts if sharing data shows that link previews materially affect acquisition.
