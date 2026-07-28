# Deploying admin-web to Vercel

The admin panel lives in the `admin-web/` subdirectory of this monorepo, so the
one non-default Vercel setting is **Root Directory = `admin-web`**. Everything
else (framework, build command, output) is auto-detected; `vercel.json` pins the
install command to the lockfile and skips builds when a push doesn't touch
`admin-web/`.

The backend stays on Render (`https://iot-apps-admin.onrender.com`) — no backend
change is needed. API calls go through the Next.js BFF proxy (server-to-server,
CORS doesn't apply) and the socket.io gateway already accepts any origin.

## Option A — Vercel dashboard (recommended)

1. Push the branch you want to deploy to GitHub.
2. On <https://vercel.com/new>, import `saboormalik10/iot-apps-admin`.
3. In the import screen:
   - **Root Directory**: `admin-web`
   - **Framework Preset**: Next.js (auto-detected)
   - Leave build/install/output commands as detected.
4. Add the environment variables below, then **Deploy**.
5. After the first deploy, check **Settings → Git → Production Branch** — it
   defaults to `main`. If you deploy from a working branch (e.g. `Month-9`),
   either set that as the production branch or rely on its preview URL.

## Option B — Vercel CLI

```bash
npm i -g vercel
cd admin-web
vercel login
vercel link                 # create/link the project
vercel env add BACKEND_URL production
vercel env add NEXT_PUBLIC_BACKEND_WS_URL production
vercel env add SESSION_SECRET production
vercel --prod
```

If you also connect the Git integration later, set Root Directory to
`admin-web` in the project settings so pushes build the right folder.

## Environment variables

| Variable | Environment | Value |
| --- | --- | --- |
| `BACKEND_URL` | all | `https://iot-apps-admin.onrender.com/v1` (server-only; BFF proxy target) |
| `NEXT_PUBLIC_BACKEND_WS_URL` | all | `wss://iot-apps-admin.onrender.com` (browser connects to socket.io here) |
| `SESSION_SECRET` | all | ≥32-char random string — generate with `openssl rand -hex 32`. **Required at build time**: the build fails during "Collecting page data" without it. |
| `SESSION_IDLE_MINUTES` | optional | Idle session timeout in minutes (default 30) |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | optional | Enables Sentry + source-map upload on deploy; no-op when unset |
| `NEXT_PUBLIC_FEATURE_FLAGS` | optional | Comma-separated flag keys to force-enable (see `lib/config/flags.ts`) |

## Post-deploy smoke check

1. Open the deployment URL and log in (session cookie should be set; the
   iron-session cookie requires HTTPS in production — Vercel provides it).
2. Dashboard shows live data and the realtime badge connects (websocket to
   Render, allowed by the CSP `connect-src` built from
   `NEXT_PUBLIC_BACKEND_WS_URL`).
3. Devices map renders tiles (CSP tile origins are handled in
   `middleware.ts`).

## "Nothing is deploying" — check these three, in order

Deployments for this project are *deliberately* skipped when a push doesn't
touch `admin-web/`, so "no build ran" is usually correct behaviour rather than a
fault. Open the project → **Deployments** and match the symptom:

| What you see | Cause | Fix |
| --- | --- | --- |
| Deployments listed as **Skipped** | The push changed only backend/docs/mobile | Working as designed. To force one, touch any file under `admin-web/`, or use the ADMIN deploy hook |
| **No deployment at all** since the push | Vercel is watching a different branch than the one you pushed | Settings → Git → **Production Branch** — set it to the branch you actually work on, or merge that branch into it |
| Build **fails immediately** | Root Directory not set | Settings → General → **Root Directory** = `admin-web`. There is no `package.json` at the repo root, so a root-level build cannot work |

Verify the skip rule locally before blaming Vercel — this is the same comparison
it makes, `0` means skip and `1` means build:

```bash
cd admin-web && git diff --quiet HEAD^ HEAD -- . ; echo $?
```

## Notes / gotchas

- **Render free-tier cold starts**: the first request after idle can take
  ~30–60 s while Render spins the backend up; the admin panel will look
  broken until it responds. This is Render, not Vercel.
- `next start -p 3001` in `package.json` is ignored on Vercel (serverless).
- The Sentry `tunnelRoute: '/monitoring'` and the nonce-based CSP middleware
  work unchanged on Vercel.
- If you ever set `CORS_ORIGIN` on the Render backend, include your Vercel
  domain (e.g. `https://<project>.vercel.app`) in the comma-separated list.
- The skip rule compares against `VERCEL_GIT_PREVIOUS_SHA` (the last deployed
  commit), **not** `HEAD^`. With `HEAD^`, pushing several commits at once only
  examines the newest one — so an `admin-web` change followed by two backend
  commits in the same push would be skipped and never deploy. It falls back to
  building whenever it cannot tell (shallow clone, missing SHA, first deploy).
