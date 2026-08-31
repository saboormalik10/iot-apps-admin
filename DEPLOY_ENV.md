# Deployment environment variables

`.env` / `.env.local` are **local only**. Hosts (Vercel, Render, Railway, EC2)
read their own dashboard, so these must be set there by hand.

Values marked **copy from local** are secrets — take them from `backend/.env` and
`admin-web/.env.local`. Do not commit them.

---

## Backend

### Required — the API refuses to start without these

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | **copy from local** |
| `JWT_ACCESS_SECRET` | **copy from local** (must be ≥32 chars, not a placeholder) |
| `JWT_REFRESH_SECRET` | **copy from local** (same rule) |
| `CORS_ORIGIN` | the admin panel's URL, e.g. `https://panel.example.com` |

The last three are deliberate hard failures (M24 W1): the JWT secrets used to
fall back to literals committed in this repo, and `CORS_ORIGIN` used to fall back
to a wildcard. A forgotten variable then looked like nothing was wrong.

### Required for correct behaviour

| Variable | Value | Why |
|---|---|---|
| `TRUST_PROXY` | `1` | Behind a load balancer or serverless platform. Without it every request appears to come from the proxy and per-IP rate limiting buckets all users together. A **hop count**, never `true` |
| `FRONTEND_URL` | panel URL | Password-reset and alert deep links |
| `PORT` | usually set by the host | |

### Needed per feature

| Variable | Needed for |
|---|---|
| `CLOUDINARY_URL` | Logo upload, record pictures |
| `EMAIL_MAILER`, `EMAIL_PASSWORD`, `EMAIL_FROM` | Alert emails, password reset |
| `SWAGGER_USER`, `SWAGGER_PASSWORD` | Protecting `/api` docs |
| `SENTRY_DSN` | Error reporting |
| `FCM_SERVICE_ACCOUNT_B64` | Push notifications |

Leave `PUBLIC_SHARE_BASE_URL` **empty** — the panel builds its own `/s/<token>`
link from `window.origin`; the backend would build `/public/<token>`, which is
not a route.

### After every deploy

```bash
npm run sync:indexes
```

**Not optional.** `autoIndex` is off in production (M24 W1), so nothing creates
indexes for a new model on its own. Skipping it is a silent performance failure.

---

## Admin panel

| Variable | Value |
|---|---|
| `BACKEND_URL` | `https://<backend>/v1` — note the `/v1` |
| `NEXT_PUBLIC_BACKEND_WS_URL` | `wss://<backend>` — no `/v1` |
| `SESSION_SECRET` | **copy from local** (encrypts the session cookie) |
| `SESSION_IDLE_MINUTES` | `30` |
| `NEXT_PUBLIC_FEATURE_FLAGS` | leave empty unless force-enabling a flag |

`NEXT_PUBLIC_*` values are **baked in at build time**. Changing one needs a
rebuild, not just a restart.

---

## Host notes

**Vercel is a good fit for the panel, not for this backend.**

- **Deployment Protection must be off** for the backend, or every request
  302-redirects to `vercel.com/sso-api`. The ingest agent cannot authenticate to
  Vercel, so it can never post.
- **WebSockets do not work on serverless.** The backend pushes live readings over
  socket.io; on Vercel the dashboard will not update in real time. Ingest, the
  API and the charts still work — only the live push is lost.

For the backend prefer an always-on host: Render (a **paid** instance, so it does
not sleep), Railway, Fly, or a small EC2/Lightsail.

---

## Local (already configured)

| | Backend | Panel |
|---|---|---|
| Port | `3100` | `3001` |
| Points at | — | `http://localhost:3100/v1` |

Port **3100**, not 3000, because 3000 is taken by another project on this
machine. Both `.env` files are set, so `npm start` / `yarn start` need no flags.

For the Playwright suite, start the backend with `NODE_ENV=test`, or the login
rate limit fails every journey after the tenth sign-in.
