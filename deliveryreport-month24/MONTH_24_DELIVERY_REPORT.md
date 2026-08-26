# Month 24 — Delivery Report

**Project:** Observator MET-LINK weather-station platform
**Month:** 24 (Weeks 93–96) — final month of the Months 13–24 programme
**Theme:** Hardening & handover — security review, accessibility, documentation, handover
**Prepared by:** Saboor Malik

---

## Summary

Month 24 hardens and hands over. It ships a **platform-wide security review** that
found and fixed one critical and two high-severity defects, an **accessibility
pass that took every measured route to a perfect score**, a **65% reduction in
the dashboard's layout shift**, and the **documentation the project did not have**
— including an operations guide for the one component that had none at all.

Three of the four weeks found real defects rather than confirming existing work.
That is the honest summary: this month was not a formality.

### Status

| Deliverable | Status |
|---|:--:|
| Security review — findings, fixes, re-run procedure | ✅ |
| Accessibility: 1.00 on all measured routes, zero failing audits | ✅ |
| Lighthouse budgets covering the routes that actually ship | ✅ |
| Dashboard CLS within budget | ⚠ ¹ |
| Documentation + runbooks | ✅ |
| Delivery report + handover | ✅ |
| Backend e2e suite green | ⛔ ² |

¹ 0.388 → 0.154 against a 0.1 budget. Remains a documented `warn`, with the exact
fix written up. See §Known gaps.
² 26 pre-existing failures, none introduced this month. See §Known gaps.

---

## Week 1 — Security review

Full write-up in [`backend/SECURITY.md`](../backend/SECURITY.md). Every finding
was **reproduced against a running server** before being fixed, and re-verified
after.

### Critical — tokens were forgeable if one variable was missing

`src/utils/jwt.ts` fell back to `'fallback_access_secret'` — a literal committed
in this repository — when `JWT_ACCESS_SECRET` was unset. A deploy that simply
forgot the variable would have signed real tokens with a publicly known key.
Anyone able to read the source could mint one, including `sup: true` (platform
administrator), for any customer. Nothing would have looked wrong: logins would
succeed and tokens would verify.

Production now refuses to start on a missing, too-short, or placeholder secret —
including the `CHANGE_ME_…` values in `.env.example`, which are equally public.

### High — the login endpoint had no rate limiting at all

`POST /auth/login` carried a `@Throttle` decorator and advertised *"rate-limited
to 10 requests/min"* in its API documentation. Neither was true: `ThrottlerGuard`
is not registered globally in this app, and the auth controller never applied it,
so the decorator configured a guard that never ran.

| | 30 consecutive failed logins |
|---|---|
| Before | 30 × 401, **zero 429** |
| After | 10 × 401, **20 × 429** |

The control experiment mattered: the same burst against `/v1/public` — which
*does* apply the guard — returned 30 × 404 then 10 × 429, proving the mechanism
worked and was simply unattached.

### High — eleven request bodies validated nothing

They were bound to TypeScript interfaces and inline object literals, which erase
at compile time, so `ValidationPipe` had no metatype and passed the raw body
through. Affected routes included `login`, `register`, `forgot-password`,
`verify-reset-code`, `reset-password` and both import routes.

`POST /auth/login` with `{"email":{"$ne":null}}` reached
`input.email.toLowerCase()` and returned a **500 leaking the internal message to
an unauthenticated caller**. The Mongo operator never reached a query — but only
because of an incidental `.toLowerCase()`, not because anything checked it.

This was the **third** defect of that exact shape in the codebase.

### Also fixed

- **No password policy on registration or reset.** Both documented 8 characters;
  neither enforced it. A one-character password was accepted by both.
- **CORS fell back to a wildcard** when `CORS_ORIGIN` was unset — a forgotten
  variable silently served every origin. Production now refuses to start.
- **`trust proxy` was never set**, so behind a load balancer every request appears
  to come from the balancer and per-IP limits bucket the entire customer base
  together. Now a **hop count**, deliberately not `true`: trusting the
  client-supplied `X-Forwarded-For` would let an attacker spoof a fresh IP per
  request and skip the limiter entirely.
- **bcrypt cost was 10 on the customer-administrator creation path** against 12
  everywhere else — the most privileged account of every new customer received
  the weakest hash in the system.

### Dependencies

31 → 25 advisories, high 8 → 4, by applying non-breaking updates and moving
`nodemailer` 8.0.11 → 9.0.5 (its advisory concerns the `raw` message option,
which this codebase never uses). The remaining direct high is `multer`, whose fix
requires a **NestJS 10 → 11 major upgrade** — recorded as a decision for
Observator rather than made unilaterally in a review week.

### Two new policy tests

`throttle-coverage` fails the build if any route carries `@Throttle` without a
guard in scope; `dto-binding` fails it if any request body is bound to a type that
erases at runtime. **Both were verified to fail** when the defect is reintroduced.

---

## Week 2 — Accessibility and performance

### Accessibility: 0.95–0.97 → **1.00 on all nine routes**, zero failing audits

Three real violations, none of which the existing e2e axe gates could see, because
no gate covered the application shell or `/org`:

- **`label-content-name-mismatch` on all eight authenticated routes.** The command
  palette showed `Search ⌘K` but was named "Search devices, sessions and records";
  the user menu showed the avatar's initials but was named "User menu". Worth
  recording: `aria-hidden` is **not** a fix here. WCAG 2.5.3 protects speech-input
  users, who say what they can *see*, so the rule counts visually rendered text
  regardless. The first attempt was wrong for exactly that reason.
- **`color-contrast` at 2.77:1 in dark mode.** The customer accent's derived
  `--primary-strong` only ever *darkened* — correct on white, but on a dark
  surface it walks text toward its own background — and it derived against the
  page surface when the tinted element actually sits on the **card**. Now derived
  per surface and emitted for all three theme selectors; the
  `prefers-color-scheme` block had been missing entirely, so viewers on system
  dark were receiving the light-surface value.
- **Two critical failures on the `/org` audit filters** — four `<label>` elements
  with no `htmlFor`, so a screen reader announced four unnamed fields.

### Lighthouse: the budget was measuring a page nobody could reach

It gated `/sessions` — disabled in M15 and flag-gated out of the navigation —
while every route built in M16–M23 had no budget at all. It now covers nine real
routes, all passing.

| Route | Perf | A11y | CLS |
|---|:-:|:-:|:-:|
| `/login` | 1.00 | 1.00 | 0.000 |
| `/` | 0.87 | 1.00 | 0.154 ⚠ |
| `/devices` | 0.99 | 1.00 | 0.044 |
| `/records` | 1.00 | 1.00 | 0.000 |
| `/analytics` | 0.99 | 1.00 | 0.000 |
| `/map` | 0.98 | 1.00 | 0.000 |
| `/roles` | 0.99 | 1.00 | 0.000 |
| `/platform` | 1.00 | 1.00 | 0.000 |
| `/stream-types` | 1.00 | 1.00 | 0.000 |

### Layout shift: 0.388 → 0.154

The previous write-up was wrong twice — it recorded 0.12 (the lucky run of
0.388 / 0.117 / 0.391) and blamed a component switched off since M15. Measuring
with a `layout-shift` observer plus per-section height sampling found **four**
contributors, and the one it named was not the largest: a KPI skeleton 66px short
of its loaded row, a `dynamic()` map fallback that escaped its own height
reservation, a spinner→grid swap, and a wind rose that grew 236px.

The first attempt at the third made it **worse** (0.556): the tile filter fails
open, so the skeleton painted all eleven tiles and then shrank. Only measuring
caught that.

### A regression from Week 1, caught here

The new login rate limit broke the Playwright suite — **36 failed, 4 passed** —
because its backend runs without `NODE_ENV`, so the test carve-out never fired.
It presents as a broken application, not a rate limit. Documented; 40/40 now pass.

---

## Week 3 — Documentation

**`ingest-agent/` had no documentation of any kind** — no README, no install
guide — despite being the component that runs on Observator's server and performs
the actual ingestion. The far less critical `provision-agent/` had both.

- **[`ingest-agent/INSTALL.md`](../ingest-agent/INSTALL.md)** — install, the
  two-unit split and why they can never be merged, every environment variable with
  its default, the per-file disposition table, health checks, and a
  symptom→cause table. It opens with a hazard warning (see §Known gaps).
- **[`README.md`](../README.md)** — the repository had 48 markdown files and
  nothing saying which were true. Most describe a platform whose primary data
  source was the mobile apps, an assumption that stopped holding in M15. Every
  document is now classified **current** or **historical**.
- **[`backend/OPERATIONS.md`](../backend/OPERATIONS.md)** gained a *Deploying*
  section. This matters more than it sounds: `autoIndex` was switched off in W1,
  so **a fresh deploy creates no indexes at all** unless `npm run sync:indexes`
  runs. Undocumented, that is a silent production-performance failure on first
  deploy.

Every documented command was run, every internal link resolved, and the
production start-up refusals re-tested.

---

## Months 13–24 in brief

The programme began from a changed premise. Months 1–12 built a platform around
**mobile apps pushing data over HTTP**, with every write path deriving its tenant
from a user token. Observator's weather station does not authenticate to the API
at all — it drops CSV files onto a server. Months 13–24 rebuilt the intake around
that, retired the mobile and NEP surfaces, and made the platform genuinely
multi-customer.

| Month | Delivered |
|---|---|
| **13** | Demo data purged; CSV parser built against 2,434 real files; hashed machine credentials; the ingest endpoint; the agent |
| **14** | Correctness and scale: rollup moved into MongoDB and debounced (**9.5s → 2.6s**, 1,440 → ~288 recomputes/day), partial 30-day retention that leaves mobile data untouched, local-day keying |
| **15** | Demo surface removed from both codebases (314 references → 0); 32 mobile/NEP/invite routes disabled at module registration, files intact |
| **16** | The wind display: compass dial, live push straight into the cache, and panels that hide what a station does not report |
| **17** | Alerts. Validating against 399 real files exposed a product defect — the evaluator used only the last reading per upload, **missing the peak in 86.7% of files** |
| **18** | Roles and permissions: a 22-permission catalogue in code, guard ordering, and role deletion with reassignment inside one transaction |
| **19** | Multi-tenancy: organisation switching that re-points rather than bypasses the tenant filter, an unmissable "acting as" banner, cross-customer overview, customer creation. Plus the folder re-key the client's layout change forced |
| **20** | Customer branding through to exports and public share pages, with accent contrast enforced against both surfaces |
| **21** | Automated station provisioning: an outbound-only agent, jobs as an enum never a command line, arguments validated in three independent layers |
| **22** | The multi-stream framework — onboarding a new format became configuration rather than surgery. Built deliberately instead of guessing at formats that did not yet exist |
| **23** | Scale and operations: index review (**8 keys examined → 1** on the hottest read), a backup rehearsal that found the backup was **not restorable**, health checks for silent failures, load tests |
| **24** | Security review, accessibility, documentation, handover |

Two themes recur, and both are worth carrying forward:

**Measuring found what reading could not.** The M17 alarm defect, the M23
unrestorable backup, the M23 index that the query planner would not use, and this
month's unguarded login endpoint were all invisible to code review and unit tests.
Each was found by running the real thing against real data.

**The client's own server was the best source of truth.** The folder layout
change, the unit switch from km/h to m/s, and the three-file-type discovery all
came from inspecting the server directly — in two cases before Observator
reported them, and in one case correcting what had been reported.

## The platform as delivered

| | |
|---|---|
| Live API routes | **124** (15 deliberately disabled, files intact) |
| Registered modules | 21 (2 disabled) |
| Admin panel routes | 29 |
| Backend source files | 194 |
| Admin panel source files | 345 |

### Test suites

| Suite | Tests | State |
|---|:-:|---|
| Backend (`jest`) | 530 | 498 pass, 26 pre-existing failures, 6 skipped |
| Admin panel unit (`vitest`) | 293 | All pass |
| Admin panel journeys (`playwright`) | 40 | All pass, includes axe gates |
| Ingest agent | 27 | All pass |
| Provisioning agent | 66 | All pass |

Four are **policy tests** that encode a decision rather than a behaviour, and are
worth understanding before editing what they guard: `retention` (nothing on the
ingest box is ever deleted), `index-hygiene`, `throttle-coverage`, `dto-binding`.

---

## Known gaps

Listed plainly, because a handover that hides them is worth less than one that
does not.

### 1. The station now sends three file types, and only one is handled — blocking

Discovered on 26 Aug by inspecting Observator's server directly, not reported.
The folder holds `WindSonic_*` (11,759 files), `Environmental_*` (2,087) and
`EnvDiagnostic_*` (2,056), and **the agent picks up every `.csv`**.

| File | Parsed as the wind stream today |
|---|---|
| `WindSonic_*` | Correct |
| `Environmental_*` | Ingests, but **humidity is silently dropped** — the alias list has `humidity_pct`, the file says `humidity_percent`, and matching is exact |
| `EnvDiagnostic_*` | **Inserts ~60 all-null measures per minute.** It is an audit log, not data |

Neither new file is rejected, because the only hard bail is a missing timestamp
column and **both have one**. They fail by writing plausible-looking junk.

The cause is structural: stream type is keyed on `(account, folderPath)` — one
stream per folder — but this station puts three streams in **one** folder,
separated by filename prefix. **This blocks enabling the agent against the live
folder.** Full work breakdown in `months13-24.md` under *Newly discovered scope*.

### 2. Backend e2e suite is not green

26 failures across 4 suites, **none introduced this month**: routes commented out
in M15 (NEP, mobile sync, invitations) that older specs still assert, plus MET
statistics tests asserting on demo data purged in M13. The consequence is that the
suite cannot currently fail loudly on a real regression.

### 3. Dashboard CLS remains a `warn`

0.154 against a 0.1 budget. The remaining shift needs the devices list prefetched
in the `/` server component and hydrated into the query cache — a new
data-loading pattern for this codebase, which is why it was not introduced in the
final month. The exact fix is written up in `admin-web/LIGHTHOUSE.md`.

### 4. Upload folder migration not performed

We told Observator in writing that `/upload/Demo Tower` becomes
`/upload/Observator/Demo Tower`. The server is still on the flat root. Harmless
with one customer — M19 W4 backfilled `uploadFolder: ""` for exactly this case —
and blocking the moment a second arrives. Both migration scripts exist.

### 5. Decisions deliberately left to Observator

- **NestJS 10 → 11** to clear the remaining `multer` advisories.
- **45% of every measure is stored nulls** — 24 of 39 fields on a wind-only
  station, ~35 GB uncompressed at 130M rows. Removing the schema defaults would
  roughly halve the largest collection and cut oplog volume ~45%, but it touches
  the hottest write path and ~30 read sites, so it needs its own verification pass.
- **Live display latency.** Files arrive once a minute, so the dashboard is up to
  60 seconds behind. Sub-second display needs a push transport (MQTT) alongside
  the file drop. Question outstanding with Observator.
- **`EnvDiagnostic` files** — ingest as sensor health (they explain the ~22%
  environmental gap and would feed the health endpoint) or skip entirely.

---

## Handover

**Start at [`README.md`](../README.md).** It maps the four components, links every
current document, and lists the five things worth knowing before touching
anything.

Operational entry points:

| Need | Document |
|---|---|
| Deploy, back up, restore, size the cluster | [`backend/OPERATIONS.md`](../backend/OPERATIONS.md) |
| Security posture and how to re-run the review | [`backend/SECURITY.md`](../backend/SECURITY.md) |
| Install or operate the ingest box | [`ingest-agent/INSTALL.md`](../ingest-agent/INSTALL.md) |
| Provisioning agent and its threat model | [`provision-agent/`](../provision-agent/) |
| Frontend operations and deployment | [`admin-web/RUNBOOK.md`](../admin-web/RUNBOOK.md), [`VERCEL.md`](../admin-web/VERCEL.md) |
| Performance and accessibility budgets | [`admin-web/LIGHTHOUSE.md`](../admin-web/LIGHTHOUSE.md) |

Three things that will bite whoever deploys next, all documented but worth
repeating here:

1. **Run `npm run sync:indexes` on every deploy.** `autoIndex` is off in
   production; without this step a new model gets no indexes.
2. **Set `CORS_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and
   `TRUST_PROXY`.** The first three now refuse to start rather than fail open.
3. **Co-locate the API and the database.** Ingest is 9 round trips per file and
   ~89% of the time is latency: the same build carries ~78 stations across a WAN
   and ~664 in-region. Getting this wrong looks like a slow application.
