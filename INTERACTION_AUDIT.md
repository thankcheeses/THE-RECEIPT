# THE RECEIPT — Interaction Audit

This MVP prioritizes the prediction → lock → share → resolve loop. Every primary control below has a route, persistence outcome, or explicit authentication gate.

| Route | User goal | Visible control | Server/data outcome | Completion evidence |
|---|---|---|---|---|
| `/` | Understand the product and enter the loop | `MAKE A RECEIPT` | Navigates to `/create` | Custom receipt form is visible |
| `/` | Answer the current daily prompt | `SEE TODAY'S RECEIPT` / `Answer it` | Navigates to `/daily` | Daily prompt is loaded from `dailyChallenges` |
| `/daily` | Make a daily prediction | `YES`, `NO`, confidence slider | Local answer state; confidence is captured | Selected answer and percentage remain visible |
| `/daily` | Lock the daily prediction | `LOCK IT IN` | Protected `daily.answer` inserts an immutable `receipts` row | `RECEIPT LOCKED`, receipt artifact, and link to detail |
| `/create` | Make a custom prediction | `LOCK IT IN` | Protected `receipts.create` validates and inserts a receipt; optional challenge inserts a `challenges` row | Redirect to `/receipt/:id`, receipt is persisted |
| `/receipt/:id` | Inspect, resolve, or share own receipt | `RIGHT`, `PARTIAL`, `WRONG`, `TOO EARLY` | Protected `receipts.resolve` updates status, result, resolved timestamp, and user accuracy | Result buttons are replaced by updated status after refresh |
| `/receipt/:id` / `/r/:id` | Share a receipt | `COPY RECEIPT LINK`, `SHARE` | Clipboard or native share action uses the current URL | Toast confirms copied link; public route is shareable without sign-in |
| `/r/:id` | Discover THE RECEIPT from a public link | `MAKE YOUR RECEIPT` | Navigates to `/create`; public data is only returned for `visibility = PUBLIC` | Acquisition CTA is present beside the shared receipt |
| `/receipts` | Review history | `ALL`, `PENDING`, `RIGHT`, `WRONG` tabs | Protected `receipts.mine` returns user-owned rows | Archive filters update in place |
| `/challenges` | Review head-to-head calls | `CHALLENGE SOMEONE` / challenge cards | Protected `challenges.list`; card navigates to `/challenge/:id` | Challenge status and confidence comparison are visible |
| `/challenge/:id` | Compare two positions | Challenge detail view | Public `challenges.get`; response mutation is available server-side | Challenger and challenged positions render side-by-side |
| `/leaderboard` | Compare prediction skill | Leaderboard tabs | Demo seed rows are intentionally labeled in the UI | Tab selection updates visible leaderboard state |
| `/profile` | See identity and statistics | Username save form | Protected `profile.setUsername`; `profile.me` aggregates receipt stats | Username and profile metrics render after mutation/refetch |

## Authentication and privacy rules

- Public receipt detail only returns rows marked `PUBLIC`.
- User-owned list, create, resolve, profile, and challenge mutations are protected by Manus auth.
- Locked predictions are not editable; the only allowed post-resolution mutation is a result transition through the resolver.
- Demo/example content is labeled `DEMO DATA`, `EXAMPLE RECEIPT`, or `DEMO LEADERBOARD`.
- No money, betting, prizes, crypto, or financial wagering is included.
