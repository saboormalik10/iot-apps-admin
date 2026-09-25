# GMX551 simulator

Plays the Gill GMX551 and its serial-to-Ethernet converter, so the standalone
software can be run end to end before a real sensor exists. It connects to the
stream port exactly as the converter will and sends one reading a second in the
format Gill's MaxiMet manual describes: a header and units line at "power-up",
then framed, checksummed readings.

Plain Node 18+, no install step.

```bash
node gmx551-sim.mjs                                   # normal weather → localhost:4000
node gmx551-sim.mjs --scenario all                    # every awkward case together
node gmx551-sim.mjs --host 192.168.1.20 --port 4000   # the site PC, from another machine
```

| Option | Default | |
|---|---|---|
| `--host` | `127.0.0.1` | The PC running the software |
| `--port` | `4000` | `STREAM_TCP_PORT` on that PC |
| `--interval` | `1000` | Milliseconds between readings |
| `--count` | forever | Stop after this many readings |
| `--scenario` | `normal` | Comma-separated, see below |
| `--shower` | `600` | Seconds of rain, then as long dry (`rain`) |
| `--reset-every` | `600` | Seconds between rain-counter resets (`reset`) |

## Scenarios

Each one exercises something the software has to get right.

| Scenario | What it sends | What should happen |
|---|---|---|
| `normal` | A breeze with noise; temperature and humidity follow the time of day | One record a minute, ~60 readings each |
| `gust` | A 3–5 second burst to 15–20 m/s every few minutes | The minute's **gust** shows the burst; the mean barely moves |
| `north` | Wind either side of north, 350° ↔ 10° | Direction near **0°**, never 180° — the arithmetic-mean trap |
| `rain` | 0.2 mm tips during showers, ~14 mm/h (heavy but real) | The rain total rises only while it rains |
| `reset` | The gauge's rain counter drops to 0 | The site total **keeps rising** — rain after the reset is counted |
| `badsum` | Every 30th reading with a wrong checksum | Counted as a checksum error; nothing stored from it |
| `split` | Each reading in two or three pieces | Readings reassembled; none lost |
| `drop` | The connection drops every 3 minutes, back after 10 s | Reconnects on its own; the part-minute is still written |
| `noheader` | No header on connect | The default column order is used |
| `interval` | Rain as the amount since the last reading | Needs `STREAM_RAIN_MODE=interval` on the PC |
| `all` | Everything except `noheader` and `interval` | |

## Checking what arrived

Signed in to the portal, `GET /api/stream/status` — or the API directly at
`http://<pc>:3200/v1/stream/status` with a token — shows whether the sensor is
connected, readings in the last minute (about 60 when healthy) and every error
counter.
