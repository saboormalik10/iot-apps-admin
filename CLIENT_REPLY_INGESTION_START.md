Hi Dana,

Thanks — the screenshot answered most of our questions. Moving ahead.

## Our decisions — nothing needed from you

- One SFTP login per station, each with its own folder. That's how we'll tell
  stations apart. No change to your file format.
- We'll read direction as relative to the mast, speed as km/h.
- No database changes needed — the data fits as it is.

## One fix at your end

The logger should upload only completed files, never the one still being written.
That's what's losing the readings. Worth doing before the station goes outside, or
your data-loss check won't be accurate.

## Starting now

We're building the ingestion — reading the files as they arrive and storing them for
the dashboard. We'll let you know when it's live and you can see the wind data on
screen.

## Need from you

1. **Will next week's streams use the same CSV format?** Most urgent — we're writing
   the file reader this week.
2. Which wind rose — the live compass gauge from your screenshot, or the statistical
   one we've built showing wind distribution over time? Either, or both.
3. The station's fixed public IP when you have it, so we can lock the login to it.

Best regards,
Hassan
