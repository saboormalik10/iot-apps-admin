# Security & permissions audit — customer and super-admin portal

**Date:** 10 September 2026 · **Scope:** roles and permissions, frontend↔backend
wiring, every mounted API endpoint, the realtime gateway, the ingest and
provisioning agents, and UI state edge cases.

**Outcome: 6 findings. 4 fixed, 2 documented and open.** The underlying model is
sound — the issues were gaps in an otherwise well-built design, not a broken
foundation. The two left open are a hardening item (#5) and an operational
practice rather than a code defect (#6).

---

## Summary

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | Any signed-in user could subscribe to **any** device's live data | **High** | Fixed |
| 2 | Privilege escalation by editing a role's permission list | **Medium** | Fixed |
| 3 | Frontend granted admins every permission when the token carried none | **Low** | Fixed |
| 4 | `/roles` and `/platform` had no server-side guard | **Low** | Fixed |
| 5 | The websocket never re-authenticates after connecting | **Low** | Open — documented |
| 6 | The test suite runs against **production**, and the live agent executes its provisioning jobs | **Medium (operational)** | Open — documented |

---

## 1. Cross-tenant live data leak over the websocket — HIGH

**Where:** `backend/src/realtime/events.gateway.ts`

`subscribe:device` joined whatever device room it was asked for, with no
ownership check:

```ts
onSubscribeDevice(@MessageBody() body: { deviceId: string }, @ConnectedSocket() client: Socket) {
  client.join(roomForDevice(body.deviceId));   // ← never looked at client.data.user
  return { subscribed: body.deviceId };
}
```

`handleConnection` verifies the JWT and stores it on the socket, so the caller's
organisation was available — it was simply never consulted.

**Impact.** Any authenticated customer who had a device id could receive another
customer's live readings — `met:latest`, `nep:sample`, wind-rose pushes. **A
device id is not a secret:** it appears in portal URLs and in exported files.

**Why the REST API was not affected.** Every REST query carries
`organizationId` in the filter itself, so a foreign `deviceId` returns nothing —
safe by construction. Socket rooms have no query filter, which is exactly why
this one endpoint was the exception.

**Fix.** Resolve the device's owning organisation and refuse a mismatch, with a
short-lived cache so the handler cannot be turned into a query storm.

**No super-admin exemption, deliberately.** A platform administrator who has
switched carries the *customer's* id in `organizationId`, so the plain
organisation match already gives them exactly the customer they are acting as.
An exemption would have made the socket **more** permissive than the REST API it
mirrors.

**Test:** `backend/test/realtime-tenancy.e2e-spec.ts` — asserts the foreign
device's broadcast **is not received**, not merely that the acknowledgement was
refused. The ack is cosmetic; the room membership is the leak. Verified to fail
without the fix.

> **Requires a backend deploy to take effect in production.**

---

## 2. Privilege escalation by editing a role — MEDIUM

**Where:** `backend/src/roles/roles.service.ts` — `create()` and `update()`

`resolve-role.ts` states the rule plainly — *"you can delegate your authority,
never manufacture it"* — and enforced it on role **assignment** via
`assertCanGrant`. Editing the role itself reached the same place by a different
road and was not checked:

1. hold `role:write`
2. add a permission you lack to a role you already hold
3. refresh the token — you now hold it

No assignment ever happens, so the assignment-time check never runs.

**Why this is Medium and not High.** The seeded Organisation Admin holds
`role:read` and deliberately **not** `role:write`, so an ordinary customer admin
could not reach the code at all. It needs a custom role carrying `role:write`,
which only a platform administrator can grant. Layering also held: the one
genuinely dangerous permission, `station:provision`, is additionally behind
`SuperAdminGuard`, so even full escalation inside a tenant does not cross the
tenant boundary.

**Fix.** `assertCanGrant` is now exported and applied to role writes.

**Additions only, deliberately.** Checking the whole list would break ordinary
edits: a role built by a platform administrator can legitimately carry a grant
the customer admin renaming it does not hold, and the editor resubmits the full
list on every save. Removing a permission is always allowed, and keeping one
already present gains the author nothing — only additions can escalate.

**Test:** `backend/test/role-escalation.e2e-spec.ts` — 5 cases including the
"rename a role carrying an inherited grant" case that a naive fix would break.
Verified to fail without the fix.

---

## 3. Frontend granted admins every permission on an absent grant list — LOW

**Where:** `admin-web/lib/rbac/context.tsx`

```ts
if (!user?.permissions) return can(user?.role, 'manageOrg');   // ← for ANY permission
```

An administrator was treated as holding **all** permissions. That is untrue of
the seeded Organisation Admin, so the Roles page offered Create, Edit and Delete
buttons that the backend then refused.

UI-only — the backend always enforced correctly — but a control that fails on
click is worse than one that is absent.

Written for the M18 W2 rollout, when live tokens genuinely carried no `perms`.
Access tokens last 15 minutes, so no such token has existed for months, and the
backend now always sends an array.

**Fix.** Fails closed: an absent grant list is treated the same as an empty one.

---

## 4. `/roles` and `/platform` had no server-side guard — LOW

**Where:** `admin-web/app/(dash)/roles/page.tsx`, `.../platform/page.tsx`

`/org` and `/users` redirect a non-admin. These two did not — the nav hid them
and the API refused, but a typed URL still rendered the page shell and then an
error.

No data leaked. Fixed for consistency, so "who can open this page" is answered
in one place rather than three.

---

## 5. The websocket never re-authenticates — LOW, still open

A socket authenticates once at connect and is never re-checked, so it outlives
access-token expiry and revocation.

Finding 1 makes this harmless for device rooms, and the customer switch now does
a full page load, which tears the socket down. The residual case is a long-lived
session whose grants are revoked mid-connection.

**Recommended:** re-authenticate on token refresh, or revalidate periodically
server-side. Deliberately out of scope here.

---

## 6. The test suite runs against production — MEDIUM (operational)

**Not a code vulnerability. A real one all the same.**

`MONGO_URI` points the backend test suite at the **live Atlas cluster**, and the
provisioning queue is global: `claimNext` takes the oldest queued job *across all
customers*. The live provisioning agent polls that same queue.

So when `provision.e2e-spec.ts` queues a job, **the production agent can claim and
execute it** — creating real Unix and SFTP accounts on the production box.

This is not hypothetical. The spec's own cleanup carries the scar:

> *"`claimNext` takes the oldest QUEUED job across all customers, each run left a
> job that the live agent then executed — 25 stray `wx-*` Unix accounts on the
> production box, and 'succeeded' ingest deployments for tenants that do not
> exist."*

A further **42 leftover test accounts** (`wx-scoped-*`, `wx-second-*`,
`wx-retry-*`) are still on the Lightsail box from earlier runs.

It also produces a confusing symptom: `provision.e2e-spec.ts` fails
intermittently in a full run — the agent won the race for its job — while passing
97/97 in isolation. That looks like a flaky test and is actually production
interference.

**Recommended, in order:**

1. Point the test suite at a **separate database**. This is the real fix;
   everything else is mitigation.
2. Until then, stop the provisioning agent before running the suite, or scope
   `claimNext` so an agent only claims jobs for organisations it serves.
3. Clean up the 42 stray accounts on the Lightsail box.

> Related precedent, same root cause: an alert test once emitted synthetic events
> at a real customer device and fired their real rule, creating 4 real
> notifications. Tests and production share a database.

---

## Verified safe — checked, no action needed

Recorded so this ground is not re-audited from scratch.

| Area | Finding |
| --- | --- |
| **REST cross-tenant (IDOR)** | Every query filters on `organizationId`; a foreign id returns nothing |
| **Role assignment escalation** | `assertCanGrant` correctly refuses grants the assigner lacks |
| **Cross-org role assignment** | A `roleId` is resolved against the caller's own org; another tenant's role reads as **404, not 403**, so it cannot be used to probe |
| **`GET /organizations`** | Re-reads `isSuperAdmin` from the database, not the token |
| **Share links** | 192-bit tokens, expiring, throttled 30/min, and the resource's ownership is verified before a link is created |
| **`share:revokeAny`** | Correctly gates revoking someone else's link |
| **Service credentials** | SHA-256 with `timingSafeEqual`; attached to `request.serviceCredential`, never `request.user`, so a machine token cannot satisfy a user permission |
| **Notifications** | Scoped by organisation **and** user |
| **Dashboard layouts** | Scoped by organisation **and** user |
| **User updates** | Self-modification blocked, last-admin guard, org-scoped |
| **Frontend↔backend capability matrix** | Aligned. Admin sees the Roles page (holds `role:read`) but not its write controls (lacks `role:write`) — correct in both layers |
| **`ws-ticket`** | 60-second expiry, authenticated, throttled |
| **Destructive permissions** | `role:delete` and `station:provision` are re-read from the database rather than trusted from a 15-minute token |
| **Super-admin scoping** | Switching **re-points** `organizationId` rather than bypassing it, so a platform administrator can never see two customers at once |

---

## Dead code — REMOVED 10 September 2026

`sessions`, `sync` and `export` have been deleted.

**Correction to an earlier draft of this document:** it stated that all three
were unmounted. That was wrong — **`ExportModule` was mounted** in
`app.module.ts`. Its controller had no live routes and its service had no
consumers, so it was still dead, but it was wired in rather than excluded.

None was reachable, so none was an exploitable finding. They were removed
because they were a trap: `sessions.controller.ts` carried **no permission
checks at all** — `DELETE /sessions/:id` would have been open to any
authenticated user, a viewer included — so re-mounting it without re-reading its
guards was a live hazard. It predates the permission system and never adopted it.

`src/app.module.ts` carries a note recording this. The code is in git history if
NEP is revived; **the guards must be written before it is re-mounted.**

### Fallout, and one real bug it exposed

Removing the dead modules left tests covering routes that no longer exist. In
triaging those, two of the long-standing failures turned out not to be dead at
all:

- **`GET /analytics/met/export-bulk` always answered 400 for "All time"** — a
  genuine bug in a live endpoint. `parseWindow` documents a missing `from` as
  "no lower bound", which the Scope Bar's All-time preset sends; the handler then
  measured that ~56-year span against a 90-day cap and refused it. Two comments
  in one file contradicted each other. **Fixed:** an omitted `from` is clamped to
  the cap; an explicitly oversized window is still refused, because that caller
  asked for something specific and should be told.
- **The qnh / qfe / gps_altitude statistics tests were wrong, not the code.**
  The endpoint correctly answers `200 {count: 0}` for a sensor this station does
  not report. The tests demanded a `median` that cannot exist without rows. They
  now assert what their own comment says they are for — that the sensor name is
  wired through and does not answer 400 "Unknown sensor" — and check percentiles
  only when rows exist.

Tests for routes that are commented out rather than deleted are now `it.skip`
with the reason, so they return with their endpoints. A permanently red suite
hides real regressions.

> One of those skipped tests had been **passing for the wrong reason**: it
> asserted a 4xx for an unsupported file type, and a 404 from a route that no
> longer exists is also a 4xx. It was never exercising the type check.

**Backend failures went from 23 to 0.**

---

## Verification

Every fix here has a test that was **verified to fail without it** — a test that
cannot fail proves nothing. Each was confirmed by reverting the fix, watching the
test go red, and restoring it.

- **Backend:** 693 passing, 13 skipped, **1 failing** — and that one is finding
  #6, not a defect: `provision.e2e-spec.ts` lost the race for its own job to the
  live agent. It passes 97/97 in isolation. Failures went from 23 to that one:
  the dead tests removed or skipped, one real bug fixed (`export-bulk`), and
  three over-strict assertions corrected.
- **Frontend:** 369 tests pass; typecheck and lint clean.
- **Run the backend suite serially** (`--runInBand`). In parallel it starves the
  CPU and reports spurious failures — the giveaway is that the failing suites
  change between runs and every one passes in isolation.
