# THE RECEIPT — Data Model

The source of truth is `drizzle/schema.ts`; generated migrations live in `drizzle/`.

## users

Stores Manus OAuth identity plus product profile aggregates.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | int primary key | Internal user identifier |
| `openId` | varchar unique | Manus OAuth identifier |
| `name`, `email`, `loginMethod` | nullable text/varchar | Auth-provided identity fields |
| `role` | enum | `user` or `admin` |
| `username`, `avatar` | nullable varchar | Product profile identity |
| `currentStreak`, `longestStreak`, `accuracy` | int | Product aggregates, maintained on every daily answer and resolution |
| `lastDailyDate` | nullable timestamp | Midnight of the last answered daily; the streak gap is measured from here |
| `createdAt`, `updatedAt`, `lastSignedIn` | timestamp | Account lifecycle timestamps |

## dailyChallenges

Stores one editorial daily prompt per date-like publish window: prompt, category, publish date, resolution date, status, and creation timestamp. The current server lazily creates the current challenge from `shared/seed.ts` when requested.

## receipts

Stores the permanent prediction artifact.

| Field | Meaning |
| --- | --- |
| `id` | Receipt number source |
| `userId` | Owner |
| `prediction` | Locked prediction text |
| `category` | Product category |
| `confidence` | Integer 0–100 |
| `createdAt` | Printed timestamp |
| `resolutionDate` | Future date when the prediction is intended to resolve |
| `status` | LOCKED, PENDING, RIGHT, WRONG, PARTIALLY RIGHT, or TOO EARLY |
| `result` | Optional resolution note |
| `visibility` | PUBLIC or PRIVATE |
| `challengeUserId` | Optional challenged user |
| `dailyChallengeId` | Optional daily prompt link |
| `resolvedAt` | Resolution timestamp |

There is intentionally no edit procedure. Receipt creation is the immutability boundary.

## challenges

Stores a head-to-head relationship: receipt, challenger, challenged user, both positions and confidences, status OPEN/ACCEPTED/RESOLVED, and creation timestamp. The challenged user accepts from the challenge detail route, which locks their position and flips the status to ACCEPTED. Joint resolution remains roadmap work.

## dailyActivity

One row per user per day they answered the daily challenge, with the streak value that answer produced.

| Field | Meaning |
| --- | --- |
| `userId` | Answering user |
| `activityDate` | Midnight of the day answered; unique per user |
| `dailyChallengeId`, `receiptId` | What was answered, and the receipt it produced |
| `streakAfter` | Streak value after this answer, so history survives later resets |

Streaks could be derived from `receipts` alone. This table exists so retention — how many of one day's answerers return the next — is a day-grained query rather than a scan over every receipt.

## notifications

| Field | Meaning |
| --- | --- |
| `userId` | Recipient |
| `type` | CHALLENGE_RECEIVED, CHALLENGE_ACCEPTED, or RECEIPT_RESOLVED |
| `title`, `body` | Rendered directly in the header panel |
| `linkPath` | In-app destination for the notification |
| `actorId`, `challengeId` | Who caused it, and what it refers to |
| `readAt` | Null until read; drives the unread badge |

## analyticsEvents

Append-only product analytics: `event` (from the closed `ANALYTICS_EVENTS` list in `server/routers.ts`), optional `userId`, JSON `properties`, and `createdAt`. Writes never throw into a request path — a failed write costs a data point, not the user's action. The table holds no PII beyond the user id, so it can be dropped or exported without touching application tables.

## achievements

Stores user, achievement type, and earned timestamp. Current code records basic `FIRST DAILY RECEIPT` and `CALLER` achievements.

## Lifecycle rules

- A daily answer creates a LOCKED receipt.
- A custom receipt creates a PENDING receipt.
- No update endpoint changes prediction, category, confidence, resolution date, or visibility.
- Only the owner may resolve a receipt.
- Public detail requires `visibility = PUBLIC`.
- Resolution updates status, optional result note, resolved timestamp, and the current simple accuracy aggregate.
- A daily answer also records a `dailyActivity` row and advances the streak. Both are idempotent per day: answering twice does not double-count.
- A streak continues when the previous answer was yesterday, holds when it was today, and resets to 1 otherwise.
- Creating a challenge notifies the challenged user; accepting notifies the challenger.
- Analytics events are written server-side wherever the server can observe the action; only `receipt_shared` is reported by the client, because sharing happens entirely in the browser.
