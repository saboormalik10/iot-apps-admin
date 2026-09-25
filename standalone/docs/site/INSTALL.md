# Installing the Observator Weather Station software

For the technician setting up the station PC. Allow about 20 minutes.

The software turns one Windows PC into the site's weather station server. It
receives the Gill GMX551 readings over the network once a second, stores a
one-minute average of each, and serves a web portal that anyone on the site network
opens in a browser. Nothing is installed on the other PCs, and nothing needs the
internet.

---

## 1. Before you start

**The PC**

| | |
|---|---|
| Windows | 10 or 11, or Server 2019/2022, **64-bit** |
| Processor | One with **AVX** (the database needs it): any Intel Core from 2011 on, AMD from 2011 on. Some low-end Celeron and Pentium chips lack it. The installer checks and stops with a clear message if not |
| Memory | 4 GB or more |
| Disk | 20 GB free to start. Readings are **never deleted**: the database grows by about 0.5 GB a year, and each backup is a full copy |
| Network | A fixed IP address on the site network (so the converter and people can find it) |
| Clock | **Windows time synchronisation on.** The sensor has no clock: every reading is time-stamped by this PC |
| Power | On all the time; set to never sleep (Settings → System → Power) |

**The sensor side.** The GMX551 (with its rain gauge) is wired to a serial-to-Ethernet
converter (PoE) on the site network. You need to know which way the converter
connects — see [step 4](#4-point-the-sensor-at-the-pc).

**You need** an administrator account on the PC, and either

- `observator-weather-<version>-setup.exe` — the setup program (simplest), or
- `observator-weather-<version>-win-x64.zip` — the same thing as a folder of files.

Everything runs from this PC: no internet is needed, at install time or after.

---

## 2. Install

### With the setup program

1. Copy `observator-weather-<version>-setup.exe` to the PC and double-click it.
   Windows asks for administrator rights — allow it.
2. The wizard asks for:
   - the **program folder** (default `C:\Observator`) and the **data folder**
     (default `C:\ObservatorData` — keep it outside the program folder);
   - the **first administrator's email**;
   - the **sensor port** (4000), which way the converter connects, and the
     **portal port** (3201).
3. At the end a window opens and asks for the **administrator's password** (twice) —
   it is never stored on the PC or passed on a command line. That window then does
   the real work and prints the address to open.

### Or from the zip

1. Unpack it anywhere (for example to the Desktop).
2. **Double-click `install.cmd`** and allow administrator rights.
3. Answer two questions: the **administrator email** and **password** (twice).

Either way it checks the PC, copies the program to `C:\Observator`, creates the data
folder `C:\ObservatorData`, starts three services and checks each one answers, then
ends with the address to open, for example:

   ```
   Installed. Open the portal from any PC on the site network:
        http://station-pc:3201
        http://192.168.1.20:3201
   ```

The setup program (or the unpacked folder) can be deleted afterwards.

### Installing without anyone at the PC

For a site that deploys software centrally:

```
observator-weather-<version>-setup.exe /VERYSILENT /SUPPRESSMSGBOXES ^
  /AdminEmail=tech@site.local /AdminPassword=<password> ^
  [/DataDir=D:\ObservatorData] [/WebPort=3201] [/StreamPort=4000] ^
  [/StreamMode=connect /ConverterHost=192.168.1.50]
```

A password on a command line can be read by other programs while it runs, so prefer
the wizard where you can.

### Options (the zip's install.cmd)

Everything has a sensible default. To change one, run from a command prompt opened
as administrator, in the unpacked folder:

```
install.cmd -AdminEmail tech@site.local -StreamMode connect -ConverterHost 192.168.1.50
```

| Option | Default | What it is |
|---|---|---|
| `-InstallDir` | `C:\Observator` | The program. Replaced by upgrades |
| `-DataDir` | `C:\ObservatorData` | Readings, settings, logs, backups. **Never** inside the program folder |
| `-AdminEmail`, `-AdminPassword` | asked | The first administrator |
| `-SiteName` | Weather Station | Shown in the portal (changeable later) |
| `-StationName` | GMX551 Station | The station's name (changeable later) |
| `-TimeZone` | this PC's | An IANA name such as `Australia/Melbourne`. Decides where each day starts |
| `-WebPort` | 3201 | The portal's port |
| `-StreamMode` | listen | `listen`: the converter connects to this PC. `connect`: this PC connects to the converter |
| `-StreamPort` | 4000 | The sensor's TCP port |
| `-ConverterHost` | — | `connect` mode: the converter's IP address |
| `-AllowFrom` | LocalSubnet | Who the firewall lets reach the portal and sensor port: `LocalSubnet`, `Any`, or addresses/ranges such as `192.168.1.0/24,10.0.5.12` |
| `-BackupAt` | 02:30 | When the nightly backup runs |

If the installation stops with an error, fix what it says and run `install.cmd`
again: it carries on from where it stopped.

---

## 3. Check it works

1. On any PC on the site network, open the address it printed (for example
   `http://192.168.1.20:3201`).
2. Sign in with the administrator email and password.
3. Open **System** in the menu. Everything should be green except the sensor
   (until step 4) and the backup (until the first night).

On the station PC itself, `status.cmd` (in `C:\Observator`) prints the same.

---

## 4. Point the sensor at the PC

**Listen mode (the default)** — the converter connects to the PC. In the converter's
settings choose *TCP client* (sometimes called *active* or *connect* mode), with:

- destination IP: this PC's address
- destination port: **4000** (or `-StreamPort`)

**Connect mode** — the PC connects to the converter. Install with
`-StreamMode connect -ConverterHost <converter IP>`, and set the converter to *TCP
server* mode on port 4000.

Serial settings on the converter must match the GMX551 (Gill's default is 19200 baud,
8 data bits, no parity, 1 stop bit — check the sensor's configuration sheet).

Within a minute of the first reading, **System** shows *Connected* with about 60
readings a minute, and the dashboard's wind dial starts moving every second.

---

## 5. Hand over

- Give each person their own account: **Users → Add person** (see the user guide).
- Alerts appear **in the portal** (the bell, and the Notifications screen). There is
  no email: the PC has no internet, and none is needed.
- Tell the site's IT person that the PC needs Windows time synchronisation, must not
  sleep, and keeps its data in `C:\ObservatorData`.
- Decide where backups go. By default they stay on the same disk — see
  [OPERATIONS.md](OPERATIONS.md#backups) to put them on a second drive or a network
  share.

Next: [OPERATIONS.md](OPERATIONS.md) (status, backups, upgrades, passwords) and
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).
