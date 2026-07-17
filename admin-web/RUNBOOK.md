# admin-web — operations runbook

Day-two operations for the Observator admin panel. Deployment itself is in
[VERCEL.md](./VERCEL.md); architecture is in [README.md](./README.md).

---

## 1. What this system is made of

| Piece | Where | Notes |
| --- | --- | --- |
| Admin panel (this app) | Vercel | Next.js 15 App Router; serverless |
| Backend API | Render — `https://iot-apps-admin.onrender.com` | NestJS + socket.io; **free tier: cold starts** |
| Database | MongoDB Atlas | The backend owns it; the panel never connects directly |
| Errors/traces | Sentry | No-op unless the DSN vars are set |

The browser **never holds an API token**. Every call goes to `/api/**` on the
panel's own origin; the BFF attaches the access token from an encrypted
`obs_admin_session` cookie server-side. This matters for debugging: a 401 in the
browser's network tab is the *BFF's* answer, not the backend's.

---

## 2. Release

```bash
# from repo root
git checkout main && git pull
cd admin-web
yarn install --frozen-lockfile
yarn typecheck && yarn lint && yarn test && yarn build   # the gate CI runs
```

Push to `main` → Vercel builds `admin-web/` and promotes to production. To ship
from a working branch, use its preview URL or change **Settings → Git →
Production Branch**.

**Rollback:** Vercel → Deployments → pick the last good one → **Promote to
Production**. It is instant and needs no rebuild. Do this first; diagnose after.

---

## 3. Environment variables

Set in Vercel → Settings → Environment Variables. Full table in
[VERCEL.md](./VERCEL.md#environment-variables). The three that are **required**:

| Variable | Why it breaks things |
| --- | --- |
| `SESSION_SECRET` (≥32 chars) | The **build itself fails** without it ("Collecting page data"). Rotating it logs everyone out — that is the intended way to force a global sign-out. |
| `BACKEND_URL` | Must include the `/v1` suffix. Wrong value ⇒ every page loads but all data 404s. |
| `NEXT_PUBLIC_BACKEND_WS_URL` | Browser-visible. Wrong value ⇒ pages work but the Live badge never connects, and the CSP blocks the socket. |

Changing any env var requires a **redeploy** — Next inlines `NEXT_PUBLIC_*` at
build time.

---

## 4. Health checks

```bash
# Panel is up and serving the login page
curl -s -o /dev/null -w '%{http_code}\n' https://<panel>/login          # 200

# Backend is awake (Render cold start can take 30–60s on the free tier)
curl -s -o /dev/null -w '%{http_code}\n' https://iot-apps-admin.onrender.com/health   # 200

# The BFF can reach the backend (should be 401 UNAUTHORIZED, NOT 502/504)
curl -s -o /dev/null -w '%{http_code}\n' https://<panel>/api/dashboard/summary        # 401
```

That last one is the useful one: **401 means the proxy chain is healthy** and only
the session is missing. A 502/504 means the panel can't reach Render.

---

## 5. Symptom → cause

| Symptom | Most likely cause | What to do |
| --- | --- | --- |
| Everything spins, then errors, on the first visit of the day | **Render free-tier cold start** (30–60 s) | Wait and retry. Not a panel bug. Confirm with the `/health` curl. |
| Users logged out constantly | `SESSION_SECRET` changed, or differs between environments | Re-set it and redeploy. Every existing cookie is invalidated by design. |
| Login works; every data call 401s | Backend refresh rejected → BFF hard-logs-out | Check backend `JWT_*` secrets didn't rotate. The BFF never loops: on a failed refresh it destroys the session. |
| Live badge stuck on "Connecting" | `NEXT_PUBLIC_BACKEND_WS_URL` wrong, or CSP blocking | Check the browser console for a CSP `connect-src` violation. The CSP is built from that env var (`middleware.ts`). |
| Map tiles blank | CSP tile origins, or no WebGL on that machine | Check console; MapLibre needs a GPU. There is a graceful fallback message. |
| Invite / reset emails link to the API, not the panel | Backend `FRONTEND_URL` unset | Set it on **Render**, not Vercel. Backend-side (`organizations.service.ts`, `auth.service.ts`). |
| A chart is empty but the table view has rows | Null-gap rendering, not a bug | Sensors default to null; charts render gaps rather than fake zeros. |

---

## 6. Import & export

The import wizard (`/import`, admin-only) is the one surface that **writes bulk
data**. Things worth knowing before someone reports a problem:

- **There is no server-side dry-run.** The wizard's preview mirrors the backend
  parser (`features/import/csv-contract.ts` ↔ `backend/src/import/import.service.ts`).
  Submitting from the review step **always commits**.
- **NEP is idempotent** — upserted by `SessionId`, so a re-run is safe.
  **MET is not** — each file creates a new `MetRecord`, so importing twice
  duplicates it. The review step says so before committing.
- **Timestamps** accept bare epoch-ms (what the exporters write) or ISO. A row
  whose timestamp doesn't parse is skipped and reported — it is **not** silently
  restamped to "now". (It was, before Month 12; see the delivery report.)
- **The parser does not understand quoted CSV fields** — it splits on every
  comma. The preview warns when a file contains quote characters.
- Limits: **20 MB** per file (backend multer cap), 50 row-errors reported.
- Batch export (`/export/sessions.zip`) **requires a single device** — there is no
  fleet-wide export. The Export menu disables it until one is picked.

If someone imported the wrong file: there is no "undo". NEP re-imports of the
corrected file will overwrite by SessionId; a wrong MET import leaves an extra
record that must be deleted from the Records screen.

---

## 7. Access & roles

Three roles, one matrix (`lib/rbac/capabilities.ts`). The panel hides what a role
can't do, and **the backend re-checks every call** — the UI guard is UX, not
security.

| | viewer | operator | admin |
| --- | :-: | :-: | :-: |
| View data / export / share links | ✅ | ✅ | ✅ |
| Edit comments, upload files | | ✅ | ✅ |
| Manage alert rules | | ✅ | ✅ |
| Devices, settings, firmware | | | ✅ |
| Org, users, audit | | | ✅ |
| **Import CSV**, revoke others' share links | | | ✅ |

- Signup is **invite-only**. Admins invite from `/users`.
- Role changes take effect on the user's next token refresh (≤15 min) — no
  re-login needed.
- **Every admin mutation is audited** (`/org` → Audit) with a before/after diff,
  IP and user-agent.

---

## 8. Sessions & security

- Session cookie: `obs_admin_session`, httpOnly, SameSite=Lax, encrypted
  (iron-session). Idle timeout `SESSION_IDLE_MINUTES` (default 30).
- Login is throttled by the backend at **10/60s**; public share views at 30/60s.
  A 429 surfaces as a backoff message, not an error.
- Share links (`/s/<token>`) are **unauthenticated, `noindex`, and always
  expire**. Revoke from `/share` — revocation is immediate (404 thereafter).
- CSP is nonce-based and set per-response in `middleware.ts`. If you add a script
  or a new remote origin, it must be added there or the browser will block it.

---

## 9. Monitoring

Sentry is wired for client, server and edge, and is a **no-op until the DSN is
set**. To turn it on, set `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` (and
`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` for source maps) and redeploy.

- Errors are reported with `sendDefaultPii: false` — no tokens or PII leave the
  app.
- Traces sample at 10%; session replay is off.
- Sentry's browser requests are tunnelled through `/monitoring` (same origin), so
  ad-blockers and the CSP don't drop them.

Verify after enabling: Vercel → Logs for server errors, Sentry → Issues for
client errors. Per-route-group error boundaries mean one broken screen doesn't
take down the shell.

---

## 10. CI

`.github/workflows/ci-admin-web.yml`, two jobs:

- **gate** (blocks merge) — typecheck, lint, unit/component (MSW-mocked), build,
  palette validator, Swagger↔client contract drift.
- **e2e** — real Mongo + seeded backend + simulator + the built panel, then
  Playwright + axe, then **Lighthouse (enforced)** against the *authenticated*
  routes via `yarn lighthouse:auth`.

The contract-drift check is the one people are surprised by: it fails the build
when `lib/api/endpoints.ts` references a path the backend Swagger doesn't have,
and when the realtime event names or the reference scales drift from the backend
source. That is deliberate — a wrong socket event name silently receives nothing.

---

## 11. Known operational limits

- **Render free tier** cold-starts. The single biggest source of "the panel is
  broken" reports.
- **Fleet-wide aggregates don't exist** — most analytics endpoints require one
  `deviceId`. The panel auto-selects the most-active device and offers a picker.
- **Records have no server-side text search**; the command palette matches
  records on device name over the most recent page only.
- **Storybook does not build** on the current dependency set
  (`@storybook/nextjs` + webpack 5.108 → "compilation argument must be an
  instance of Compilation"). Stories are still authored; `yarn build-storybook`
  is not part of CI and was never wired into it.
