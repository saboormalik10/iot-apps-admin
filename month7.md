# Month 7 — Foundation, Design System & Auth (execution plan)

## Context

The backend (Months 1–6) is complete and exposes ~90 endpoints across 18 modules, but **none of that
data has a UI**. `plan.md` (repo root) lays out a 6-month Next.js admin panel (Months 7–12); this plan
executes **Month 7**, the foundation slice that unblocks every later month: the app scaffold, the
design/chart system, BFF auth + RBAC, the app shell, the realtime foundation, a hardware-free
simulator + demo data, and the org/people module.

**Decisions locked with the user for this slice:**
- `admin-web/` is a **standalone project** (sibling to `backend/`, its own `package.json`/lockfile;
  Vercel root directory = `admin-web`). Backend is left structurally untouched.
- **Package manager: yarn** (independent of the backend's npm).
- **Do all of Month 7 — skip nothing**, built as an ordered series of PRs.
- **Backend changes must ship their Swagger docs too** (user's explicit instruction). Month 7 has **two**
  small backend changes (Part A): **(A1)** the WS-auth ticket endpoint (§11.1) — a new API surface →
  **Swagger updated**; **(A2)** point the invite / password-reset **email links** at the admin-web origin —
  email content, **not** an API surface → no Swagger. Both are specced below.

Everything in `admin-web/` runs against the API **as shipped**, except those two additive backend changes.

---

## Part A — Backend changes (two, both small)

### A1 — `POST /v1/auth/ws-ticket` (+ Swagger)

**Why:** under the BFF model the browser never holds the long-lived access token, but the socket.io
gateway authenticates the handshake with `verifyAccessToken` ([backend/src/realtime/events.gateway.ts:39-57](backend/src/realtime/events.gateway.ts#L39-L57)).
So realtime cannot connect without a way to hand the browser a **short-lived** token. This is §11.1
Option A (locked, §17 #13) and it **blocks the Month 7 realtime foundation**.

**Verified constraint:** `signAccessToken()` in [backend/src/utils/jwt.ts:15-17](backend/src/utils/jwt.ts#L15-L17)
**hardcodes `expiresIn: '15m'`** and takes no override — so we cannot "reuse it with a short expiry" as
written. We add a dedicated short-TTL signer on the **same `ACCESS_SECRET`**, so the gateway's
`verifyAccessToken` accepts the ticket **with no gateway change**.

**Changes (3 files + tests):**
1. `backend/src/utils/jwt.ts` — add
   `export function signWsTicket(payload: Omit<JWTPayload,'iat'|'exp'>): string` →
   `jwt.sign(payload, ACCESS_SECRET, { expiresIn: '60s' })`. (Leaves the 15m default untouched.)
2. `backend/src/auth/auth.service.ts` — add `mintWsTicket(user: JWTPayload)` returning
   `{ ticket: signWsTicket({ userId, organizationId, role, email }), expiresInSec: 60 }` (mirror the
   existing `signAccessToken` claim shape used at [auth.service.ts:171](backend/src/auth/auth.service.ts#L171)).
3. `backend/src/auth/auth.controller.ts` — add the endpoint following the file's existing house style:
   ```ts
   @ApiOperation({
     summary: 'Mint a short-lived WebSocket auth ticket (~60s)',
     description:
       'Admin-panel only. JWT-guarded. Returns a short-lived access token for the socket.io ' +
       'handshake (auth.token) so the long-lived access token never leaves the server under the ' +
       'BFF model. The /v1/ws gateway verifies it with the normal access-token secret.',
   })
   @ApiBearerAuth()
   @ApiCreatedResponse({ description: 'Ticket minted', schema: { example: { data: { ticket: 'eyJhbGci…', expiresInSec: 60 } } } })
   @ApiErrors('unauthorized')
   @Post('ws-ticket')
   @HttpCode(201)
   @UseGuards(JwtAuthGuard)
   async wsTicket(@CurrentUser() user: JWTPayload) { return { data: this.authService.mintWsTicket(user) }; }
   ```
   - Reuses `JwtAuthGuard` ([backend/src/common/guards/jwt-auth.guard.ts](backend/src/common/guards/jwt-auth.guard.ts)),
     `@CurrentUser`, `@ApiErrors('unauthorized')` (valid key confirmed), and `JWTPayload`.
   - **No `@Consumers` decorator → it lands in the 🖥️ Admin Panel Swagger spec** automatically (the
     audience-aware convention in [backend/src/main.ts](backend/src/main.ts)), which is correct.
   - **Swagger requirement satisfied**: the `@ApiOperation`/`@ApiCreatedResponse`/`@ApiErrors`/
     `@ApiBearerAuth` decorators above are the Swagger docs; they surface at the password-gated `/api`
     and in `/api/json/admin`. **Verified: Swagger is generated from decorators at boot via
     `SwaggerModule.createDocument` in [main.ts](backend/src/main.ts) — there is NO committed
     `openapi.json`/`swagger.json`**, so there is nothing to regenerate or commit; the decorators are the
     entire Swagger change the user asked for.
4. **No gateway change** — the gateway already accepts any valid access token (verified).
5. **Tests** — add **`backend/test/auth.e2e-spec.ts`** (none exists today; the dir already holds
   `*.e2e-spec.ts` + `jest-e2e.json`). Reuse the seeded admin login to get a bearer token, then assert:
   - `401` without a bearer token; `201` with a valid access token.
   - The returned `ticket` passes `verifyAccessToken` and decodes to the same `userId/organizationId/
     role`, with `exp ≈ now + 60s`.
   - (Optional smoke) a socket.io client connects to `/v1/ws` using the ticket as `auth.token`.
   - CI's existing backend job (build → seed → `npm test`) runs this automatically.

### A2 — Point invite / password-reset email links at the admin-web origin (no Swagger)

**Why (verified — this silently breaks invite + reset for the panel):** both emails build their links from
**`API_BASE_URL`** (the *backend* origin), and to a `/auth/...` path the backend doesn't serve as a page:
- [organizations.service.ts:195](backend/src/organizations/organizations.service.ts#L195) →
  `${API_BASE_URL}/auth/accept-invite?token=…`
- [auth.service.ts:203](backend/src/auth/auth.service.ts#L203) → `${API_BASE_URL}/auth/reset-password?token=…`

But the accept-invite and reset **pages live on the admin-web (Vercel) origin**; the backend has no such
HTML pages. So today those links lead nowhere — **the admin panel cannot complete invite or password reset
end-to-end** until the link **base + path** target admin-web.

**Change (2 lines + 1 env var; email content, not an endpoint → no Swagger):**
- Add a **`FRONTEND_URL`** env (the admin-web origin). *(`PUBLIC_SHARE_BASE_URL` already exists as the
  dashboard base and could be reused, but a dedicated `FRONTEND_URL` is clearer.)*
- `organizations.service.ts` → `${FRONTEND_URL}/accept-invite?token=…`;
  `auth.service.ts` → `${FRONTEND_URL}/reset-password?token=…`. Paths match the admin-web routes
  (`(auth)/accept-invite`, `(auth)/reset-password` render at `/accept-invite`, `/reset-password` — the
  `(auth)` group is not a URL segment).
- Set `FRONTEND_URL` in the backend's Render env. *Effort ~15 min · Owner: backend · Blocks: the Month-7
  invite + password-reset flows working end-to-end.* (An existing email-flow e2e, if any, updates its
  asserted URL; otherwise no test change.)

---

## Part B — `admin-web/` build (ordered PRs, yarn, Next 15 App Router + TS strict)

Repo layout (matches `plan.md` §2), created as a standalone project:
```
admin-web/
  app/(auth) (dash) (public)     app/api/**  (BFF route handlers)
  components/  components/charts/  features/  lib/  styles/  test/  e2e/  stories/
  scripts/validate_palette.js     simulator/
```

### PR1 — Scaffold, tooling, i18n & CI
- `yarn` project: Next 15 (App Router, TS **strict**), Tailwind, **shadcn/ui** init, **TanStack Query +
  Table**, ESLint/Prettier, **Vitest + RTL**, **Playwright + axe**, **Storybook** baseline.
- **i18n scaffold — `next-intl`** (`plan.md` §3.4 / §1): provider + `messages/en.json` catalog; **all copy
  routed through the catalog from day one** (English only now; extraction finalized Month 12). This is
  foundational — retrofitting hardcoded strings later is the failure mode we avoid.
- **CI — a *separate* `.github/workflows/ci-admin-web.yml`**, **path-filtered to `admin-web/**`**, so a
  backend-only PR doesn't run frontend CI (and add `paths: [backend/**]` to the existing `ci.yml` so an
  admin-web-only PR doesn't run the backend job). The existing `ci.yml` has **no path filters today** — as
  written, one shared workflow would run everything on every change. Keeping two path-scoped workflows fits
  the "two standalone projects" decision. Two jobs, because Playwright needs a running app+backend:
  - **Gate job** (fast, blocks merge): node 20, `corepack enable` (yarn), `cache: yarn`,
    `yarn install --frozen-lockfile`, then **typecheck → lint → unit/component test (Vitest+RTL, network
    mocked with MSW) → build → palette-validator → Swagger↔client contract-drift check**.
  - **E2E job** (hardware-free, deterministic — delivers `plan.md` §7's "tested in CI without hardware"):
    add a `mongodb: mongo:6` **service** (reusing the backend job's pattern), then **build + `npm run
    seed` + start the backend** (the seed is idempotent and generates ~1080 MET measures + NEP
    sessions/samples — real volume), start the built admin-web against that backend, run the **simulator**
    to emit live events, and run **Playwright + axe + Lighthouse (Web-Vitals budget)**. (`plan.md` §15's
    "Playwright against preview" also holds — the same suite reruns against the Vercel preview post-deploy.)
  - Triggers: push to `main`/`Month-*` + PRs, path-filtered as above. Lighthouse baseline non-blocking now,
    tightened Month 12.
- **`.dockerignore`** (repo root — none exists today): exclude `admin-web/` (+ `**/node_modules`, `.next`).
  The backend Dockerfile only `COPY`s `backend/**` (verified — so the image is unaffected), but Render
  sends the whole repo as build context; ignoring `admin-web/` keeps the backend build fast.
- **Vercel**: root directory = `admin-web`, preview-per-PR. (Manual: create the Vercel project + set the
  env vars listed below; add Vercel token/org/project as GitHub secrets if CI triggers deploys.)
- **Feature-flag seam** (`plan.md` §15): a tiny env/config flag mechanism so half-built later surfaces
  can be gated and staged — established now, used from Month 8.
- **TanStack Query provider**: a `QueryClientProvider` in a client boundary with App-Router SSR
  hydration (`dehydrate`/`HydrationBoundary`) + sensible default `staleTime`; established in PR1 so
  every later feature's typed hooks (PR4+) plug in.
- **Env vars — mind the server/browser split:**
  - `BACKEND_URL=https://iot-apps-admin.onrender.com/v1` — **server-only** (the BFF proxy uses it).
  - `NEXT_PUBLIC_BACKEND_WS_URL=wss://iot-apps-admin.onrender.com` — **browser-visible** (the socket
    connects **from the browser** to `/v1/ws`; must be a `NEXT_PUBLIC_*` var, not the server `BACKEND_URL`).
  - `SESSION_SECRET` (server), `SENTRY_DSN`.
  - **CI E2E job** also sets, for the spun-up backend + simulator: `MONGO_URI`, `JWT_ACCESS_SECRET`,
    `JWT_REFRESH_SECRET`, and **`MOBILE_API_KEY` / `MOBILE_ORG_ID`** (the simulator's sync calls are gated
    by these, per `jwt-or-apikey.guard.ts`); email is left unconfigured so invite/reset return dev tokens.

### PR2 — Design system & chart palette
- `styles/tokens.css` — light/dark CSS custom properties (color roles, typography, spacing, radius),
  logo placeholder. Theme via `:root[data-theme]` + `prefers-color-scheme`.
- **Chart color system** (categorical/sequential/diverging/status) per `plan.md` §4, seeded from the
  §4 table, delivered as tokens referenced **by role**.
- `scripts/validate_palette.js` — the dataviz validator (`--mode light|dark`, CVD ΔE ≥ 12); wired into CI.
- **Storybook** baseline so later chart primitives compose vetted tokens.

### PR3 — BFF auth + session + RBAC
- **BFF route handlers** under `app/api/auth/*` proxying the backend auth endpoints
  ([backend/src/auth/auth.controller.ts](backend/src/auth/auth.controller.ts)): `login`, `logout`,
  `refresh`, `forgot-password`, `reset-password`, and `accept-invite`
  ([backend/src/organizations/organizations.controller.ts:38](backend/src/organizations/organizations.controller.ts#L38)).
  - **Session**: `login` returns `{ user, accessToken, refreshToken }` in the **body** (verified) → the
    BFF stores them in an **encrypted session cookie on the web origin** (`iron-session`-style) —
    `httpOnly`, `Secure`, **`SameSite=Lax`** (Lax, not Strict: the reset-password / accept-invite links
    arrive as top-level GET navigations from email and must carry the session). The access token stays
    server-side; the backend's own `refreshToken` cookie (`sameSite:strict`, `path:/v1/auth`) is not
    relied upon cross-site.
  - **Email-dependent flows are dev/CI-friendly**: `invite` and `forgot-password` send email via the
    backend's nodemailer (`EMAIL_*`); with email unconfigured, `forgot-password` returns a `devToken`
    and invites can be resolved from the invite record — so the accept-invite / reset E2E journeys run
    **without a real mailbox**.
  - **Silent refresh (verified: refresh does NOT rotate — returns only `accessToken`)**: on a backend
    `401`, the BFF calls `/v1/auth/refresh` with the stored refresh token (body), updates the session,
    retries once. **If the refresh call *itself* 401s** (`INVALID_REFRESH_TOKEN` / `TOKEN_REVOKED` /
    `TOKEN_EXPIRED` / user suspended — verified codes in [auth.service.ts:152-178](backend/src/auth/auth.service.ts#L152-L178)),
    the BFF **clears the session and redirects to `/login`** (hard logout) — it does not loop. A user an
    admin deactivates (PR7 active-toggle) is thus force-logged-out on their next refresh. Errors are the
    consistent `{error:{code,message}}`.
  - **`accept-invite` auto-logins**: it returns `{ user, accessToken, refreshToken }` too → the BFF sets
    the session exactly like `login`. (`register` is seed-time/admin only — **no** public signup route.)
  - **Idle-session timeout + "log out everywhere"** (`plan.md` §11): session idle expiry; logout revokes
    the refresh token server-side (existing `logout` endpoint) to invalidate other sessions.
- **Generic BFF proxy — the pass-through every authenticated call uses** (`plan.md` §3.1: "BFF route
  handlers (`app/api/**`) attach the access token server-side and refresh transparently on 401"). A
  catch-all `app/api/[...path]/route.ts` reads the session, attaches `Authorization: Bearer <access>`,
  forwards to `${BACKEND_URL}/...`, and on `401` runs the silent-refresh path once and retries.
  **Concurrent `401`s share a single in-flight refresh (dedupe/queue)** — a burst of parallel dashboard
  queries must not trigger a refresh storm or a refresh-token race. **This is the foundation the entire
  app's data layer rides on** — org/users/notifications/audit/me and every later module call it; the typed
  api client (PR4) targets these BFF routes, never the backend directly. Streams multipart through
  unchanged (needed for Month-12 CSV import). The browser never sees a token. The explicit
  `app/api/auth/*` and `app/api/ws-ticket` routes (which mutate the session cookie) sit **above** this
  catch-all — Next resolves specific routes before `[...path]`, so they are not swallowed.
- Pages: `(auth)/login`, `/forgot-password`, `/reset-password`, `/accept-invite` — each reads its
  `?token=` from the email link (A2) and **handles expired / invalid / already-used tokens** gracefully:
  invite & reset tokens are **TTL-indexed and auto-purge** (verified), and the API returns 400/401 for a
  dead token → show a "link expired — request a new one" state, not a crash. Session context; protected
  `(dash)` layout.
- **RBAC**: capability matrix (`admin`/`operator`/`viewer`) from `plan.md` §3.3 → `lib/rbac` + `useRbac`
  + route/element guards. Client guards are UX only; the backend re-checks roles (`RolesGuard`).
  **Role/active changes propagate on the target user's next BFF refresh** (`refreshAccessToken` re-signs
  role/isActive from the DB — verified) — so a PR7 role change takes effect within ≤15m (or immediately on
  their next 401), without needing them to re-login; a deactivation force-logs-them-out (see silent-refresh above).
- **Zod**: client schemas are the **primary** validation guard (per revised `plan.md` §10.6 — auth DTOs
  have no server-side class-validator): email format + password ≥ 8 (accept-invite/reset), with the
  server `message[]` as a form-level fallback.
- **Login 429 handling** (`plan.md` §11): the backend throttles `POST /v1/auth/login` to **10/60s**
  ([auth.controller.ts:100](backend/src/auth/auth.controller.ts#L100)); the login form handles `429`
  gracefully (backoff + jitter, respect `Retry-After`) and shows a neutral "too many attempts" message.
  Forgot-password stays neutral ("if the email exists…") — no user enumeration.
- **Security foundation (lands with the BFF, `plan.md` §11 — "not a Month-12 afterthought"):**
  - **CSP** via Next middleware (nonce-based scripts): `default-src 'self'`; `img-src 'self'
    https://res.cloudinary.com data:`; `connect-src 'self' <backend-origin> wss://<backend-origin>`;
    `frame-ancestors 'none'`. MapLibre hosts added when maps land (Month 8).
  - **Route protection**: the same middleware redirects unauthenticated `(dash)` requests → `/login` and
    stamps the CSP nonce. The `(auth)` and `(dash)` groups are built now; the `(public)` group is
    scaffolded but **empty until the Month-11 share view** (only its error boundary exists in M7).
  - **Security headers**: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`,
    `Permissions-Policy`.
  - **CSRF**: state-changing BFF route handlers enforce an **origin / `sec-fetch-site` check** so the
    session cookie alone can't drive a mutation.
  - **XSS seam**: React escaping for JSX; a **DOMPurify** wrapper reserved for any future HTML sink
    (MapLibre popups, chart labels) — no `dangerouslySetInnerHTML` without it.
  - No token/secret in the client bundle; **Dependabot + `npm/yarn audit` gate**.

### PR4 — App shell & observability foundation
- Responsive sidebar + topbar, org context, user menu, **theme toggle**, **units toggle** (wired to
  `/analytics/unit-convert` context; no charts consume it until Month 8), and the **notification-bell
  shell** (wired live in PR5). Nav visibility driven by the RBAC matrix. **Responsive strategy** (§13):
  desktop-first, tablet-usable, phone-reduced; wide content in `overflow-x:auto`.
- **Toast / notification-center primitive** (`plan.md` §13, §14 `Toast`): the app-wide feedback surface —
  auth errors, mutation success/failure, and (from PR5) live alert toasts all route through it. The api
  client maps the consistent `{error:{code,message}}` → toast/inline copy (`plan.md` §10.3). Needed now
  so PR3 auth and PR7 mutations have real feedback.
- Cross-cutting `lib/`: typed **api client** (Swagger-derived types + Zod boundary), the **pagination
  envelope normalizer** → `{rows,page,limit,total,pageCount}` (`plan.md` §10.3), `lib/time.ts`
  (epoch-ms vs ISO, viewer-local/UTC/device toggle, §10.1), units context. **Error handling is safe to
  centralize**: verified the backend's `AllExceptionsFilter` always emits `{ error: { code, message } }`
  (HTTP + service-layer), and the default `ValidationPipe` yields `message[]` — so the api client maps
  `error.code` → toast/inline and `HTTP_401` → silent refresh (§10.3) against a *consistent* shape. *(Note
  for Month 8: `ValidationPipe({ whitelist:true })` strips undecorated fields — all Month-7 DTOs are
  decorated, but the unvalidated device-settings body must be bound via its interface, not the DTO class,
  or fields get stripped.)*
- **Observability foundation (`plan.md` §12):** **Sentry** (errors + tracing + release health, source
  maps uploaded on deploy); a **global error boundary per route group** (`(auth)`/`(dash)`/`(public)`);
  **structured client logging** (levels, no PII); the four screen states + skeleton system as reusable
  primitives (`plan.md` §3.5).
- The **`(dash)/` index in Month 7 is the shell + a first-run/welcome placeholder** (empty-org
  onboarding, PR7); the live dashboard home (KPIs, tiles, wind rose) lands **Month 8**. Nav links to
  not-yet-built Month 8–12 sections are feature-flagged off.

### PR5 — Realtime foundation (consumes Part A)
- `app/api/ws-ticket` BFF route → calls the new **`POST /v1/auth/ws-ticket`** with the session's access
  token (silent-refreshing it first if the 15m access token has expired, since that endpoint is
  JWT-guarded), returns the short ticket to the browser.
- `lib/socket` — one shared socket.io client to **`${NEXT_PUBLIC_BACKEND_WS_URL}` + path `/v1/ws`**
  (browser → backend directly; the gateway is `cors:{origin:'*'}`, so no `CORS_ORIGIN` change is needed)
  with `auth.token = ticket`, **reconnect/backoff**, `LiveIndicator` status. Hooks `useSocket` /
  `useDeviceSubscription` / `useOrgEvents`. **Because the ticket lives only ~60s, the client fetches a
  *fresh* ticket from the BFF before *every* connect and reconnect attempt** (socket.io `auth` callback)
  — a reconnect after a long drop must not reuse a stale ticket. Also add the WS origin to the CSP
  `connect-src` (PR3).
- **Shared `lib/realtime/events.ts` (`ClientEvent` constants) mirrored from
  [backend/src/realtime/realtime.events.ts](backend/src/realtime/realtime.events.ts)** — exact names
  (`notification:new`, `nep:session:created`, …); no hand-typed strings (`plan.md` §3.2).
- **Notification bell wired live**: subscribe to `notification:new` + `alert:triggered`; the badge reads
  `unreadCount` from `GET /notifications` (first live feature). Reconnect → refetch (truth-is-server).

### PR6 — Simulator & demo data (hardware-free)
- Reuse `backend` `npm run seed` (idempotent) for a demo org + admin/operator/viewer users + MET & NEP
  devices + settings + a seeded alert rule + ~3h of MET measures / NEP samples. The seed **prints the
  seeded admin/operator/viewer credentials** → the E2E login journeys and the RBAC-matrix tests sign in
  with them (all three roles), no manual account setup.
- `admin-web/simulator/` — a dev-only Node script that drives the **real** backend sync endpoints
  (`POST /v1/sync/upload`, `PATCH /v1/sync/device-status`) using `MOBILE_API_KEY`/`MOBILE_ORG_ID`, so the
  backend emits **real** `met:latest` / `nep:sample` / `device:status` events on an interval. It
  **deliberately pushes readings that cross the seeded alert rule's threshold** so the true
  ingest→evaluate→notify path fires `alert:triggered` / `notification:new`, and it **toggles a device
  online/offline** to exercise `device:status` / `device:connected`. Highest fidelity (real pipeline),
  **no backend change**, no hardware — for dev, the CI E2E job (PR1), and demos.

### PR7 — Org & people module
- `(dash)/org`: **org settings** form → `GET/PATCH /organizations/me` (fields verified:
  `name, contactEmail, country, timezone`; admin-only); **users table** → `GET /organizations/me/users`
  (`id,email,firstName,lastName,role,isActive,lastLoginAt,invitedAt`) — **verified the endpoint returns the
  FULL array (unpaginated)**, so this table sorts/filters **client-side** (fine for the small org, §17#5);
  do **not** build server pagination here (unlike the audit log, which *is* server-paginated); **invite** →
  `POST /organizations/me/users/invite` (`email, role?, firstName?, lastName?`; 409 if exists);
  **role/active edit** → `PATCH /organizations/me/users/:id` (blocks self-edit + last-admin removal).
- **Audit log** → `GET /audit` with the verified **server-side filters** (`action`, `resourceType`,
  `userId`, `from`, `to`, page/limit) as a filter bar + row-expand **DiffViewer** over `changes`
  (`plan.md` §6).
- **Profile + password** under `(dash)/settings` → `GET/PATCH /users/me`. Verified:
  [users/dto.ts](backend/src/users/dto.ts) — `PATCH /users/me` updates name **and** password, and a
  password change **requires `currentPassword` + `newPassword`** (`newPassword` is server-validated
  `@MinLength(8)` — one of the few DTOs that actually validates). The form collects current + new +
  confirm; Zod mirrors "≥ 8" and "current required when changing".
- **Empty-org first-run onboarding** (`plan.md` §13): a brand-new org (no devices yet — the common
  cold-start) gets a first-run state that teaches the next action ("invite teammates, connect first
  device"). *(Global command palette/search is deferred — it needs the device/session/record entities
  that arrive Month 8+.)*

---

## Cross-cutting conventions (apply from PR1)
- Four screen states everywhere (loading/empty/error/populated); `plan.md` §3.5.
- Zod = primary validation guard; server `message[]` = form-level fallback (`plan.md` §10.6).
- `ClientEvent` + (later) `scales.ts` constants mirrored from the backend, drift-checked in CI.
- All copy through the `next-intl` catalog (English now); no hardcoded strings.
- No token/secret in the client bundle; CSP + security headers + CSRF origin check per `plan.md` §11.

## Coverage map — every Month-7 item in `plan.md` → where it lands (nothing skipped)
| `plan.md` Month-7 / foundation item | Covered by |
|---|---|
| App scaffold + CI + Vercel preview (status row 1) | PR1 |
| Design tokens + validated chart palette + Storybook (row 2) | PR2 |
| BFF auth login/refresh/logout/reset/accept-invite + RBAC (row 3) | PR3 |
| App shell (nav, theme, units, bell) (row 4) | PR4 |
| Socket client (BFF ticket) + live bell (row 5) | Part A + PR5 |
| Device/WebSocket simulator + seeded demo-data (row 6) | PR6 |
| Org/users/invites/roles/audit/profile (row 7) | PR7 |
| **i18n / next-intl scaffold** (§3.4, §1) | PR1 |
| **Security foundation** — CSP, headers, CSRF, XSS seam, idle timeout, log-out-everywhere (§11) | PR3 |
| **Observability** — Sentry, error boundaries, structured logging (§12) | PR4 |
| **CI quality gates** — palette validator, Lighthouse/Web-Vitals, Swagger↔client drift (§12) | PR1 |
| **Hardware-free deterministic CI E2E** — mongo service + seed + simulator + Playwright/axe (§7, §15) | PR1 + PR6 |
| CI path-isolation (separate `ci-admin-web.yml`, `paths:` filters) + repo-root `.dockerignore` | PR1 |
| Role/active change propagates on next BFF refresh; re-signed from DB (verified) | PR3 |
| Login 429 / throttle handling; no user enumeration on forgot-password (§11) | PR3 |
| **Generic BFF proxy** — all authenticated calls attach token + silent-refresh (§3.1) | PR3 |
| BFF robustness — concurrent-401 refresh dedupe + route-protection middleware (§3.1, §11) | PR3 |
| Profile password change requires currentPassword + newPassword≥8 (verified DTO) | PR7 |
| Typed api client + envelope normalizer + time/units contexts (§3.1, §10.1/§10.3) | PR4 |
| Toast / notification-center feedback surface + error→toast mapping (§13, §14, §10.3) | PR4 |
| Realtime ws-ticket refreshed per (re)connect; fresh 60s ticket each time (§3.2, §11.1) | PR5 |
| Four screen states + skeleton system (§3.5) | PR4 (cross-cutting) |
| Feature-flag seam (§15) | PR1 |
| Empty-org first-run onboarding (§13) | PR7 |
| Responsive desktop/tablet/phone strategy (§13) | PR4 |
| Backend change A1: `POST /v1/auth/ws-ticket` + **Swagger** (§11.1) | Part A |
| Backend change A2: invite/reset email links → admin-web origin (no Swagger; unblocks invite+reset) | Part A |
| Auth lifecycle — refresh non-rotating + hard-logout on refresh 401 + deactivated-user logout | PR3 |
| Auth token expiry — invite/reset TTL auto-purge → "link expired" states | PR3 |
| *Deferred within scope:* command palette (needs M8 entities); chart primitives (Month 8); Scope Bar (Month 8) | — |

## Definition of Done (Month 7)
TS strict passes; ESLint/Prettier clean; unit + component (MSW-mocked) green in the gate job and
**Playwright E2E + axe green in the seeded, hardware-free E2E job**; **keyboard/focus + reduced-motion**
respected on new screens; **palette validator** passes light+dark; **Lighthouse budget** wired;
**Swagger↔client drift check** green; **Sentry + error boundaries** live; **CSP/security headers** present;
**next-intl** catalog in use; Vercel preview demoable; RBAC matrix honored; the backend **`ws-ticket` e2e**
is green. Maps to `plan.md` §7 Month-7 status table (all 7 rows) **plus** the §3/§11/§12 foundations Month
7 establishes.

## Verification
1. **Backend**: `cd backend && npm run build && npm run seed && npm test` — ws-ticket e2e green. Start
   the API, hit the password-gated `/api` → confirm `POST /v1/auth/ws-ticket` appears in the **Admin
   Panel** spec with the documented `{ data: { ticket, expiresInSec } }` example and a 401 response.
2. **admin-web**: `cd admin-web && yarn && yarn test && yarn build && yarn playwright test` (incl. axe),
   plus the palette validator, Lighthouse budget, and Swagger↔client drift check. Confirm response
   headers carry the **CSP + security headers**, and that UI copy resolves through the **next-intl** catalog.
3. **End-to-end demo (the M7 acceptance script)**: run the simulator → log in → the app shell renders →
   the **notification bell goes live** (a simulated `alert:triggered` bumps `unreadCount` without a
   refresh) → invite a user / edit org settings → the change shows in the **audit log** with a diff →
   **the invite/reset email link points to the admin-web origin (A2)** and the accept-invite page
   completes with auto-login. Use the `/run` skill (or `yarn dev` + browser) to drive it; confirm the
   socket connects with a freshly-minted ws-ticket and reconnects after a drop, a **deactivated user is
   forced to `/login` on their next refresh**, and a thrown error is captured by the **route-group error
   boundary** (and reported to Sentry when `SENTRY_DSN` is set).

## Manual prerequisites (not code)
- Create the Vercel project (root dir `admin-web`) + set `BACKEND_URL` (server), `NEXT_PUBLIC_BACKEND_WS_URL`
  (browser), `SESSION_SECRET`, `SENTRY_DSN`.
- For the simulator/demo: a local `.env` with `MOBILE_API_KEY` / `MOBILE_ORG_ID` and `MONGO_URI` for seed.
- **No backend `CORS_ORIGIN` change needed for admin-web**: under pure BFF the browser makes no direct
  HTTP call to the backend, and the WS gateway is already `cors:{origin:'*'}`. (Only revisit if a future
  direct browser→backend HTTP call is ever introduced.)
- Backend deploy is untouched **except** the two additive Part-A changes: **(A1)** the `ws-ticket`
  endpoint (deploy before the realtime PR5; reuses `JWT_ACCESS_SECRET`, no new env) and **(A2)** the
  invite/reset email-link base — **set `FRONTEND_URL`** to the admin-web origin in Render, deploy before
  inviting/resetting for real (otherwise those emails link to the wrong origin).
