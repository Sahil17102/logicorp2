# Logicorp Shared API

This server connects the client and admin panels to the same order store and keeps Teampafex credentials on the server.

Required Render environment variables:

- `TEAMPAFEX_EMAIL`
- `TEAMPAFEX_PASSWORD`
- `TEAMPAFEX_API_URL` optional, defaults to `https://teampafex.in`
- `CORS_ORIGIN` optional, comma-separated client/admin origins or `*`
- `DATA_DIR` optional persistent disk path, for example `/var/data`

Set both frontends to:

- `VITE_API_URL=https://<logicorp-api-service>.onrender.com/api`
