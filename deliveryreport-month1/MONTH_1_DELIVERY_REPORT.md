# Month 1 Delivery Report — Observator NepLink Backend API
**Project:** Observator NepLink — Cloud Backend & API  
**Delivery Period:** Weeks 1–4 (May 12 – Jun 6, 2025)  
**Prepared By:** Saboor Malik — Backend Engineer  
**Recipient:** Dana Galbraith — General Manager, Observator Instruments  
**Status:** ✅ DELIVERED — Live on cloud

---

## Summary

All Month 1 deliverables have been completed and the backend API is **live on a public HTTPS URL**. The mobile apps (MET-LINK and NEP-LINK) can now sync real data to the cloud. The Swagger documentation portal is live and accessible to the frontend team to begin building the Angular admin dashboard.

| Milestone | Status |
|---|---|
| Cloud server live with HTTPS | ✅ Done |
| All MongoDB schemas defined | ✅ Done |
| Authentication API working | ✅ Done |
| Device registry API working | ✅ Done |
| NEP-LINK sessions & samples API working | ✅ Done |
| MET-LINK records & measures API working | ✅ Done |
| File upload API working | ✅ Done |
| Sync API working | ✅ Done |
| Forgot / Reset password emails working | ✅ Done |
| Swagger documentation live | ✅ Done |
| Seed data (demo org + devices) | ✅ Done |

---

## Live URLs

| Resource | URL |
|---|---|
| API Base | `https://iot-apps-admin.onrender.com/v1` |
| Swagger Documentation | `https://iot-apps-admin.onrender.com/api/` |
| Health Check | `https://iot-apps-admin.onrender.com/health` |

---

## What Was Built — Week by Week

### Week 1 — Project Foundation + Authentication

**Goal:** Get a working, deployable project with authentication.

**Delivered:**

#### Project Scaffold
- TypeScript + Node.js 20 + Express 4 backend project
- ESLint, Prettier, `.env` configuration
- Multi-stage Dockerfile for lean production images
- `README.md` with local dev setup instructions

#### MongoDB Schemas (22 collections defined)
All data models from the project specification have been defined as Mongoose schemas:

| Schema | Purpose |
|---|---|
| `Organization` | Top-level tenant — all data scoped to org |
| `User` | Admin/operator/viewer accounts |
| `Device` | MET-LINK and NEP-LINK device registry |
| `MetRecord` | MET-LINK session records (header metadata) |
| `MetMeasure` | Individual MET-LINK sensor readings (1/sec) |
| `MetMeasureDownsampled` | Aggregated MET-LINK data for fast dashboard queries |
| `MetPicture` | Photos attached to MET-LINK records |
| `MetDailySummary` | Daily aggregated MET-LINK statistics |
| `NepSession` | NEP-LINK measurement sessions |
| `NepSample` | Individual NEP-LINK turbidity/temperature samples |
| `NepSampleDownsampled` | Aggregated NEP-LINK data for fast chart rendering |
| `NepFile` | Files (photos, maps) attached to NEP-LINK sessions |
| `NepDailySummary` | Daily aggregated NEP-LINK statistics |
| `KnownDevice` | BLE device pairing whitelist |
| `RefreshToken` | JWT refresh token store (hashed, expiry-indexed) |
| `PasswordResetToken` | One-time tokens for forgot-password flow |
| `AuditLog` | Destructive action audit trail |
| `DeviceSettings` | Per-device configuration (QNH/QFE heights, wind units, etc.) |
| `DashboardLayout` | User-saved dashboard widget arrangements |
| `NotificationToken` | Push notification device tokens |
| `ShareToken` | Public share links for NEP-LINK sessions |
| `AlertRule` | Configurable sensor threshold alerts |
| `FirmwareHistory` | Device firmware version history |

#### Seed Script
Running `npm run seed` populates:
- 1 demo Organization
- 1 admin User (email + password)
- 1 MET-LINK Device
- 1 NEP-LINK Device

#### Authentication API (`/v1/auth`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/auth/register` | Create a new user account |
| `POST` | `/v1/auth/login` | Login — returns access token + sets refresh token |
| `POST` | `/v1/auth/refresh` | Exchange refresh token for a new access token |
| `POST` | `/v1/auth/logout` | Invalidate refresh token |
| `POST` | `/v1/auth/forgot-password` | Send password reset email |
| `POST` | `/v1/auth/reset-password` | Reset password using emailed token |

**Security implemented:**
- Passwords hashed with bcrypt (cost factor 12)
- Access tokens: JWT, 15-minute expiry (HS256)
- Refresh tokens: 30-day expiry, SHA-256 hashed before storage
- Rate limiting on `/auth/login`: max 10 requests/minute per IP (prevents brute-force)
- Password reset emails sent via Gmail SMTP (Nodemailer)

---

### Week 2 — Device Registry + NEP-LINK Sessions API

**Goal:** Mobile apps can register devices and upload NEP-LINK session data.

**Delivered:**

#### Device Registry API (`/v1/devices`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/devices` | List all devices for the authenticated org |
| `POST` | `/v1/devices` | Register a new device (MET-LINK or NEP-LINK) |
| `GET` | `/v1/devices/:id` | Get device details |
| `PATCH` | `/v1/devices/:id` | Update device name, config, location |
| `DELETE` | `/v1/devices/:id` | Soft-delete a device |
| `GET` | `/v1/devices/admin` | Admin-only: list all devices across all orgs |

- Device type validated: must be `MET-LINK` or `NEP-LINK`
- All data scoped to `organizationId` — cross-org access blocked
- Soft delete: records preserved, device hidden from lists

#### NEP-LINK Sessions API (`/v1/sessions`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/sessions` | List sessions (filterable by device, date range) |
| `POST` | `/v1/sessions` | Create a new NEP-LINK session |
| `GET` | `/v1/sessions/:id` | Get session details + computed stats |
| `PATCH` | `/v1/sessions/:id` | Update session metadata (comments, probe range) |
| `DELETE` | `/v1/sessions/:id` | Soft-delete a session |
| `POST` | `/v1/sessions/:id/samples` | Bulk insert samples (up to 7,200 in one request) |
| `GET` | `/v1/sessions/:id/samples` | Get samples (paginated; `?downsample=true` for charts) |
| `GET` | `/v1/sessions/:id/stats` | Aggregated stats: min/max/avg turbidity, sample count |
| `GET` | `/v1/sessions/:id/export` | Download session data as CSV |

**Key technical points:**
- Bulk sample insert uses a single `insertMany()` call — never loops per row
- `?downsample=true` returns 1-minute averages when session has >500 points (fast chart rendering)
- `POST /sessions` auto-computes `turbidityAvg`, `turbidityMin`, `turbidityMax`, `sampleCount`, `probeRange`

---

### Week 3 — MET-LINK Records API + Deployed to Cloud

**Goal:** MET-LINK data upload working. Live server available to frontend team.

**Delivered:**

#### MET-LINK Records API (`/v1/records`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/records` | List MET-LINK records (filterable by device, date range) |
| `POST` | `/v1/records` | Create a new record |
| `GET` | `/v1/records/:id` | Get record details |
| `PATCH` | `/v1/records/:id` | Update record metadata |
| `DELETE` | `/v1/records/:id` | Soft-delete a record |
| `POST` | `/v1/records/:id/measures` | Bulk insert measures (parsed from CSV dataSentence) |
| `GET` | `/v1/records/:id/measures` | Get measures (paginated; `?downsample=true` for charts) |
| `GET` | `/v1/records/:id/stats` | Aggregated stats: wind min/max/avg, temp, pressure, etc. |
| `GET` | `/v1/records/:id/export` | Download record data as CSV |

#### MET-LINK CSV Measure Parser
The `measure-parser.util.ts` utility parses the raw `dataSentence` CSV string format that the MET-LINK mobile app produces. Each row is a repeating `Value,Unit,Description` triplet pattern. The parser:
- Detects and skips header rows
- Converts all values to base units (m/s for wind, hPa for pressure, °C for temperature, m for altitude)
- Extracts all named fields: `windSpeedMs`, `windDirDeg`, `tempC`, `humidityPct`, `pressureHpa`, `solarWm2`, `precipMm`, `dewPointC`, `voltageV`, and GPS coordinates
- Stores extracted fields as indexed numeric columns for fast dashboard aggregation

#### Cloud Deployment
- Platform: **Render** (Docker runtime, HTTPS automatic)
- Region: Oregon (US West)
- Live API: `https://iot-apps-admin.onrender.com`
- Database: MongoDB Atlas (cloud, managed, with connection string in environment variables)
- Auto-deploy: every push to `main` branch triggers a new deployment

#### Swagger Documentation
- Live at: `https://iot-apps-admin.onrender.com/api/`
- All **26 endpoints** documented with request/response schemas
- Swagger spec pre-generated at build time for reliable serving in production
- Server URL dynamically injects the actual host — no hardcoded localhost

---

### Week 4 — File Uploads + Sync API + Password Reset + Handover

**Goal:** Complete all Month 1 deliverables. Mobile apps can sync offline data.

**Delivered:**

#### File Upload API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/sessions/:id/files` | Upload photo, map screenshot, or thumbnail to a NEP session |
| `GET` | `/v1/sessions/:id/files` | List all files for a session (with download URLs) |
| `DELETE` | `/v1/sessions/:id/files/:fileId` | Delete a session file |
| `POST` | `/v1/records/:id/pictures` | Upload a photo to a MET-LINK record |
| `GET` | `/v1/records/:id/pictures` | List all pictures for a record (with download URLs) |
| `DELETE` | `/v1/records/:id/pictures/:pictureId` | Delete a record picture |

- MIME type validation enforced (images only)
- 10 MB max file size enforced
- Files stored on server disk (`/uploads/`) — Cloudflare R2 cloud storage is planned for Month 2

#### Sync API (`/v1/sync`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/sync/status` | Get last-sync timestamps per device |
| `POST` | `/v1/sync/upload` | Upload a NEP session or MET record from mobile app |
| `GET` | `/v1/sync/download` | Pull any server-side updates down to the mobile app |

- `POST /sync/upload` is **fully idempotent**: uploading the same session twice produces no duplicates (upsert by UUID)
- Handles both NEP-LINK session payloads and MET-LINK record payloads in a single endpoint
- Designed for offline-first mobile workflow: apps can queue data and sync when connectivity is available

#### Password Reset (via Email)
- `POST /v1/auth/forgot-password` — sends a one-time reset link to the user's email
- `POST /v1/auth/reset-password` — validates token (10-minute expiry) and sets new password
- Emails sent via Gmail SMTP using Nodemailer

---

## Complete API Endpoint Summary (26 endpoints)

| # | Method | Path | Module |
|---|---|---|---|
| 1 | POST | `/v1/auth/register` | Auth |
| 2 | POST | `/v1/auth/login` | Auth |
| 3 | POST | `/v1/auth/refresh` | Auth |
| 4 | POST | `/v1/auth/logout` | Auth |
| 5 | POST | `/v1/auth/forgot-password` | Auth |
| 6 | POST | `/v1/auth/reset-password` | Auth |
| 7 | GET | `/v1/devices` | Devices |
| 8 | POST | `/v1/devices` | Devices |
| 9 | GET | `/v1/devices/:id` | Devices |
| 10 | PATCH | `/v1/devices/:id` | Devices |
| 11 | DELETE | `/v1/devices/:id` | Devices |
| 12 | GET | `/v1/devices/admin` | Devices |
| 13 | GET | `/v1/sessions` | Sessions |
| 14 | POST | `/v1/sessions` | Sessions |
| 15 | GET | `/v1/sessions/:id` | Sessions |
| 16 | PATCH | `/v1/sessions/:id` | Sessions |
| 17 | DELETE | `/v1/sessions/:id` | Sessions |
| 18 | POST | `/v1/sessions/:id/samples` | Sessions |
| 19 | GET | `/v1/sessions/:id/samples` | Sessions |
| 20 | GET | `/v1/sessions/:id/stats` | Sessions |
| 21 | GET | `/v1/sessions/:id/export` | Sessions |
| 22 | GET | `/v1/records` | Records |
| 23 | POST | `/v1/records` | Records |
| 24 | GET | `/v1/records/:id` | Records |
| 25 | PATCH | `/v1/records/:id` | Records |
| 26 | DELETE | `/v1/records/:id` | Records |
| 27 | POST | `/v1/records/:id/measures` | Records |
| 28 | GET | `/v1/records/:id/measures` | Records |
| 29 | GET | `/v1/records/:id/stats` | Records |
| 30 | GET | `/v1/records/:id/export` | Records |
| 31 | POST | `/v1/sessions/:id/files` | Files |
| 32 | GET | `/v1/sessions/:id/files` | Files |
| 33 | DELETE | `/v1/sessions/:id/files/:fileId` | Files |
| 34 | POST | `/v1/records/:id/pictures` | Files |
| 35 | GET | `/v1/records/:id/pictures` | Files |
| 36 | DELETE | `/v1/records/:id/pictures/:pictureId` | Files |
| 37 | GET | `/v1/sync/status` | Sync |
| 38 | POST | `/v1/sync/upload` | Sync |
| 39 | GET | `/v1/sync/download` | Sync |

> Full interactive documentation (try-it-out): `https://iot-apps-admin.onrender.com/api/`

---

## Security Measures Implemented

| Area | Implementation |
|---|---|
| Authentication | JWT access tokens (15 min) + refresh tokens (30 days) |
| Password storage | bcrypt, cost factor 12 |
| Refresh token storage | SHA-256 hashed in database (raw token never stored) |
| Brute-force protection | Rate limiting on auth endpoints (10 req/min per IP) |
| Data isolation | All queries scoped to `organizationId` — cross-org access impossible |
| API security headers | Helmet.js (HSTS, X-Frame-Options, CSP, etc.) |
| Input validation | Schema-level validation on all endpoints |
| Soft deletes | Data never permanently deleted — audit trail preserved |

---

## Deferred to Month 2

The following items from the Month 1 scope were adjusted:

| Item | Original Plan | Actual | Reason / Plan |
|---|---|---|---|
| Hosting platform | Railway | **Render** | Render offers equivalent free-tier Docker hosting with simpler config; functionally identical |
| File storage | Cloudflare R2 (cloud) | **Local disk `/uploads/`** | R2 integration deferred to Month 2 — local storage works for Month 1 testing; no data loss risk on Render persistent disk |
| Dashboard aggregation endpoints | Not Month 1 | Deferred to Month 2 | Dashboard endpoints (`/dashboard/met/latest`, `/dashboard/nep/trend`, etc.) are Month 2 Week 5–6 work as planned |

---

## What's Next — Month 2 Preview

| Week | Theme | Key Deliverables |
|---|---|---|
| Week 5 | MET-LINK dashboard endpoints | `GET /dashboard/met/latest`, `GET /dashboard/met/windrose` — Hassan can render the 8-tile live dashboard |
| Week 6 | NEP-LINK dashboard endpoints | `GET /dashboard/nep/trend`, `GET /dashboard/nep/map` — turbidity charts and GPS map data |
| Week 7 | Angular dashboard (Hassan) | Login, device overview, MET-LINK live 8-tile grid |
| Week 8 | Angular dashboard (Hassan) | Wind rose, NEP-LINK session charts — **Month 2 demo to Dana** |

---

## Technical Stack Reference

| Component | Technology |
|---|---|
| Runtime | Node.js 20 (LTS) |
| Language | TypeScript 5 |
| Framework | Express 4 |
| Database | MongoDB Atlas (managed cloud) |
| ODM | Mongoose 8 |
| Auth | JWT (jsonwebtoken) + bcrypt |
| File uploads | Multer (multipart/form-data) |
| Email | Nodemailer + Gmail SMTP |
| Documentation | Swagger UI (OpenAPI 3.0) |
| Containerisation | Docker (multi-stage build) |
| Hosting | Render (free tier, Docker runtime) |
| Source control | GitHub (`saboormalik10/iot-apps-admin`) |

---

*Document generated: June 2025*  
*Contact: Saboor Malik — saboordev8@gmail.com*
