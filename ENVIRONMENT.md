# Environment reference

The deployment needs the following environment variables. Provide real values through the hosting platform’s secret manager; do not commit them.

| Variable | Purpose |
| --- | --- |
| `VITE_APP_ID` | Manus application identifier |
| `VITE_OAUTH_PORTAL_URL` | Browser OAuth portal URL |
| `OAUTH_SERVER_URL` | OAuth server base URL |
| `JWT_SECRET` | Session cookie signing secret |
| `DATABASE_URL` | MySQL/TiDB connection string |
| `OWNER_OPEN_ID` | Optional owner identity for admin role handling |
| `BUILT_IN_FORGE_API_URL` | Optional server-side Manus built-in API base URL |
| `BUILT_IN_FORGE_API_KEY` | Optional server-side Manus built-in API credential |
| `VITE_ANALYTICS_ENDPOINT` | Optional analytics script endpoint |
| `VITE_ANALYTICS_WEBSITE_ID` | Optional analytics site identifier |
| `VITE_ABUSE_CONTACT` | Abuse and legal contact address, shown in the footer, on the report form, on a takedown notice and on the legal pages. Unset hides every one of them. **Required before public launch** — see below. |

This repository contains no secret values. Supply them through your host's secret manager or a local `.env` file, which is gitignored.

## Before a public launch

`VITE_ABUSE_CONTACT` is **unset**, and no real address exists anywhere in this
repository. That is deliberate: publishing an address nobody reads is worse
than publishing none, and inventing one would be worse still. While it is
unset the application shows no contact at all — the footer link, the
signed-out reporting line, the takedown notice and the legal pages each drop
the address rather than printing a placeholder.

A real, monitored address must be configured before the product is public.
Signed-out visitors have no other way to report something, and people appealing
a takedown have no other way to reach a human.

## Database migrations

Migrations `0002`–`0010` exist in `drizzle/` and have **not** been applied.

Run the read-only check before applying anything:

```bash
DATABASE_URL=… pnpm db:preflight
```

It never writes. It exits non-zero when a migration needs a human decision —
chiefly before `0007`, which adds a `UNIQUE` index on `users.username`: MySQL
refuses that index if two accounts hold the same handle, and choosing whose
handle survives changes who answers to a name that other people's links and
screenshots already point at. That is a product decision, not a migration's.
