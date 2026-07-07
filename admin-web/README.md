# admin-web

Observator Instruments — Next.js 15 admin panel (Month 7 foundation). Standalone
project (own `package.json`/lockfile, **yarn**); the NestJS backend in `../backend`
is untouched except the two additive Part-A changes (ws-ticket endpoint + email
link origin).

## Architecture

- **App Router** with route groups: `(auth)` (login/reset/invite), `(dash)`
  (authenticated shell), `(public)` (scaffolded, empty until Month 11).
- **BFF** — the browser never holds a token. `app/api/**` route handlers proxy the
  backend, attaching the access token from an **encrypted session cookie**
  (iron-session) server-side and **silent-refreshing on 401** (deduped). The
  generic pass-through is `app/api/[...path]/route.ts`.
- **Design system** — tokens by role in `styles/tokens.css` (light/dark),
  validated chart palette (`scripts/validate_palette.js`), shadcn/ui primitives.
- **Data** — TanStack Query hooks per feature; typed client in `lib/api`; the
  pagination envelope is normalized in one place (`lib/api/pagination.ts`).
- **Realtime** — one shared socket.io client (`lib/realtime`) that fetches a fresh
  ~60s WS ticket from the BFF before every (re)connect; event names mirrored from
  the backend and drift-checked in CI.
- **RBAC** — single capability matrix (`lib/rbac`) drives nav visibility + guards;
  the backend re-checks every role.
- **Security** — nonce-based CSP + security headers + route protection in
  `middleware.ts`; CSRF origin check on mutating BFF routes.
- **Observability** — Sentry (client/server/edge) + per-route-group error
  boundaries + structured logging (`lib/logger.ts`).
- **i18n** — next-intl; all copy in `messages/en.json`.

## Scripts

| Script | What |
|---|---|
| `yarn dev` | Dev server on :3001 |
| `yarn build` / `yarn start` | Production build / serve |
| `yarn typecheck` | `tsc --noEmit` (TS strict) |
| `yarn lint` | ESLint |
| `yarn test` | Vitest + RTL (MSW-mocked) |
| `yarn test:e2e` | Playwright + axe |
| `yarn storybook` | Storybook |
| `yarn validate-palette` | Chart palette validator (light + dark) |
| `yarn check-contract` | Swagger ↔ client + ClientEvent drift |
| `yarn simulator` | Hardware-free device simulator (drives real backend sync) |

## Environment

Copy `.env.example` → `.env.local`. Mind the server/browser split — only
`NEXT_PUBLIC_*` vars reach the browser.

- `BACKEND_URL` (server) — backend origin incl. `/v1`.
- `NEXT_PUBLIC_BACKEND_WS_URL` (browser) — the socket connects from the browser.
- `SESSION_SECRET` (server, ≥32 chars) — encrypts the session cookie.
- `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` — optional; no-op unless set.
- `NEXT_PUBLIC_FEATURE_FLAGS` — comma-separated flag keys to force-enable.

## Local demo (M7 acceptance)

```bash
# 1. backend (seed prints admin/operator/viewer credentials)
cd ../backend && npm run seed && npm run dev
# 2. admin-web
cd ../admin-web && yarn dev
# 3. drive live events through the real pipeline
MOBILE_API_KEY=obs_mob_… MOBILE_ORG_ID=<seeded org id> yarn simulator
```

Sign in as the seeded admin → the shell renders → the notification bell goes live
when the simulator crosses the seeded alert threshold → invite a user / edit org
settings → the change appears in the audit log with a diff.
