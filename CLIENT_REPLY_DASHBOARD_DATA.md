# Client Reply — Dashboard Screens vs Station Data

**To:** Dana Galbraith
**Re:** What the dashboard shows, what the station sends, and how you'd like us to handle the difference
**Date:** 2026-08-19

---

**Subject:** Dashboard screens vs the data the station is sending

Hi Dana,

We've now matched the station's data against the dashboard screen by screen. Everything
fits — no changes are needed for the data to be stored and displayed correctly. But
there is a difference in coverage worth a decision from you, and it's easier to make
now than later.

## What the dashboard is built to show

The dashboard was built around a full weather station and currently supports fifteen
measurements:

| | |
| --- | --- |
| Wind speed | Wind direction |
| Temperature | Humidity |
| Barometric pressure | Dew point |
| Solar radiation | Precipitation |
| Precipitation rate | QNH |
| QFE | Supply voltage |
| Battery voltage | Current |
| GPS altitude | |

On top of those it provides wind rose, wind gust history, comfort indices, fog risk,
pressure tendency, daily summaries, threshold alerting and data export.

## What the station is actually sending

Two measurements:

| | |
| --- | --- |
| Wind speed | in km/h |
| Wind direction | in degrees |

Each reading also carries a timestamp and a status flag. The data itself is clean —
across roughly 75,000 readings we found no malformed or missing values.

One normal characteristic worth knowing: in very light wind the sensor reports speed but
no direction, because below roughly 0.16 km/h it cannot resolve a bearing. That accounts
for about 31% of readings in the period we examined. This is expected behaviour for this
type of sensor, and we handle it correctly — those readings are recorded as wind speed
only rather than being discarded or shown as a false northerly.

## What this means on screen

| Screen | With the current data |
| --- | --- |
| Wind rose | Works fully |
| Wind gust history | Works fully |
| Wind speed and direction charts | Work fully |
| Wind threshold alerts | Work fully |
| Daily summaries | Wind figures only |
| Statistics and sensor comparison | Wind only — the other thirteen show no data |
| Comfort indices | Empty — needs temperature and humidity |
| Fog risk | Empty — needs temperature, dew point and humidity |
| Pressure tendency | Empty — needs barometric pressure |

In short, everything relating to wind works properly. The screens that need temperature,
humidity or pressure have nothing to draw, because the station isn't sending those
readings.

## The question for you

There are three ways to handle this, and we'd like your view.

**Option 1 — leave the dashboard as it is.** The wind screens work now, and the remaining
screens fill in automatically the moment a station sends those readings. No work, no cost,
and nothing to redo when the water quality and air quality systems arrive. The drawback is
that a customer looking at the dashboard today sees several empty panels.

**Option 2 — hide the panels a station doesn't have data for.** The dashboard detects what
each station actually sends and shows only those screens. A wind-only station shows a clean
wind dashboard; a full weather station shows everything. This is our recommendation. It is a
small piece of work, it applies to every customer automatically, and it means you are never
showing a customer an empty screen. Importantly it is one setting rather than a separate
dashboard per customer, so it doesn't affect the shared-platform costings we sent you.

**Option 3 — add the missing sensors at the station.** If the station is capable of
reporting temperature, humidity and pressure and it is simply not configured to send them,
that is the best outcome of all, because the dashboard already has screens waiting for them.
Worth checking with the installer before we build anything.

Options 2 and 3 are not alternatives — you can do both.

## One thing to confirm

Is the wind direction measured relative to true north, or relative to the mast's own
alignment? Both are usable, but the labelling on the dashboard needs to match, and we'd
rather ask than assume.

Let us know which way you'd like to go and we'll proceed.

Best regards,
Hassan
