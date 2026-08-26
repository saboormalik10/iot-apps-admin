Hi Milto,

No need to send anything — we pulled the files from the server directly.

**Wind:** confirmed. The header is unchanged and the unit field now reads `M`, so
the m/s switch came through correctly. Nothing to change on our side.

**Environmental:** we have the format
(`timestamp,temperature_C,humidity_percent,pressure_hPa`) and will add it as a
second data stream. The gaps are fine — about 22% of seconds have no reading, and
we store those as "no reading" rather than zero, so they never distort an average.

**One question:** there is also an `EnvDiagnostic_*.csv` alongside it, logging each
second as `Accepted` or `No data` with the raw sentence. Do you want that stored
as data, or is it only for troubleshooting at your end? We can use it to report
sensor health if that is useful.

**Live display:**

You are already sending every-second data — each wind file holds 60 rows, one per
second. Nothing is missing. The only delay is delivery: files arrive once a
minute, so the display can be up to 60 seconds behind.

Alarms are not affected. We check every row in the file, not just the last one,
so a gust mid-minute is still caught.

So: is up to 60 seconds behind acceptable for the display? If not, the simplest
fix is uploading every 10–15 seconds instead of every minute — no change to the
file format. A truly real-time display would need a live connection (MQTT)
instead of file upload, which we can scope if the customer needs it.

Kind Regards,

Hassan
