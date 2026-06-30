# Mobile App API Usage — Month 4

Month 4 is the **admin dashboard** account layer (profile, organization & user management, audit log — consumed by the Angular panel, built by Hassan) plus an internal **storage migration**. There are **no new mobile-facing endpoints**.

---

## Nothing new to integrate on mobile

All endpoints added this month are **admin-panel only** and require an interactive (JWT) admin/operator/viewer session:

- `GET/PATCH /v1/users/me` — profile
- `GET/PATCH /v1/organizations/me`, `GET /v1/organizations/me/users`, `POST /v1/organizations/me/users/invite`, `PATCH /v1/organizations/me/users/:id`, `POST /v1/organizations/accept-invite`
- `GET /v1/audit`

The MET-LINK and NEP-LINK apps do **not** call any of these.

---

## Media uploads — same contract, no app change required

The existing upload endpoints the apps already use are **unchanged**:

- `POST /v1/sessions/:id/files` (NEP photos / map screenshots / thumbnails)
- `POST /v1/records/:id/pictures` (MET record photos)

They are still `multipart/form-data` with the same fields and still return `{ "data": { ..., "url": "..." } }`. The only difference is that `url` is now a **Cloudinary CDN link** instead of a `/uploads/...` path — the apps keep posting exactly as before and can keep displaying `data.url` as-is.

---

## Everything else is unchanged from Months 1–3

The mobile **upload / sync** APIs (`POST /v1/sync/upload`, `POST /v1/sessions/:id/samples`, `POST /v1/records/:id/measures`, `PATCH /v1/sync/device-status`, `PATCH /v1/devices/:id/settings`, etc.) are unchanged — refer to:
- [`deliveryreport-month1/MOBILE_API_USAGE.md`](../deliveryreport-month1/MOBILE_API_USAGE.md)
- [`deliveryreport-month2/MOBILE_API_USAGE-Month2.md`](../deliveryreport-month2/MOBILE_API_USAGE-Month2.md)
- [`deliveryreport-month3/MOBILE_API_USAGE-Month3.md`](../deliveryreport-month3/MOBILE_API_USAGE-Month3.md)
