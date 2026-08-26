# Platform security review — M24 W1

Scope: the backend API and its authentication, authorisation, input handling and
dependencies. Provisioning has its own review in `provision-agent/SECURITY.md`
(M21 W4) and is not repeated here.

Every finding below was **reproduced against a running server** before it was
fixed, and the fix verified the same way. Where a result is quoted, it is
measured output, not an expectation.

---

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **Critical** | JWT signing secrets fell back to literals committed in this repository | Fixed |
| 2 | **High** | `POST /auth/login` had no rate limiting at all | Fixed |
| 3 | **High** | 11 request bodies were bound to types that erase at runtime, so nothing validated them | Fixed |
| 4 | Medium | No password policy on registration or password reset | Fixed |
| 5 | Medium | CORS fell back to a wildcard when `CORS_ORIGIN` was unset | Fixed |
| 6 | Medium | `trust proxy` unset, making per-IP limits meaningless behind a load balancer | Fixed |
| 7 | Medium | bcrypt cost 10 on the customer-administrator path, 12 everywhere else | Fixed |
| 8 | Medium | Malformed input returned 500s that leaked internal messages | Fixed |
| 9 | Low | `multer` denial-of-service advisories | Accepted, mitigated |

### 1. Forgeable tokens when a variable is missing — Critical

`src/utils/jwt.ts` read:

```ts
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'fallback_access_secret';
```

Those strings are in this repository. A deploy that omitted the variable would
sign real tokens with a publicly known key, and anyone able to read the source
could mint one — including `sup: true`, for any organisation. Nothing would look
wrong: logins would succeed and tokens would verify.

**Fixed.** Production refuses to start when a secret is missing, shorter than 32
characters, or still one of the known placeholders — including the
`CHANGE_ME_…` values in `.env.example`, which are equally public. Outside
production a random per-process secret is generated, so tokens stop surviving a
restart and the missing variable becomes obvious rather than habitual.

Verified: `NODE_ENV=production` with the variable unset, and again with the
placeholder value, both refuse to start.

### 2. Unlimited password guessing — High

`POST /auth/login` carried `@Throttle({ limit: 10 })` and advertised
*"Rate-limited to 10 requests/min"* in Swagger. Neither was true.
`ThrottlerGuard` is **not** registered globally in this app; every other
controller that throttles applies it explicitly and says so in a comment. Auth
did not, so `@Throttle` was inert metadata configuring a guard that never ran.

Measured, before:

```
30 failed logins → 30 × 401, 0 × 429
```

Control, on `/v1/public/:token`, which does apply the guard: `30 × 404` then
`10 × 429` — so the throttler worked; it was simply not attached.

**Fixed.** The guard is applied to the controller, and explicit limits are set
per route rather than inherited: 5/min on `register` and `forgot-password`
(account-creation spam, mail bombing, and minting fresh reset codes), 10/min on
`login`, `verify-reset-code` and `reset-password`, 20/min on `refresh` (several
tabs can refresh at once), 30/min on `ws-ticket` (reconnect backoff is
legitimate traffic).

Measured, after: `10 × 401` then `20 × 429`, and a legitimate login still
returns 200 once the window clears.

Note: blocked requests renew the window, so continuous hammering stays blocked.
A user who keeps retrying must pause for a full minute.

`throttle-coverage.e2e-spec.ts` fails the build if any route carries `@Throttle`
without a guard in scope. Rate limiting is skipped under `NODE_ENV=test` — the
suite makes ~19 login calls and would otherwise fail unrelated tests with 429s.

**The Playwright suite needs the same.** Its backend is a built server, so
`NODE_ENV` is unset unless you set it, and `skipIf` does not fire. Every journey
signs in, so the 10/min budget is exhausted after ten tests and the rest fail on
`toHaveURL` — measured as 36 failed / 4 passed, which looks like a broken app
rather than a rate limit. Start the e2e backend as:

```bash
NODE_ENV=test PORT=3100 node dist/main.js
```

The better long-term fix is a Playwright `storageState` so the suite signs in
once instead of per test — faster, and it would not need the carve-out at all.

### 3. Request bodies that nothing validated — High

`ValidationPipe` validates against a parameter's runtime metatype. TypeScript
interfaces, type aliases and inline object literals all erase at compile time, so
a body bound to one has **no metatype and is passed through unvalidated** — while
reading, in review and in Swagger, exactly like a validated endpoint.

Eleven live routes were affected, including `login`, `register`,
`forgot-password`, `verify-reset-code`, `reset-password`, `refresh`, `logout`,
both import routes and two record routes. The DTO classes mostly already existed;
they were declared `@ApiProperty`-only, with file headers stating the intent:
*"referenced via @ApiBody for OpenAPI only — request validation is unchanged."*

Measured: `POST /auth/login` with `{"email":{"$ne":null}}` returned

```
500  {"error":{"code":"INTERNAL_SERVER_ERROR",
      "message":"input.email.toLowerCase is not a function"}}
```

The Mongo operator never reached a query — but only because of an incidental
`.toLowerCase()`, not because anything checked it. Hashed lookups (`refresh`,
`verify-reset-code`) were protected the same accidental way.

This is the third defect of this exact shape in the codebase: M19's
`SwitchOrgDto` had no validators, so `whitelist: true` stripped every field and
`POST /auth/switch-org` returned 200 and silently did nothing.

**Fixed.** Every `@Body()` now binds a class carrying real class-validator
decorators. `dto-binding.e2e-spec.ts` fails the build otherwise, with one
documented exception: `PATCH /devices/:id/settings` takes an open key/value bag,
but the service copies only keys in the `SETTINGS_FIELDS` allowlist, so unknown
keys are dropped rather than written — that route is not mass-assignable.

### 4. No password policy on two of three paths — Medium

`users.service` required 8 characters and `CreateCustomerDto` required 8, but
`auth.service.resetPassword` hashed whatever it was given and registration had no
check at all. `ResetPasswordDto` even documented *"min 8 chars"* in Swagger.

**Fixed**, at 8 characters to match the existing rule. Verified live: a 3-character
reset and a 4-character registration are both refused with 400.

Deliberately **not** applied to `login` — rejecting a short password before
checking it advertises the policy and would lock out any account whose password
predates the rule.

### 5–8. Configuration and consistency — Medium

- **CORS** fell back to `origin: '*'` when `CORS_ORIGIN` was unset. A deploy that
  forgot the variable served every origin, and looked fine. Production now
  refuses to start instead. (The wildcard was at least paired with
  `credentials: false`, so it was not a credentialed cross-origin read.)
- **`trust proxy`** was never set, so behind a load balancer `req.ip` is the
  balancer for everyone and per-IP limits bucket the whole customer base
  together — one noisy client 429s all of them. Now set from `TRUST_PROXY` as a
  **hop count**, deliberately not `true`: `trust proxy: true` believes the
  client-supplied left-most `X-Forwarded-For`, letting an attacker spoof a fresh
  IP per request and skip the limiter entirely.
- **bcrypt cost** was 10 in `platform.service` — the route that creates each new
  customer's administrator — against 12 everywhere else, so the most privileged
  account of every new customer got the weakest hash in the system. Two seeding
  scripts passed a bare `10`. All now import one constant from
  `src/common/bcrypt.ts`.
- **500s on malformed input** leaked internal messages to unauthenticated
  callers. Closed by finding 3; those requests now return a 400 envelope.

### 9. multer denial-of-service — Low, accepted

Five DoS advisories against `multer`. The fix is `@nestjs/platform-express@11`,
i.e. a **NestJS 10 → 11 major upgrade** — a decision for the client rather than a
change to make inside a review week.

Mitigations already in place: both upload routes require authentication, set
`limits.fileSize` (20 MB import, `MAX_FILE_SIZE_BYTES` for media), accept a
single file plus one `deviceId` field, and validate file type by **magic bytes**
rather than the declared mimetype.

Dependency advisories were reduced from 31 to 25 (high: 8 → 4) by applying
non-breaking updates and moving `nodemailer` 8.0.11 → 9.0.5. That nodemailer
advisory concerns the message-level `raw` option, which this codebase never
uses — only `createTransport` and `sendMail` with structured fields.

---

## Checked and found sound

- No `$where`, `eval` or `mapReduce` anywhere.
- Refresh tokens, reset codes and reset tokens are **hashed at rest**; the raw
  value is never stored or logged.
- Reset codes are `crypto.randomInt` (CSPRNG), 6 digits, 15-minute expiry, with a
  5-attempt ceiling that **is persisted** (`record.save()` on the failure path) —
  the ceiling is real, not decorative.
- Secrets appear in `console.log` only in operator CLI scripts (seeding,
  provisioning, password reset), which print a credential once to a terminal by
  design. No secret is logged on any request path. These scripts must not run in
  CI where output is retained.
- Tenancy re-points `organizationId` rather than bypassing the filter, and
  super-admin status is re-read from the database rather than trusted from the
  token. Covered by `tenant-isolation.e2e-spec.ts`.
- `PATCH /devices/:id/settings` is allowlisted, so it is not mass-assignable.
- helmet is applied with an explicit CSP and HSTS; the Swagger CDN exception is
  scoped to `/api` only.

## Not a security finding, but material for handover

The e2e suite carries **26 pre-existing failures across 4 suites**, none caused by
this review. They are routes commented out in M15 (NEP, mobile sync, invitations,
session files) still asserted by tests written before the shutdown, plus three
MET statistics tests asserting on demo data that M13 purged. `share.e2e-spec.ts`
had been failing the same way and was repaired in M23 W4.

The consequence is that the suite does not currently fail loudly on a real
regression, because it is already red. This should be resolved before handover.

## Re-running this review

```bash
npm audit --omit=dev                                  # dependency advisories
npx jest --config test/jest-e2e.json \
  test/throttle-coverage.e2e-spec.ts \
  test/dto-binding.e2e-spec.ts \
  test/index-hygiene.e2e-spec.ts \
  test/tenant-isolation.e2e-spec.ts                   # the policy guards

# Rate limiting is skipped under NODE_ENV=test, so verify it against a server:
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST localhost:3100/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@observator.com","password":"wrong"}'; done | sort | uniq -c
# expect: 10 × 401, 20 × 429
```
