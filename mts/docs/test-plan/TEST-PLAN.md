## About this plan

This plan lists every feature the MTS proposal promises for the weather monitoring portal and server, and how each one will be tested. It is the checklist both sides use to agree that the system does what was proposed.

- **Tested against:** *Weather Monitoring — Sydney Metro M1*, proposal OBS-MTS-M1-WX-2026-01 (22 July 2026). Section numbers in this plan refer to it.
- **In scope:** the online portal, the central server and its alert engine, and the software behaviour of the stations as the portal sees it (pump control, fallback, store-and-forward).
- **Out of scope here:** sensor accuracy, mast and enclosure build, solar sizing and EMC. These are proven by calibration certificates and the per-location site acceptance test (proposal §10.1, stage 6). The feature list still names them, so nothing is missed.
- **Requirements still to come:** MTS's detailed requirements will refine thresholds, wording and recipients. Test values marked *(pending)* are the proposal's example values and change when MTS confirms them.

## How testing works

Each test has an ID, the steps, the expected result, where it can run, and a result to record.

### Where a test runs

| Where | Meaning |
| --- | --- |
| Prototype | Can be checked now on the design prototype, which runs on demonstration data. Proves the screen and the user journey, not the live data behind it |
| System | Needs the built server with real or simulated station data: alert timing and delivery, pump commands, ingest, fallback, security |
| Site | Needs the installed stations, during commissioning and the site acceptance test |

**Test data.** Server tests use a station simulator that replays rainfall, level, temperature and wind series, so each threshold can be crossed on demand. Site tests use the real sensors, the manual staff gauge and the existing Marrickville pumps.

**Pass or fail.** A test passes when every point of its expected result is seen. Anything else is a fail, recorded as a defect with steps to reproduce and a screenshot.

### Defect severity

| Severity | Meaning | Release |
| --- | --- | --- |
| Critical | A safety function is wrong or missing: an alert not raised, wrong wording, a pump command not supervised | Blocks release |
| Major | A feature does not work, with no workaround | Blocks release |
| Minor | Works with a workaround, or a display fault | Fixed before handover |
| Cosmetic | Look and wording only | Fixed when agreed |

## Feature list

The proposal promises 31 features. Each is covered by the tests named in the last column.

| # | Feature | Proposal | Where | Tests |
| --- | --- | --- | --- | --- |
| 1 | Corridor map: every station's readings against its alert thresholds | §8.1, Fig 6 | Prototype, System | MAP-01 to 04 |
| 2 | Station-status table: readings, pump, battery, signal, last update, status | Fig 6 | Prototype, System | MAP-05, 06 |
| 3 | Live header: Sydney time, active-alert count, stations online, alert banner | Fig 6 | Prototype, System | MAP-07, 08 |
| 4 | Trends: wind mean and gust, rainfall, temperature, humidity, with dashed thresholds | Fig 7 | Prototype, System | TRD-01 to 04 |
| 5 | Flood-event screen: two-location level series, pumps, vicinity inset, event log | Fig 8 | Prototype, System | FLD-01 to 03 |
| 6 | Station page: live readings, station health, level trend against thresholds | §5.6, Fig 12 | Prototype, System | STN-01 to 03 |
| 7 | Pump status: duty and standby, run and fault, condition monitoring | §5.5 | Prototype, System | PMP-01, 02 |
| 8 | Supervised manual pump control: AUTO/MANUAL, START/STOP with confirmation, logged | §5.6, §8.4 | Prototype, System | PMP-03 to 06 |
| 9 | Local pump control on the OMC-048: start, lag, stop levels, float backup and fail-safe, alternation, anti-cycling, standby cut-in, pump alarms | §5.6 | Site | PMP-07 to 14 |
| 10 | Rainfall vigilance: 25 mm/1 h, 45 mm/3 h, 120 mm/3 days, countdown, reset, all-clear | §7.2 | System | ALR-01 to 05 |
| 11 | Flood, temperature and wind alerts with the required wording | §7.3 | System | ALR-06 to 09 |
| 12 | Alert delivery by screen, email and SMS: weather within 5 min, faults within 30 min, required content | §7.1 | System | ALR-10 to 13 |
| 13 | Alert and notification history: filter, acknowledge, badge, CSV export | §7.6, Fig 15 | Prototype, System | ALR-14 to 18 |
| 14 | Annotate alerts | §8.1 | Prototype, System | ALR-19 |
| 15 | PTZ verification: pop-up, blinking camera icon, one-click live feed, link in email and SMS | §7.5 | Prototype, System | PTZ-01 to 05 |
| 16 | Rules engine: edit, add, enable, disable, schedule; validated, versioned and audited | §7.3, Fig 17 | Prototype, System | RUL-01 to 07 |
| 17 | Redundancy and fallback: alternate source, reworded coverage, fault alert | §7.4 | System | FBK-01 to 04 |
| 18 | Historical query by location, parameter, dates and interval; paged, sortable; CSV | §8.3, Fig 10 | Prototype, System | HIS-01 to 05 |
| 19 | User management: add with invitation, edit, suspend, remove, station scope | §8.4, Fig 14 | Prototype, System | USR-01 to 05 |
| 20 | Roles: six standard roles, several per user, custom roles, least privilege | §8.4 | System | USR-06 to 08 |
| 21 | Sign-in security: password policy, lockout, inactivity timeout, optional MFA, re-check on every action, encrypted sessions | §8.4 | System | USR-09 to 14 |
| 22 | 20 or more concurrent named logins | §8.1, §8.4 | System | NFR-01 |
| 23 | Audit trail: users, roles, thresholds, acknowledgements, pump actions; queryable, exportable | §8.4 | System | AUD-01 to 03 |
| 24 | System health: inoperable, unresponsive, missing sensor or pump data, low battery; refreshed ≤ 10 min; maintenance mode | §8.1, §9 | Prototype, System | HLT-01 to 04, 07 |
| 25 | Power telemetry: state of charge, PV input, charge/discharge, fault flags, alarmed | §8.6 | System, Site | HLT-05, 06 |
| 26 | Data ingest: timestamping, event-triggered messages, store-and-forward with no data loss | §8.2a, §8.5 | System | ACQ-01 to 03 |
| 27 | Data validation: range and rate limits, quarantine, data-quality alert, radar–float cross-check | §8.2b | System | ACQ-04 to 06 |
| 28 | Processing: 10-min, hourly and multi-day totals | §8.2c | System | ACQ-07 |
| 29 | Responsive portal: phone, tablet, laptop; pump screen on a phone | §8.1, Fig 9, Fig 13 | Prototype, System | RSP-01 to 04 |
| 30 | Availability, 48 h maintenance notice, cloud hosting with backups | §8.1, §9 | System | NFR-02 to 04 |
| 31 | Permanent data retention | §8.3 | System | NFR-05 |

**Proven at site acceptance, not in this plan:** sensor accuracy and ranges (§5.1–5.4), the manual staff gauge (§5.2), mast, enclosure and KE+200 clearance (§5.5, §5.7), solar autonomy (§8.6), EMC (§8.5), calibration certificates (§11.1).

**To confirm with MTS:** the proposal lists SMS as an alert channel; the agreed development scope (Rev B) delivers screen, email and web push instead. Tests ALR-10 to 13 and PTZ-05 assume the confirmed channels. The proposal also mentions sending alerts to other connected systems, such as operational displays or third-party interfaces (§8.2d); MTS to name any it needs, and a test is added for each.

## Test cases — map, trends and flood event

### Corridor map and station status (MAP)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| MAP-01 | Every station on the map | Open **Map** | All seven locations shown in corridor order, each with a numbered pin and a reading card | Prototype, System | |
| MAP-02 | Readings against thresholds | Compare each card with the station's latest readings | Each card shows only the sensors fitted there (§4.3), as value / threshold with units; Lady Game Drive shows both its up and down tunnel readings | Prototype, System | |
| MAP-03 | Status colours | Drive one station to warning, one to alert, stop one logger | Pins and cards turn amber, red and grey; each colour also has a word or icon | System | |
| MAP-04 | Map refresh | Change a reading at the simulator | The map shows the new value within the refresh interval, without reloading the page | System | |
| MAP-05 | Status table contents | Read the table under the map | One row per location: rain, wind, temperature, level, pump, battery, signal, updated, status | Prototype, System | |
| MAP-06 | Missing values | Check a station without a sensor | Shows "–", never 0 | Prototype, System | |
| MAP-07 | Header | Read the top bar | Sydney time with AEST/AEDT, active-alert count, stations online | Prototype, System | |
| MAP-08 | Alert banner | Raise an alert | The banner under the header shows the alert's instruction; **Open** goes to it | Prototype, System | |

### Trends (TRD)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| TRD-01 | Four charts | Open **Trends**, pick Belmore triangle | Wind (mean solid, gust dashed), rainfall, temperature and humidity, each with a "now" value | Prototype, System | |
| TRD-02 | Thresholds drawn | Read each chart | Alert thresholds dashed and labelled (75 km/h, 25 mm/hr, 38 °C) *(pending)*; rainfall bars over the threshold in red | Prototype, System | |
| TRD-03 | Station, range and interval | Change each control | Charts redraw for the new station, period and averaging interval | Prototype, System | |
| TRD-04 | Export | Select **Export CSV** | A CSV of the plotted data, with units | Prototype, System | |

### Flood event (FLD)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| FLD-01 | Two-location level series | Raise water at Marrickville and Marrickville–Dulwich Hill | Both series on one axis with pump-start, high-high and rail-foot lines | Prototype, System | |
| FLD-02 | Pumps and vicinity | During the event | Duty then standby shown running; the vicinity inset marks the affected location | Prototype, System | |
| FLD-03 | Event log | Read the log | Every step timestamped in order: rate of rise, standing water, pump starts, block line | Prototype, System | |

## Test cases — station page and pump control

### Station page (STN)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| STN-01 | Live sensor readings | Open **Station** for Marrickville | Rainfall, water level and float switch cards, each with value, model, threshold and status pill | Prototype, System | |
| STN-02 | Station health | Read the health card | Battery and charging, cellular signal, enclosure, logger state | Prototype, System | |
| STN-03 | Level trend | Read the 3-hour chart | Level against pump-start (+100 mm) and high-high (+180 mm) *(pending)*, pump starts marked | Prototype, System | |

### Pump status and manual control (PMP)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| PMP-01 | Pump status | Run the duty pump, then trip it | Duty and standby each show Running, Ready or Fault, with run time and flow | Prototype, System | |
| PMP-02 | Pump condition | Raise a condition signal from the panel | Stator temperature, water-in-oil, insulation and bearing temperature shown; a fault turns its tile red and alerts | System | |
| PMP-03 | Manual needs MANUAL mode | In AUTO, try **Start** | START and STOP are disabled until MANUAL is chosen | Prototype, System | |
| PMP-04 | Confirmation | In MANUAL, select **Start duty pump** | A dialog says which pump, what will happen and on whose authority; nothing happens until confirmed | Prototype, System | |
| PMP-05 | Command outcome | Confirm a start; repeat with the logger offline | Success shows the pump running; offline shows pending, then failed or timed out, never false success | System | |
| PMP-06 | Only authorised roles | Sign in as Operator, then Pump Controller | Operator cannot start a pump; Pump Controller can, at permitted stations only; every action logged with name and time | System | |
| PMP-07 | Lead pump start and lag | Raise level past L-start, then L-lag | Lead pump starts after the debounce; standby joins at high-high; both events alert | Site | |
| PMP-08 | Stop, anti-cycling and run-dry | Lower level past L-stop | Pumps stop only after the minimum run time; no restart before minimum rest; starts per hour capped; pumps cannot run below L-stop | Site | |
| PMP-09 | Alternation | Run two cycles | Lead and lag swap each cycle; run hours logged per pump | Site | |
| PMP-10 | Float backup | Make the radar invalid, then wet the float | Control moves to float only; pump starts on wet; a system-fault alert says so | Site | |
| PMP-11 | Works without the server | Cut the cellular link during a rise | Pumps still start and stop; buffered events reach the server when the link returns | Site | |
| PMP-12 | Pump alarms sent at once | Cause a pump fail, a no-flow and a high-high level | Each alarm reaches the alert engine immediately, not on the 5-minute cycle | System, Site | |
| PMP-13 | Standby cut-in | Trip the duty pump while it runs | Standby starts by itself; a pump-fault alert is raised | Site | |
| PMP-14 | Float fail-safe | Wet the float while the radar reads below L-start | Pump starts anyway and a discrepancy alarm is raised | Site | |

## Test cases — alerts, PTZ verification and rules

### Alert logic, delivery and history (ALR)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| ALR-01 | Rain 25 mm in 1 h | Simulate 26 mm in 50 min at Marrickville | Alert raised at once with the CJC-T patrol wording (Hurlstone Park–Bankstown) | System | |
| ALR-02 | Rain 45 mm in 3 h and 120 mm in 3 days | Simulate each total | Each raises its own alert; 45 mm adds the 60 kph TSR and demobilise-patrols reminder | System | |
| ALR-03 | Vigilance countdown | Let rain fall back below each threshold | Alert stays in force for 6 h, 12 h or 48 h from when rain fell below the line | System | |
| ALR-04 | Reset on re-trigger | Add a qualifying burst inside the countdown | The full countdown restarts from the beginning | System | |
| ALR-05 | All-clear | Let a countdown reach zero | A cancellation alert is sent and the whole sequence is in the event history | System | |
| ALR-06 | Flood: standing water | Raise level above the standing-water set point | Immediate alert with the PTZ verification prompt | System | |
| ALR-07 | Flood: above rail foot and trending down | Raise above rail foot, then let it fall | "Block the line" at once; on the fall, system checks, track inspection, staged 25 → 60 kph → unrestricted | System | |
| ALR-08 | Heat | Hold 38 °C then 45 °C for over 5 min; fall back for over 10 min | 60 / 40 kph TSR and heat-patrol wording on the rise; each stands down only after 10 min below | System | |
| ALR-09 | Wind | Gusts 75, 85 and 120 kph | TSR wording at the listed kilometrages at 75 and 85; block-line wording on external track at 120 | System | |
| ALR-10 | Weather alert within 5 min | Time from breach to arrival on screen and email | Every channel within 5 minutes; breach transmitted immediately, not on the 5-minute cycle | System | |
| ALR-11 | Fault alert within 30 min | Stop a logger | System-fault alert on every channel within 30 minutes | System | |
| ALR-12 | Alert content | Read a delivered alert | Date and time identified, track and rail (up/down), station kilometrage, hyperlink that opens the event | System | |
| ALR-13 | Recipients and retries | Make one recipient's email fail | Others receive it; the failed one is retried and the failure recorded | System | |
| ALR-14 | Alerts panel | Open **Alerts** | Tiles for active, unacknowledged, today and last 7 days; event log newest first | Prototype, System | |
| ALR-15 | Filters | Filter by severity, unacknowledged, location, date range | The list and counts match the filter | Prototype, System | |
| ALR-16 | Every event type | Generate one of each | Rain, flood, pump, temperature, wind, camera, sensor fault, data quality and power events all logged | System | |
| ALR-17 | Acknowledge | Acknowledge one alert, then **Mark all** | Each shows who and when; header badge and counts drop at once | Prototype, System | |
| ALR-18 | Export | **Export CSV** | The filtered events with acknowledgement details | Prototype, System | |
| ALR-19 | Annotate | Add a note to an event | Note saved with name and time, shown on the event | Prototype, System | |

### PTZ camera verification (PTZ)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| PTZ-01 | Pop-up | Trigger standing water at Canterbury | Pop-up "Flood verification required" with location, kilometrage and **View live PTZ feed** | Prototype, System | |
| PTZ-02 | Acknowledge or snooze | In the pop-up, select **Acknowledge**; trigger again and select **Snooze 10 min** | Acknowledge closes it with name and time recorded; snooze hides it and it returns after 10 minutes if still active | Prototype, System | |
| PTZ-03 | Blinking camera icon | Look at the map | Red blinking camera on the station; clicking it opens the feed | Prototype, System | |
| PTZ-04 | Right camera | Trigger at two locations in turn | Each opens the camera for its own location (Annexure C) | System | |
| PTZ-05 | Link in messages | Open the alert email (and SMS, if confirmed) | The same live-feed link opens in the browser | System | |

### Rules engine (RUL)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| RUL-01 | Rules table | Open **Admin → Alert rules** | Every rule with parameter, trigger, dwell/vigilance, severity, on/off | Prototype, System | |
| RUL-02 | Edit a rule | Change a threshold, wording, locations, recipients and channels; save | The engine uses the new values at once, with no software change | Prototype, System | |
| RUL-03 | Validation | Save an empty value or a warning above its alert | Refused with the reason; nothing changes | Prototype, System | |
| RUL-04 | Add, enable, disable | Add a rule; switch one off | The new rule fires; the disabled one does not | Prototype, System | |
| RUL-05 | Schedule | Give a rule a date range | Active only between the dates | System | |
| RUL-06 | Version and audit | Edit twice | Rule-set version goes up each time; who, when and what changed recorded | Prototype, System | |
| RUL-07 | Only administrators | Sign in as Operator | Rules are read-only | System | |

## Test cases — historical query and CSV export

### History (HIS)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| HIS-01 | Query by location, parameter and dates | Choose Marrickville and Belmore triangle, rainfall and water level, a 7-day range; **Run query** | Matching records only, newest first, with a total count | Prototype, System | |
| HIS-02 | Averaging interval | Run with 1-minute, 10-minute and hourly intervals | Row count and values change to match the interval; values are averages or totals as the parameter needs | System | |
| HIS-03 | Paging and sorting | Change rows per page; sort by each column | Pages and order correct across the whole result, not just the page shown | Prototype, System | |
| HIS-04 | Per-reading status | Read the Status column | OK, Warning or Alert per reading against the thresholds at that time | Prototype, System | |
| HIS-05 | CSV export | **Export CSV**; open in Excel | Exactly the filtered set, with timestamps, units and logger IDs; opens cleanly in Excel | Prototype, System | |

## Test cases — users, roles, sign-in and audit

### Users and roles (USR)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| USR-01 | Add a user | **Add user** with name, email, mobile, two roles, two stations | User listed as Invited; the invitation lets them set their own password | Prototype, System | |
| USR-02 | Edit a user | Change roles, stations, contact details and notification preferences | Takes effect at the user's next action, without signing out | Prototype, System | |
| USR-03 | Suspend and reinstate | Suspend a signed-in user; reinstate | Blocked at once; history kept; reinstated user can sign in again | Prototype, System | |
| USR-04 | Remove | Remove a user | Cannot sign in; their past actions still show their name in the audit trail | Prototype, System | |
| USR-05 | Station scope | Sign in as a user limited to Belmore triangle | Sees only permitted stations' data and alerts | System | |
| USR-06 | Six standard roles | Sign in once per role | Administrator, Operator, Pump Controller, Maintainer, Analyst, Viewer each see and can do exactly what §8.4 lists | System | |
| USR-07 | Several roles | Give one user Operator and Pump Controller | They get the union of both, nothing more | System | |
| USR-08 | Custom role | Create a role with chosen permissions; assign it | The user gets exactly those permissions | System | |
| USR-09 | Password policy | Set a short or common password | Refused with the rule it breaks | System | |
| USR-10 | Lockout | Enter a wrong password repeatedly | Account locks after the set number of tries | System | |
| USR-11 | Inactivity timeout | Leave a session idle | Warned, then signed out after the set time | System | |
| USR-12 | MFA (optional) | Turn MFA on; sign in | A second factor is required | System | |
| USR-13 | Permission re-check | Remove a role while its user has a page open; try the action | Refused by the server, not just hidden in the page | System | |
| USR-14 | Encrypted sessions | Open the portal over plain http; inspect the session | Redirected to https; the session cookie is secure and cannot be read by page scripts | System | |

### Audit trail (AUD)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| AUD-01 | Everything recorded | Add a user, change a role, edit a threshold, acknowledge an alert, start a pump | Each recorded with user, time and detail | System | |
| AUD-02 | Query | Filter the audit trail by user, action and date | Only matching entries | System | |
| AUD-03 | Export, no editing | Export to CSV; try to change an entry | The export matches the filter; entries cannot be edited or deleted | System | |

## Test cases — system health, data and fallback

### System health and power (HLT)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| HLT-01 | Health screen | Open **Health** | Loggers reporting, conditions raised, lowest battery, pump data gaps; a row per monitored condition | Prototype, System | |
| HLT-02 | Refresh ≤ 10 min | Note the last-refresh time over 30 min | Refreshes at least every 10 minutes by itself | System | |
| HLT-03 | Each fault condition | Simulate: logger hardware fault, no telemetry for 15 min, one sensor silent, pump data missing | Inoperable, unresponsive, missing sensor data and missing pump data each raised, with a system-fault alert | System | |
| HLT-04 | Clears by itself | Restore each fault | Condition clears and the event log records it | System | |
| HLT-05 | Power telemetry | Read the station's power panel | State of charge, PV input, charge/discharge and fault flags shown live | System, Site | |
| HLT-06 | Low-battery leading indicator | Drop state of charge below the set level | Low-battery alert raised before the station goes offline | System, Site | |
| HLT-07 | Maintenance mode | As Maintainer, put a station in maintenance mode, then end it | Everyone sees the station is in maintenance and why; its maintenance alerts can be acknowledged by the Maintainer; recorded in the audit trail | System | |

### Data acquisition and processing (ACQ)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| ACQ-01 | Routine telemetry | Run the simulator for an hour | Every message stored once, server-timestamped, at the configured cycle | System | |
| ACQ-02 | Event-triggered messages | Cross a threshold mid-cycle | Message arrives at once, not at the next cycle | System | |
| ACQ-03 | Store-and-forward | Cut the link for 2 h, then restore | The backlog arrives in order; no gaps, no duplicates; alerts in the gap still recorded | System, Site | |
| ACQ-04 | Range and rate limits | Send an impossible value and a sudden jump | Flagged or quarantined, not shown as real; data-quality alert raised | System | |
| ACQ-05 | Frozen sensor | Send the same value for a long period | Detected as frozen; data-quality alert | System | |
| ACQ-06 | Radar against float | Float wet while radar reads low | Sensor-discrepancy alarm | System, Site | |
| ACQ-07 | Aggregates | Compare totals with a hand calculation from raw tips | 10-min, hourly and 1/3/6/24-hour and 3-day rainfall totals match | System | |

### Redundancy and fallback (FBK)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| FBK-01 | Fault alert first | Fail the Marrickville rain gauge | A fault alert says alerting has switched to the fallback source | System | |
| FBK-02 | Rain and wind fallback | With the gauge failed, rain at Belmore triangle | Alert comes from Belmore, worded to say which sections it now covers | System | |
| FBK-03 | Temperature fallback | Fail temperature at a station | Falls back to Belmore triangle, then Bankstown airport and Richmond (BOM) | System | |
| FBK-04 | Tunnel cross-reading and flood fallback | Fail one Lady Game Drive radar; fail a flood sensor | Up/down tunnel cross-read; flood falls back to CIDS PTZ monitoring | System | |

## Test cases — responsive layout and system qualities

### Phone, tablet and laptop (RSP)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| RSP-01 | Columns reflow | Open Map at phone (~360 px), tablet (~800 px) and laptop widths | One column, two columns, three to four columns; no sideways page scroll | Prototype, System | |
| RSP-02 | Pump screen on a phone | Open Marrickville on a phone | One scrollable column in Figure 13's order: readings, health, level trend, pumps, condition, mode, START/STOP | Prototype, System | |
| RSP-03 | Touch use | Use menus, filters, pump controls by touch | Every control reachable and large enough to tap; wide tables and charts scroll inside their card | Prototype, System | |
| RSP-04 | Browsers | Repeat key journeys in Chrome, Edge, Safari (iPhone) and Chrome (Android) | Same behaviour in each | Prototype, System | |

### Performance, availability and data (NFR)

| ID | Test | Steps | Expected result | Where | Result |
| --- | --- | --- | --- | --- | --- |
| NFR-01 | 20 concurrent users | 20 named users signed in and active at once | Pages respond normally; alerts still within 5 min | System | |
| NFR-02 | Hosting and failover | Review the cloud set-up; restart one server instance | Runs on AWS or Google cloud across redundant infrastructure; service continues | System | |
| NFR-03 | Backups | Restore last night's backup to a test copy | Restores completely; readings and settings intact | System | |
| NFR-04 | Maintenance notice | Schedule maintenance | Users are told at least 48 h ahead | System | |
| NFR-05 | Data kept permanently | Query the oldest stored data | Still present and returned by the query engine; nothing purged | System | |

Availability over time (not inoperable more than 12 h in any 6 months, ≤ 24 h cumulative per 12 months, one 36 h maintenance window a year; §9) is measured in service from the health records, not in a test session.

## Sign-off

The plan has 112 tests across 16 areas. A release is accepted when every test has run and no Critical or Major defect is open.

### Before testing starts

- MTS has confirmed the thresholds, alert wording, recipients and alert channels marked *(pending)*.
- The server is built and loaded with the station simulator; test accounts exist for each of the six roles.
- PTZ camera links for each flood location are provided by MTS (proposal §7.5).

### Testing is complete when

- Every test is marked Pass, or Fail with a logged defect.
- No Critical or Major defect is open; Minor defects have an agreed fix date.
- Site tests (PMP-07 to 14, HLT-05 and 06, ACQ-03 and 06) have passed at each location during the site acceptance test.

| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Veldora | | | |
| Metro Trains Sydney | | | |
