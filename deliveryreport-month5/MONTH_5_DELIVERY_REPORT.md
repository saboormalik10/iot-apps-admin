# Month 5 — Delivery Report

**Project:** ObservatorNepLink (MET-LINK + NEP-LINK IoT Platform)
**Month:** 5 (Weeks 17–20)
**Theme:** Bug Fixes, Production Hardening, Store Prep — the **security & release-readiness** layer
**Backend URL:** https://iot-apps-admin.onrender.com
**Branch:** Month-4 (working branch)
**Prepared by:** Saboor Malik — Backend Engineer

---

## Summary

Month 5 hardens the backend for production and ships a full **API-documentation
overhaul** so both mobile teams and the admin dashboard team can self-serve the
contract. There are **no new REST endpoints** this month.

The documentation work turns the single, resource-grouped Swagger page into an
**audience-aware** reference: a top-right dropdown switches between **All /
📱 NEP-LINK App / 📱 MET-LINK App / 🖥️ Admin Panel**, so a mobile dev sees only the
endpoints their app calls, with **per-app request bodies** on the shared endpoints
(`POST /v1/devices`, `POST /v1/sync/upload`, `PATCH /v1/sync/device-status`) and
example success + error responses everywhere. The whole docs surface now sits
behind an **HTTP Basic-Auth password gate**.

On the hardening side: file uploads are validated by **magic bytes** (not the
spoofable declared mimetype), **CORS** is locked to the dashboard origin, security
headers include **HSTS**, and a **Sentry** crash-reporting hook is wired (enabled
by env). The duplicate/dead Express + swagger-jsdoc stack was removed, leaving one
source of truth (the NestJS decorators).

### Status

| Area | Status |
|---|---|
| Swagger audience dropdown — All / NEP-LINK / MET-LINK / Admin (4 filtered specs) | ✅ Done |
| Per-app request examples on shared endpoints (devices / sync) | ✅ Done |
| Example success + error responses (400/401/403/404/415/429) on every endpoint | ✅ Done |
| Query params (`@ApiQuery`) documented on all GET endpoints | ✅ Done |
| Embedded **Mobile Apps** integration guide + Bearer scheme clarification | ✅ Done |
| **Swagger docs password gate** (HTTP Basic Auth, fail-closed) | ✅ Done |
| Removed dead Express/swagger-jsdoc stack (`app.ts`, `*.routes.ts`, `config/swagger.ts`, `middleware/`) | ✅ Done |
| **File-upload magic-byte validation** (`file-type`) → 415 on spoofed content | ✅ Done |
| **CORS lock-down** to `CORS_ORIGIN` (dashboard origin) | ✅ Done |
| Security headers — **HSTS** + X-Frame-Options (helmet) | ✅ Done |
| **Sentry** crash-reporting hook (`SENTRY_DSN`, no-op when unset) | ✅ Done |
| Org-isolation audit — every query scoped by `organizationId` | ✅ Verified |
| Structured logging (Pino) | ⏳ Deferred — `morgan` retained; secret-redacting Pino is a follow-up |
| Production cluster (Atlas M10) + uptime monitoring | 🔧 Ops config (Render/Atlas dashboards) |
| `nest build` clean (exit 0, TypeScript strict) | ✅ Done |

---

## What was built

### API documentation overhaul (NestJS Swagger at `/api`)
- **Audience dropdown.** `main.ts` builds the full OpenAPI document once, then
  derives three filtered copies (`nep-link`, `met-link`, `admin`) by an
  `x-consumers` OpenAPI extension stamped on each operation via a new
  `@Consumers()` decorator. The four specs are served under `/api/json/*` and
  wired into one Swagger UI via the definition selector (`explorer: true`).
- **Consumer tagging.** Only the 11 mobile-reachable operations carry
  `@Consumers(...)`; everything else defaults to `admin`.
  `PATCH /v1/devices/:id/settings` is tagged mobile **and** admin.
- **Per-app examples.** Shared endpoints show a request **Examples** dropdown
  (e.g. `nep_session` vs `met_record` for `POST /v1/sync/upload`) with matching
  example responses.
- **Full response/param coverage.** A shared `@ApiErrors()` decorator adds the
  `{ error: { code, message } }` envelope for 400/401/403/404/415/429 as
  appropriate; `@ApiQuery` documents every GET's query params; CSV exports declare
  `text/csv`; the `MeasureDto` example was corrected to the real CSV-triplet format.
- **Password gate.** A small Basic-Auth middleware protects `/api`, `/api/json/*`
  and `/api.json` in every environment; fail-closed (503) when
  `SWAGGER_USER`/`SWAGGER_PASSWORD` are unset. `/api.json` remains for Postman.
- **Dead-code removal.** The unused Express app and swagger-jsdoc stack were
  deleted (they never ran; the app boots `dist/main`), removing a second,
  confusing source of truth and two dependencies.

### Production hardening
- **`src/utils/storage.util.ts`** — `assertAllowedFileType()` sniffs the buffer's
  real type with `file-type`; content outside {jpeg, png, webp, gif, csv, pdf} is
  rejected with a **415 `INVALID_MIME`** (CSV/plain-text, which has no signature,
  is allowed only when the declared type is text-based). Runs before the Cloudinary
  upload on `POST /sessions/:id/files` and `POST /records/:id/pictures`.
- **`main.ts`** — CORS restricted to `CORS_ORIGIN` (wildcard only when unset, for
  dev); helmet keeps a Swagger-safe CSP and adds explicit HSTS; a guarded
  `Sentry.init()` runs when `SENTRY_DSN` is set.

### New environment variables
`SWAGGER_USER`, `SWAGGER_PASSWORD` (docs gate), `CORS_ORIGIN` (allow-list),
`SENTRY_DSN` (crash reporting) — added to `backend/.env.example` and `render.yaml`.

---

## Verification

- `npm install` → adds `file-type@16` (CJS) + `@sentry/node`; `npm run build` →
  **exit 0**, TypeScript strict clean.
- Docs gate: `GET /api` with no credentials → **401** (browser login prompt); with
  the configured user/pass → the UI loads. `/api/json/nep-link` returns only the
  NEP-LINK operations; `/api/json/admin` excludes the mobile-only uploads.
- Upload validation: a file whose bytes are not a real image/csv/pdf → **415**
  `INVALID_MIME`; a genuine JPEG/PNG/CSV still uploads (201).
- CORS: a request from a non-allow-listed browser origin is blocked when
  `CORS_ORIGIN` is set; a mobile-style `Authorization: Bearer obs_mob_…` request is
  unaffected.

---

## Not in Month 5 — Mobile-team scope (separate app repos)

These Month 5 timeline items live in `met-link-mob` / `observator-nep-link-ble`
and are the Mobile team's deliverables — they are **not** backend/Swagger work:

| Item | App | Where |
|---|---|---|
| Redux sample-append bug (`loggingSlice.ts` overwrite) | NEP-LINK | `observator-nep-link-ble` |
| AsyncStorage→SQLite migration not wired (`App.tsx`) | NEP-LINK | `observator-nep-link-ble` |
| Nav header title bug (`RootNav.tsx`) | NEP-LINK | `observator-nep-link-ble` |
| Remove 60+ `🔍 RNFS LOG` debug logs; add `ErrorBoundary` | NEP-LINK | `observator-nep-link-ble` |
| `scanUnpairedDevices()` stub; base64→filesystem pictures | MET-LINK | `met-link-mob` |
| App icons / splash, iOS Info.plist + Android manifest, TestFlight | Both | app repos |

Still scheduled for **Month 6** (per the timeline): Share-links + `/public/:token`,
Alert-rules + Notifications, CI/CD + unit-test coverage.
