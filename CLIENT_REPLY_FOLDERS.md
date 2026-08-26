Hi Milto,

Thanks — that clears up most of it.

## Folder structure

One folder per customer, one subfolder per tower:

    /upload/<Customer>/<Tower>/

Each customer gets one SFTP account pointed at their own folder. The customer
folder decides who the data belongs to; the tower subfolder identifies the
station. Adding a tower is just a new subfolder — no new account or credentials.
A customer only ever sees their own folder.

Your `/upload/Demo Tower` becomes `/upload/Observator/Demo Tower`.

Once a tower folder is named, please don't rename it — a rename reads as a new
station. Spaces are fine.

## Confirmed — nothing needed from you

- **Protocols:** SFTP only for now. MQTT, HTTPS and FTP later if a customer needs
  them.
- **Units:** we'll store and display exactly what the sensor sends.
- **Scope:** we're building against the data in the folder today, designed so new
  sensor types drop in later without rework. Anything that changes, we handle then
  — it won't mean rebuilding.

## Need from you

1. **One current wind CSV from V67** — to confirm the header hasn't changed since
   V16.
2. **One environmental file** (temperature / humidity / pressure), if it's being
   written to file yet.
3. Samples of the other types when they exist — GPS, solar radiation,
   precipitation, visibility, ceilometer, BTD300.

Wind only is fine for now — we'll add each sensor as its data starts arriving.

Kind regards,
Hassan
