# Logicorp Shared API

This server connects the client and admin panels to the same order store and keeps Teampafex and Shadowfax credentials on the server.

Admin service-provider credential saves log in to Teampafex, persist the returned JWT token server-side, and reuse that token for authenticated pickup, rate, and order requests. If Teampafex returns 401, the server refreshes the JWT from the saved email/password and retries once.

Shadowfax uses token authentication. Configure `SHADOWFAX_API_TOKEN` (or save it from Admin -> Service Providers -> Shadowfax) before booking real Shadowfax shipments. Direct Shadowfax booking uses the warehouse forward endpoint `/v3/clients/orders/`; tracking uses `/v4/clients/orders/{awb}/track/`; cancellation uses `/v3/clients/orders/cancel/`. Configure the Shadowfax portal callback URL as:

- `https://api.logicorp.in/api/webhooks/shadowfax`

Required VPS/systemd environment variables:

- `TEAMPAFEX_EMAIL`
- `TEAMPAFEX_PASSWORD`
- `TEAMPAFEX_API_URL` optional, defaults to `https://teampafex.in`
- `SHADOWFAX_API_TOKEN`
- `SHADOWFAX_API_URL` optional, defaults to `https://dale.shadowfax.in/api`
- `SHADOWFAX_WEBHOOK_SECRET` optional, must match the callback auth header if set
- `CORS_ORIGIN` optional, comma-separated client/admin origins or `*`
- `DATA_DIR` optional persistent disk path, for example `/var/data`

For the current VPS backend service, set both frontends to:

- `VITE_API_URL=https://api.logicorp.in/api`

Local build/start commands:

- Build: `npm run render:build`
- Start: `npm run render:start`

For production stability, keep `TEAMPAFEX_EMAIL` and `TEAMPAFEX_PASSWORD` set on the VPS service even though the admin panel can verify and save credentials. Admin-saved JWTs live under `DATA_DIR`, so a missing persistent directory or a fresh service can otherwise boot with no courier credentials.
