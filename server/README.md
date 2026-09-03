# Logicorp Shared API

This server connects the client and admin panels to the same order store and keeps Teampafex credentials on the server.

Admin service-provider credential saves log in to Teampafex, persist the returned JWT token server-side, and reuse that token for authenticated pickup, rate, and order requests. If Teampafex returns 401, the server refreshes the JWT from the saved email/password and retries once.

Required Render environment variables:

- `TEAMPAFEX_EMAIL`
- `TEAMPAFEX_PASSWORD`
- `TEAMPAFEX_API_URL` optional, defaults to `https://teampafex.in`
- `CORS_ORIGIN` optional, comma-separated client/admin origins or `*`
- `DATA_DIR` optional persistent disk path, for example `/var/data`

For the current Render backend service, set both frontends to:

- `VITE_API_URL=https://logicorp290.onrender.com/api`

Render web service commands:

- Build: `npm run render:build`
- Start: `npm run render:start`

For production stability, keep `TEAMPAFEX_EMAIL` and `TEAMPAFEX_PASSWORD` set on the Render web service even though the admin panel can verify and save credentials. Admin-saved JWTs live under `DATA_DIR`, so a missing persistent disk or a fresh service can otherwise boot with no courier credentials.
