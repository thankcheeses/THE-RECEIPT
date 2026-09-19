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

This repository contains no secret values. Supply them through your host's secret manager or a local `.env` file, which is gitignored.
