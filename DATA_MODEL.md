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
| `currentStreak`, `longestStreak`, `accuracy` | int | Product aggregates; streak rollups are not fully implemented |
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

Stores a head-to-head relationship: receipt, challenger, challenged user, both positions and confidences, status OPEN/ACCEPTED/RESOLVED, and creation timestamp. The current UI renders the list/detail path; server response mutation exists, while full acceptance and resolution UI remain roadmap work.

## achievements

Stores user, achievement type, and earned timestamp. Current code records basic `FIRST DAILY RECEIPT` and `CALLER` achievements.

## Lifecycle rules

- A daily answer creates a LOCKED receipt.
- A custom receipt creates a PENDING receipt.
- No update endpoint changes prediction, category, confidence, resolution date, or visibility.
- Only the owner may resolve a receipt.
- Public detail requires `visibility = PUBLIC`.
- Resolution updates status, optional result note, resolved timestamp, and the current simple accuracy aggregate.
