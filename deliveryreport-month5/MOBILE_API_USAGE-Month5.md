# Mobile App API Usage — Month 5

Month 5 is **production hardening + an API-documentation overhaul**. There are
**no new mobile-facing endpoints** — the MET-LINK and NEP-LINK apps keep calling
exactly the same APIs as Months 1–4.

---

## Nothing new to integrate on mobile

The mobile upload/sync surface is unchanged:
- `POST /v1/devices`, `PATCH /v1/devices/:id/settings`
- `POST /v1/sessions`, `POST /v1/sessions/:id/samples`, `POST /v1/sessions/:id/files`
- `POST /v1/records`, `POST /v1/records/:id/measures`, `POST /v1/records/:id/pictures`
- `POST /v1/sync/upload`, `GET /v1/sync/status`, `GET /v1/sync/download`, `PATCH /v1/sync/device-status`

Refer to the earlier guides for payloads:
- [`deliveryreport-month1/MOBILE_API_USAGE.md`](../deliveryreport-month1/MOBILE_API_USAGE.md)
- [`deliveryreport-month3/MOBILE_API_USAGE-Month3.md`](../deliveryreport-month3/MOBILE_API_USAGE-Month3.md)

---

## One behaviour change: stricter file-upload validation

`POST /v1/sessions/:id/files` and `POST /v1/records/:id/pictures` now validate the
uploaded file by its **actual content (magic bytes)**, not just the declared
`Content-Type`. Practical impact for the apps:

- Keep sending **real** images (JPEG / PNG / WebP / GIF), CSV, or PDF, ≤ 10 MB —
  these continue to work exactly as before.
- A file whose bytes don't match an allowed type (e.g. a renamed/corrupt file) is
  now rejected with **HTTP 415**:
  ```json
  { "error": { "code": "INVALID_MIME", "message": "Unsupported file type: …" } }
  ```
- Handle 415 the same way you handle 400 on the upload screen (show "unsupported
  file" and let the user pick another). No request-shape change is required.

CSV uploads (which have no binary signature) are still accepted — just send them
with `Content-Type: text/csv`.

---

## Everything else is unchanged

Auth is still the static key `Authorization: Bearer obs_mob_…`. The Month 5 **CORS
lock-down** only affects browser (dashboard) origins — the API-key mobile clients
send the key over the `Authorization` header (not cookies) and are unaffected.

> **New: interactive API docs.** The Swagger page at `/api` now has a **top-right
> dropdown** — pick **📱 NEP-LINK App** or **📱 MET-LINK App** to see only your
> app's endpoints, each with a per-app request example and example responses. The
> docs are password-protected; ask the backend team for the `SWAGGER_USER` /
> `SWAGGER_PASSWORD` credentials.
