# Month 4 — Delivery Report

**Project:** ObservatorNepLink (MET-LINK + NEP-LINK IoT Platform)
**Month:** 4 (Weeks 13–16)
**Theme:** Branding, User Roles, Mobile-Responsive, Testing — the **org / user management + account layer**
**Backend URL:** https://iot-apps-admin.onrender.com
**Branch:** Month-3 (working branch)
**Prepared by:** Saboor Malik — Backend Engineer

---

## Summary

Month 4 completes the **account & administration layer** of the platform. It adds the three remaining admin-panel page groups that were scheduled for this month — **Profile** (`/users/me`), **Organization + User management** (`/organizations/me/...`, including the full invite → accept flow with role-based access control), and the **Audit-log read** API (`/audit`). It also migrates all **media uploads off ephemeral local disk to Cloudinary** so photos/maps survive Render restarts and are served from a CDN.

After this month **every admin-panel page through Month 4 is fully backed** for both MET-LINK and NEP-LINK. Share-links/Public-view + Alert-rules/Notifications remain scheduled for **Month 6**.

> Weeks 14–15 (Observator branding, dark/light theming, mobile-responsive layout, cross-browser QA) are **front-end work in Hassan's Angular dashboard** and carry **no backend changes** — they consume the APIs delivered here. Week 16 (staging environment seed data) is covered by the extended seed script below.

### Status

| Area | Status |
|---|---|
| Profile — `GET/PATCH /users/me` (name edit + password change) | ✅ Done |
| Organization — `GET/PATCH /organizations/me` (settings, admin only) | ✅ Done |
| User management — `GET /organizations/me/users` (admin) | ✅ Done |
| Invite flow — `POST /organizations/me/users/invite` + email (admin) | ✅ Done |
| Invite acceptance — `POST /organizations/accept-invite` (public, auto-login) | ✅ Done |
| Role / status change — `PATCH /organizations/me/users/:id` (admin, last-admin guard) | ✅ Done |
| Audit-log read — `GET /audit` (admin, paginated + filters) | ✅ Done |
| **Cloudinary media migration** (NEP files + MET pictures) | ✅ Done |
| Seed extended — operator + viewer users + demo audit entries | ✅ Done |
| Jest e2e suite — **4 new specs (users / organizations / audit / files) passing** | ✅ Done |
| `nest build` clean (exit 0, TypeScript strict) | ✅ Done |

---

## What was built

### New module: `src/users/` — base path `/v1/users`
- `GET /users/me` — current user profile (no `passwordHash` ever returned).
- `PATCH /users/me` — edit `firstName`/`lastName` and/or change password. Password change requires `currentPassword` + `newPassword` (min 8), verified with bcrypt; on success **all other refresh-token sessions are revoked**. Writes an `update` audit entry.

### New module: `src/organizations/` — base path `/v1/organizations`
- `GET /organizations/me` — organisation document.
- `PATCH /organizations/me` *(admin)* — update `name` / `contactEmail` / `country` / `timezone`; writes a `settings` audit entry.
- `GET /organizations/me/users` *(admin)* — all org members with `role`, `isActive`, `lastLoginAt`, `invitedAt`.
- `POST /organizations/me/users/invite` *(admin)* — creates an **inactive** user, issues a hashed 7-day `InviteToken`, emails a branded invite link (Nodemailer), and writes an `invite` audit entry. 409 if the email already exists.
- `POST /organizations/accept-invite` *(public)* — validates the token, sets the password, activates the account, and **returns access + refresh tokens (auto-login)**.
- `PATCH /organizations/me/users/:id` *(admin)* — change a user's `role` / `isActive`. Guards: **cannot modify yourself**, and **cannot demote or deactivate the last active admin**. Deactivating a user revokes their sessions. Writes `update` / `revoke` audit entries.

### New module: `src/audit/` — base path `/v1/audit`
- `GET /audit` *(admin)* — org-scoped, newest-first, **paginated** (`page`, `limit` ≤ 100) with `action`, `resourceType`, `userId`, `from`, `to` filters. Backed by the existing `AuditLog` compound indexes.

### New model: `src/models/InviteToken.ts`
Mirrors `PasswordResetToken` (hashed token, 7-day TTL index, `role`, `invitedBy`). Backs the invite → accept loop.

### Reused infrastructure (no new code)
`RolesGuard` + `@Roles('admin')`, `JwtAuthGuard`, `@CurrentUser()`, the bcrypt cost-12 hashing, the `crypto` token hashing, the `{ data }` response envelope, and the inline non-blocking `AuditLog.create().catch()` pattern — all already present from Months 1–3.

### Media storage → **Cloudinary** (replaces local disk)
Render's filesystem is ephemeral, so disk uploads were lost on every redeploy. All storage I/O was already isolated behind `src/utils/storage.util.ts`, so the swap was contained:
- New `src/config/cloudinary.ts` configures the SDK from `CLOUDINARY_URL` (or the three split vars), wired once in `main.ts`.
- `storage.util.ts` now streams the in-memory multer buffer to Cloudinary (`upload_stream`, `resource_type: 'auto'` so images **and** raw CSV/PDF work) and deletes via `uploader.destroy`.
- `MetPicture` / `NepFile` gained additive optional `url` + `resourceType` fields; the canonical Cloudinary `secure_url` is stored. Legacy disk records still resolve via the `/uploads` fallback.
- **The two upload endpoints are unchanged** (`POST /sessions/:id/files`, `POST /records/:id/pictures`) — same `multipart/form-data` request and same `{ data: { …, url } }` response. Only the returned URL host changes, so **the mobile apps need no change**.

---

## Verification

- `npm install` → adds `cloudinary`; `npm run build` → **exit 0**, TypeScript strict clean.
- `npm run seed` → idempotently creates the admin plus **operator** (`operator@observator.com` / `Operator@1234`) and **viewer** (`viewer@observator.com` / `Viewer@1234`) users and demo audit entries, so the Users page and Audit log have data on staging (Week 16).
- `npm test` → the four new e2e specs pass:
  - **users** — profile shape, 401 without token, name edit, wrong-current-password → 401, password change → new password logs in.
  - **organizations** — list users (admin 200 / viewer 403), invite (admin 201 + inactive user / viewer 403), role change, self-modify → 400.
  - **audit** — admin paginated read, `limit` honoured, viewer → 403.
  - **files** — image upload returns a `res.cloudinary.com` URL (Cloudinary uploader mocked for offline CI), unsupported type rejected.
- Live Cloudinary smoke (needs real creds in `.env`): upload to `POST /v1/records/:id/pictures`, confirm the response `url` loads and the asset appears in the Cloudinary dashboard, then DELETE removes it.

> Note: one pre-existing analytics spec (`MET statistics … percentiles`) is data-freshness dependent — the demo MET measures seeded in Month 3 fall outside the statistics endpoint's default recent window (`count: 0`). It is unrelated to Month 4 work; re-running the MET demo seed against a fresh window resolves it.

---

# APIs for Hassan (admin-panel integration)

All require `Authorization: Bearer <accessToken>` unless marked **public**. Base URL: `https://iot-apps-admin.onrender.com/v1`. Responses use the `{ data }` envelope; `/audit` adds a `pagination` block.

### Profile

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/users/me` | — | `{ data: { id,email,firstName,lastName,role,organizationId,isActive,lastLoginAt,createdAt } }` |
| PATCH | `/users/me` | `{ firstName?, lastName?, currentPassword?, newPassword? }` | updated profile. Password change needs both password fields; revokes other sessions |

### Organization & users (admin only, except `GET /organizations/me`)

| Method | Path | Body / query | Returns / behaviour |
|---|---|---|---|
| GET | `/organizations/me` | — | org document |
| PATCH | `/organizations/me` | `{ name?, contactEmail?, country?, timezone? }` | updated org (admin) |
| GET | `/organizations/me/users` | — | `[{ id,email,firstName,lastName,role,isActive,lastLoginAt,invitedAt }]` (admin) |
| POST | `/organizations/me/users/invite` | `{ email, role, firstName?, lastName? }` | `201` → `{ data:{ user, devToken? } }`; emails invite (admin) |
| POST | `/organizations/accept-invite` | `{ token, password }` | **public** → `{ data:{ user, accessToken, refreshToken } }` (auto-login) |
| PATCH | `/organizations/me/users/:id` | `{ role?, isActive? }` | updated user (admin); blocks self-edit + last-admin removal |

### Audit log (admin only)

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/audit` | `action?, resourceType?, userId?, from?, to?, page?, limit?` | `{ data:[AuditLog], pagination:{ page,limit,total,totalPages } }` |

### Media uploads (unchanged contract — now Cloudinary-backed)

| Method | Path | Notes |
|---|---|---|
| POST | `/sessions/:id/files` | `multipart/form-data` (`file`, `fileType`) → `{ data:{ …, url } }` — `url` is now a Cloudinary CDN link |
| POST | `/records/:id/pictures` | `multipart/form-data` (`file`) → `{ data:{ …, url } }` — Cloudinary CDN link |
| GET/DELETE | (list / delete as before) | list returns Cloudinary `url`; delete removes the Cloudinary asset |

**New environment variables:** `CLOUDINARY_URL` *(or)* `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` — see `backend/.env.example`.

---

## Not in Month 4 (scheduled later, confirmed)

| Endpoint group | Page | Scheduled |
|---|---|---|
| Share links + `/public/:token` | `/public/:shareToken` | **Month 6** |
| Alert rules + Notifications | alert UI / push | **Month 6** |

Weeks 14–15 (branding, theming, responsive layout, cross-browser QA) are Hassan's Angular front-end deliverables and consume the Month 4 APIs above with no further backend work.
