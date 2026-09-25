# Troubleshooting

Start with `status.cmd` on the station PC, or the portal's **System** page. Logs are
in `C:\ObservatorData\logs`:

| File | From |
|---|---|
| `ObservatorAPI.out.log`, `.err.log` | the API and the sensor stream |
| `ObservatorWeb.out.log`, `.err.log` | the portal |
| `ObservatorDB.*.log`, `mongod.log` | the database |
| `install-*.log`, `upgrade-*.log` | each install and upgrade, in full |
| `maintenance.log` | the nightly backup |

---

## Installing

**"The database program cannot run on this PC … lacks AVX"** — the processor is too
old for MongoDB. Use a newer PC.

**"The Visual C++ runtime did not install"** — the database needs Microsoft's Visual
C++ runtime, and the installer adds it from the release when the PC lacks it. If that
fails, run `runtime\vc_redist.x64.exe` from the release by hand (or install the
*Microsoft Visual C++ Redistributable x64* from Microsoft), then `install.cmd` again.

**"Port 3201 (for the portal) is in use by '…'"** — another program uses that port.
Stop it, or install with another port: `install.cmd -WebPort 3301`.

**"Already installed in …"** — use `upgrade.cmd` from the new release instead.

**Anything else** — fix what the message says and run `install.cmd` again; it continues
where it stopped. The full log is `C:\ObservatorData\logs\install-<time>.log`.

---

## The portal

**Other PCs cannot open the address (it works on the station PC).**
- The firewall rule allows the *local subnet* only. If people are on another subnet,
  reinstall with `-AllowFrom Any` (or their range).
- Use the IP address rather than the PC name if names do not resolve on the site
  network.
- Some antivirus products add their own firewall — allow TCP 3201 there too.

**Signing in seems to work but lands straight back on the sign-in page.** The settings
file has `SESSION_COOKIE_SECURE=true` but the portal is opened with `http://`, so the
browser never keeps the sign-in. Set it to `false` and restart the portal service.

**"Too many attempts"** — 10 sign-ins a minute per PC. Wait a minute.

**Everyone forgot the administrator password** — `reset-password.cmd` at the station PC.

---

## The sensor

**System says "Not connected — waiting on port 4000".** The converter is not
connecting.
1. Is the converter in *TCP client* mode, pointed at this PC's IP address and port 4000?
2. Is the PC's IP address the one the converter was given (fixed address)?
3. From another PC: `Test-NetConnection <station PC> -Port 4000` in PowerShell should
   succeed. If it fails, the firewall is blocking it — see `-AllowFrom` above.
4. Some converters are servers only: switch to connect mode (`STREAM_MODE=connect`,
   `STREAM_REMOTE_HOST=<converter IP>` in the settings, restart the API service).

**Connected, but no readings / "Rejected: bad checksum" climbing.** Serial settings on
the converter do not match the sensor (baud rate, parity), or the line is noisy.

**Connected, readings arrive, but a value is missing.** The sensor's column layout is
not the default one and it has not sent its header line since the PC started listening
(it sends it only at power-up). Power-cycle the sensor, or set `STREAM_FIELDS` to its
column order.

**Rain looks wrong.** If the gauge reports rain per reading rather than a running
total, set `STREAM_RAIN_MODE=interval`. A counter that jumps by an impossible amount
(a sensor swap, a replayed counter) is logged and counted as *Rejected: implausible
rain* on the System page — never stored as rain.

---

## Data and time

**Readings are an hour (or more) out.** Check the station PC's clock and that Windows
time synchronisation is on. If the clock is right, check the site's time zone in the
portal (Settings → Site).

**System warns "Stored readings are newer than this PC's clock".** The clock went back.
Fix the time synchronisation; readings stored while the clock was ahead keep their
wrong time.

**Disk low.** Readings are never deleted. Free space, move backups off the disk
(`BACKUP_DIR`), or keep fewer (`BACKUP_KEEP`).

**The last backup failed.** `maintenance.log` says why. The usual cause is a network
share this PC's computer account cannot write to.

---

## Services

**A service stops again straight after starting.** Read its `.err.log`. The settings
file is the usual cause (a typo after an edit). Services restart themselves after a
crash — 10 s, then 30 s, then every 2 minutes.

**An upgrade failed.** It put the previous version back and started it; the failed
attempt is in `C:\Observator.failed-<time>` and the log in `upgrade-<time>.log`.

**"The specified service has been marked for deletion"** during an upgrade — close the
Services window (services.msc) and run the upgrade again.
