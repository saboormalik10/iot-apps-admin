# Running the weather station PC

For whoever looks after the station PC. All the tools below are in the program
folder, `C:\Observator`. Double-click them; the ones that change something ask for
administrator rights.

| Tool | What it does |
|---|---|
| `status.cmd` | Is everything working? Services, sensor, last backup, free disk |
| `backup-now.cmd` | Take a backup now |
| `restore.cmd` | Put a backup back |
| `reset-password.cmd` | Set a user's password, at this PC |
| `upgrade.cmd` | (in a **new** release's folder) upgrade, keeping all data |
| `uninstall.cmd` | Remove the software, keeping the data |

The same health information is on the portal's **System** page, from any PC on the site
network — for administrators and operators; it names the PC's folders and its database.

---

## What runs

Three Windows services, all set to start with Windows and to restart after a crash:

| Service | Program | Port |
|---|---|---|
| Observator Weather - Database | MongoDB | 27017, this PC only |
| Observator Weather - API and sensor stream | the API | 3200, this PC only; the sensor on 4000 |
| Observator Weather - web portal | the portal | 3201, the site network |

They run as the built-in *Local Service* account, not as an administrator. To
restart them: **Services** (Win+R → `services.msc`), or restart the PC.

## Where things are

| | |
|---|---|
| `C:\Observator` | The program. Replaced by an upgrade — keep nothing of your own here |
| `C:\ObservatorData\config\observator.env` | **The settings.** One file for everything |
| `C:\ObservatorData\db` | The database |
| `C:\ObservatorData\logs` | Logs, rotated automatically |
| `C:\ObservatorData\backups` | Backups (by default) |
| `C:\ObservatorData\uploads` | The uploaded logo |

The settings and data folders can be opened by administrators only: the settings
file holds the keys that protect sign-in.

## Changing a setting

1. Open Notepad **as administrator**, then open
   `C:\ObservatorData\config\observator.env`. Every setting is explained in the file.
2. Change the value, save.
3. Restart the API and portal services (or the PC). Settings are read when a service
   starts.

Common ones: `STREAM_MODE` / `STREAM_TCP_PORT` / `STREAM_REMOTE_HOST` (the sensor
connection), `STREAM_RAIN_MODE` (how the rain gauge reports), `BACKUP_DIR` /
`BACKUP_KEEP` (backups), `STANDALONE_SELF_SIGNUP` (let people ask for an account),
the `EMAIL_*` block (only if the PC can reach a mail server). Changing the portal
port (`WEB_PORT`) also needs the firewall rule changed — easiest by running
`install.cmd -WebPort <port>` again from the release.

---

## Backups

Every night at 02:30 the PC backs up the database, the uploaded logo and the settings
into a new folder in `C:\ObservatorData\backups`, and keeps the newest 14. If the PC
was off at 02:30 the backup runs when it is next on.

- **Put backups somewhere else.** A backup on the same disk does not survive the
  disk failing. Add to the settings file, then restart nothing — the next backup uses
  it:

  ```
  BACKUP_DIR=E:\WeatherBackups
  BACKUP_KEEP=30
  ```

  A network share works too (`\\server\share\weather`). The backup runs as the PC
  itself, so the share must allow this PC's computer account (`DOMAIN\STATION-PC$`)
  to write.
- **Now:** `backup-now.cmd`, or `backup-now.cmd -To F:\` for a USB drive.
- **Check:** `status.cmd` or the portal's **System** page shows the last backup and
  warns if one failed or is more than a day and a half old.
- Each backup folder contains the settings file, which holds the site's secrets:
  keep backups somewhere private.

Size: a year of readings is about 0.5 GB of database and a backup of roughly a
third of that. The data is never deleted, so backups grow year on year; `BACKUP_KEEP`
decides how many are kept.

### Restoring

```
restore.cmd -From "C:\ObservatorData\backups\observator-20260922-023000-daily"
```

It asks you to type `RESTORE`, takes a safety backup of what is there now, replaces
the database with the backup's, and starts everything again. Readings that arrived
after the backup was taken are not in it.

To move to a new PC: install on the new PC, copy a backup folder across, and restore
it there.

---

## Serving the portal over HTTPS (optional)

The portal speaks plain `http://` by default: a site network usually has no
certificate authority of its own, and a self-signed certificate warns everyone who
opens the page. The cost is that the sign-in cookie crosses the site network in the
clear — fine on a private wired network, worth fixing on a shared or wireless one.

If the site has a certificate for this PC (issued by its own CA), put the
certificate and its private key somewhere only administrators can read — for example
`C:\ObservatorData\config\` — and add to the settings file:

```
WEB_TLS_CERT=C:\ObservatorData\config\station.crt
WEB_TLS_KEY=C:\ObservatorData\config\station.key
SESSION_COOKIE_SECURE=true
```

Restart the portal service. People then open `https://<pc>:3201`. Leave
`SESSION_COOKIE_SECURE=false` while on `http://`, or nobody can sign in.

## Alerts and email

Alerts appear in the portal — the bell in the top bar and the **Notifications**
screen. **There is no email**, by design: the PC has no internet (client, 23 Sep
2026). If the site later has a mail server on its own network, the `EMAIL_*` settings
turn email on; until then leave them commented out.

## Passwords

- **Someone forgot theirs:** an administrator signs in and uses **Users → ⋯ → Reset
  password**. The person is given a temporary password and chooses their own when
  they next sign in.
- **No administrator can sign in:** at the station PC run `reset-password.cmd`. It
  lists the accounts, asks which one and the new password. Being at the PC is what
  authorises it; it is recorded in the portal's audit log.

There is no emailed reset unless an email server is set up (`EMAIL_*` settings).

---

## Upgrading

1. Unpack the new release anywhere **except** `C:\Observator`.
2. Double-click its `upgrade.cmd`.

It backs up the database first, sets the old program aside as
`C:\Observator.previous`, installs the new one, adds any new settings (your existing
ones are kept), and checks everything starts. **If anything fails it puts the
previous version back and starts it**, so the site is not left without a working
system. The data folder is not touched.

When you are happy with the new version, delete `C:\Observator.previous`.

## Uninstalling

`uninstall.cmd` removes the services, the firewall rules and the nightly task. **The
data is kept** in `C:\ObservatorData`; installing again with the same data folder
carries on with all of it. `uninstall.cmd -RemoveData` also deletes the data, after
you type `DELETE`.

Installed from the setup program? Use **Settings → Apps → Observator Weather Station
→ Uninstall** instead; it does the same and leaves the data folder alone.

---

## The clock

The GMX551 has no clock, so **every reading is time-stamped by this PC**. If the PC's
clock is wrong, every reading is wrong, and it cannot be corrected afterwards.

- Keep **Set time automatically** on (Settings → Time & language). On a PC with no
  internet, point it at a time source on the site network (ask the site's IT).
- The **System** page warns if stored readings are newer than the PC's clock — the
  sign that the clock has gone back.
- Do not change the PC's time zone after installation; the station's own time zone
  is set in the portal (Organisation settings) and decides where each day starts.
