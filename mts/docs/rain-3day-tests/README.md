# 3-day rainfall rule — test cases and test data

The rule under test (proposal §7.2; values pending MTS confirmation):

- **Alert** when the rain in any **72 hours** reaches **120 mm** (120.0 mm counts).
- When the 3-day total falls back **below 120 mm**, a **48-hour vigilance** countdown starts. The alert and its instructions stay in force while it runs.
- If the total reaches 120 mm **again during the countdown**, the alert is active again and the **full 48 hours restart** when it next falls below.
- When the countdown ends, the **all-clear** (cancellation) is sent.

All rain is on the Marrickville gauge (MKV-RIMCO-01, 0.2 mm per tip). Times are hours:minutes after the start of the test, **3 Nov 2026 00:00 AEDT**. A tip exactly 72 hours old has left the 3-day window.

Note that with a rolling 3-day window, the total only drops below 120 mm when the oldest rain is more than 72 hours old. After one storm, the alert can therefore stay in force for about 3 days, plus the 48-hour countdown (R3D-03).

## Test cases

| ID | Scenario | Rain | Expected | Must not happen |
| --- | --- | --- | --- | --- |
| R3D-01 | Just under the line | 60 mm (00:00–10:00), 58 mm (48:00–57:40) | No alert | Any alert: the most in any 72 h is 118.0 mm |
| R3D-02 | Exactly 120 mm, from two storms | 60 mm (00:00–10:00), 60 mm (50:00–60:00) | Alert 60:00 · countdown 72:02 · all-clear 120:02 | — |
| R3D-03 | One storm, then dry | 132 mm (00:00–22:00) | Alert 20:00 · countdown 74:02 · all-clear 122:02 | A countdown before 74:02, although rain stopped at 22:00 |
| R3D-04 | Heavy rain again during the countdown | 132 mm (00:00–22:00), 132 mm (96:00–107:00) | Alert 20:00 · countdown 74:02 · re-trigger 106:00 · countdown 169:01 · all-clear 217:01 | An all-clear at 122:02 |
| R3D-05 | Light rain during the countdown | 132 mm (00:00–22:00), 30 mm (90:00–95:00) | Alert 20:00 · countdown 74:02 · all-clear 122:02 | A re-trigger, or a delayed all-clear |
| R3D-06 | Long steady drizzle | 144 mm (00:00–60:00, 2.4 mm/h) | Alert 50:00 · countdown 82:05 · all-clear 130:05 | — |

A test **passes** when every expected event happens at the stated minute, in order, and nothing else happens.

## How the expected times were worked out

Each storm rains at a steady rate, so tips fall on whole minutes: 6 mm/h is a tip every 2 minutes, 12 mm/h every minute and 2.4 mm/h every 5 minutes. For example, R3D-03:

- **Alert 20:00:** 6 mm/h for 20 hours is 600 tips = 120.0 mm.
- **Countdown 74:02:** the storm totals 132 mm (660 tips). The total falls below 120 mm once 61 tips have left the window (132 − 12.2 = 119.8 mm). The 61st tip fell at 02:02, so it leaves at 02:02 + 72 h = 74:02.
- **All-clear 122:02:** 74:02 + 48 h.

The other scenarios are worked the same way. The reasoning for each time is in the scenario's `expected.csv`.

## Files for each scenario

| File | What is in it |
| --- | --- |
| `R3D-xx-…-tips.csv` | Every gauge tip: Sydney time, UTC time, location, logger, 0.2 mm. Replay this into the system |
| `R3D-xx-…-hourly.csv` | Rain in each hour, the 3-day total and the rule state at the end of each hour, for checking by hand in Excel |
| `R3D-xx-…-expected.csv` | The expected events, their times, why, and the message wording |

## Running the tests

- **On screen:** in the portal, **Admin → Rain rule test**. Pick a scenario and press **Play**. The rain replays at up to 24 hours a second, and each expected event turns Pass or Fail as the clock reaches it. The CSVs download from the same screen.
- **Automatically:** in `mts/web`, run `yarn test:rain`. It runs every scenario and prints PASS or FAIL. `yarn export:rain` regenerates the CSVs in this folder.
