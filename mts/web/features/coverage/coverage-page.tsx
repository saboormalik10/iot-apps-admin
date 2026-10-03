import Link from 'next/link';
import { CheckCircle2, CircleDashed, MinusCircle, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Every requirement of OBS-MTS-M1-WX-2026-01 that touches the portal, and the
 * screen that answers it.
 *
 * It exists so the review can be run against the document rather than against
 * memory: open a section of the PDF, find it here, follow the link. Sections that
 * are about installation, maintenance contracts and governance are listed too,
 * marked as outside the portal, so their absence from the screens reads as a
 * decision rather than an omission.
 */
type Status = 'shown' | 'pending' | 'deviation' | 'outside';

interface Item {
  req: string;
  where: { label: string; href: string }[];
  status: Status;
  note?: string;
}

const SECTIONS: { id: string; title: string; items: Item[] }[] = [
  {
    id: '3',
    title: '§3 Delivery framework',
    items: [
      { req: '§2 Solution at a glance — stations, sensors, pumps, telemetry, alerting, portal, service', where: [{ label: 'System & contract', href: '/admin/system' }], status: 'shown' },
      { req: '§3.1 Blue2Scan, Blue2Link, Blue2Cast, Blue2Care — mapped to this project', where: [{ label: 'Blue2 map', href: '/health/pipeline' }], status: 'shown' },
    ],
  },
  {
    id: '4',
    title: '§4 Solution architecture',
    items: [
      { req: 'Data and alert flow: sensors → OMC-048 → 4G/5G → server → screen / email / push, with a link back to the event', where: [{ label: 'Data pipeline', href: '/health/pipeline' }, { label: 'Event page', href: '/alerts/evt-rail-foot' }], status: 'shown' },
      { req: 'Local logic on the logger continues through loss of the link; store-and-forward on restoration', where: [{ label: 'Station telemetry', href: '/stations/lady-game-drive' }, { label: 'Data pipeline', href: '/health/pipeline' }], status: 'shown' },
      { req: 'Per-location sensor mix and OMC-048 terminal assignment (§4.3)', where: [{ label: 'Sensors by location', href: '/admin/system' }, { label: 'Equipment — any station', href: '/stations/belmore/installation' }, { label: 'Sensor register', href: '/admin/sensors' }], status: 'shown', note: 'Terminal, interface, cable and cores from the §4.3 wiring schedule.' },
      { req: 'Figure 1 — end-to-end architecture', where: [{ label: 'System & contract', href: '/admin/system' }, { label: 'Data pipeline', href: '/health/pipeline' }], status: 'shown' },
      { req: 'Figure 3 / §6.1 — station wiring and OMC-048 connectivity, per location', where: [{ label: 'Marrickville wiring', href: '/stations/marrickville/installation' }, { label: 'Campsie (cut cable)', href: '/stations/campsie/installation' }, { label: 'Tunnel units', href: '/stations/lady-game-drive/installation' }], status: 'shown', note: 'Live: values on each sensor, relays drawn closed while a pump runs, modem signal and last send, battery and regulator flags.' },
      { req: '1-minute logging; transmit every 5 min, immediately on a breach', where: [{ label: 'Station telemetry', href: '/stations/marrickville' }, { label: 'Message chart', href: '/health/pipeline' }], status: 'shown' },
    ],
  },
  {
    id: '5',
    title: '§5 Sensors',
    items: [
      { req: 'Rainfall — RIMCO 7499, 0.2 mm/tip; 10-min, 1, 6, 24 h rolling totals', where: [{ label: 'Station reading card', href: '/stations/marrickville' }, { label: 'Rainfall by hour', href: '/history' }], status: 'shown' },
      { req: 'Flood — radar ±1 mm plus float switch; float verifies radar and backs up the pump trigger', where: [{ label: 'Radar/float cross-check', href: '/stations/marrickville' }, { label: 'Sump gauge', href: '/flood' }], status: 'shown' },
      { req: 'Flood — manual staff gauge for verification at every water-level point', where: [{ label: 'Staff gauge check', href: '/stations/canterbury' }], status: 'shown' },
      { req: 'Flood — rate-of-rise detection independent of absolute threshold', where: [{ label: 'Rate of rise', href: '/flood' }, { label: 'Rule', href: '/admin/rules' }], status: 'pending', note: 'The 60 mm/hr figure is ours, for MTS to set.' },
      { req: 'Flood — event-triggered fast reporting above 50 % of the warning level', where: [{ label: 'Station telemetry', href: '/stations/marrickville' }], status: 'shown' },
      { req: 'Temperature / humidity / pressure — GMX300 at 1.5–2 m, 1-minute', where: [{ label: 'Station charts', href: '/stations/belmore' }, { label: 'Trends', href: '/trends' }], status: 'shown' },
      { req: 'Wind — 2-minute mean, 3-second gust, direction 0–360°', where: [{ label: 'Wind rose', href: '/trends' }, { label: 'Station', href: '/stations/windsor-road' }], status: 'shown' },
      { req: 'Pumps — automatic start/stop from the radar; float as independent backup; run, fault and no-flow alarms', where: [{ label: 'Pump station', href: '/stations/marrickville' }, { label: 'Flood event', href: '/flood' }], status: 'shown' },
      { req: 'Pumps — duty/standby with lead/lag alternation; run hours logged per pump', where: [{ label: 'Pump run time', href: '/stations/marrickville' }], status: 'shown' },
      { req: 'Pumps — L-start, L-lag, L-stop, dead-band, minimum run/rest, maximum starts per hour', where: [{ label: 'Local control logic', href: '/stations/marrickville' }], status: 'pending', note: 'Values are configuration, finalised with MTS.' },
      { req: 'Pumps — existing-pump condition signals where available', where: [{ label: 'Pump condition', href: '/stations/marrickville' }], status: 'pending', note: 'Depends on what the existing panel exposes (§15).' },
      { req: 'Power — state of charge, PV input, charge/discharge, fault flags; alarmed as a leading indicator', where: [{ label: 'Station power', href: '/stations/lady-game-drive' }, { label: 'Controller flags', href: '/health' }], status: 'shown' },
      { req: '§5.1–5.4 Each instrument against the Statement of Requirements — requirement vs provided', where: [{ label: 'Installation → compliance', href: '/stations/belmore/installation' }], status: 'pending', note: 'Items marked "to confirm" are the datasheet checks of §15.' },
      { req: '§5.4 Gust-or-mean thresholds per rule', where: [{ label: 'Rule drawer → statistic', href: '/admin/rules' }], status: 'shown' },
      { req: '§5.6 / Figure 5 Pump control on the OMC-048: inputs, set points, fallback and fail-safe, outputs', where: [{ label: 'Live logic diagram', href: '/stations/marrickville' }], status: 'shown' },
      { req: '§5.6 Debounce, run-dry inhibit, standby cut-in, immediate alarms', where: [{ label: 'Local control logic', href: '/stations/marrickville' }], status: 'shown' },
      { req: '§5.7 VM5F mast (wind at ~10 m), 2.5 m flood masts, IP66 cabinet at ~1.3 m, 400 W panel', where: [{ label: 'Site elevation', href: '/stations/belmore/installation' }], status: 'shown' },
    ],
  },
  {
    id: '6',
    title: '§6 Station configuration',
    items: [
      { req: 'Seven locations, eight loggers; Lady Game Drive as two independent units shown as one place', where: [{ label: 'Corridor map', href: '/' }, { label: 'Lady Game Drive', href: '/stations/lady-game-drive' }], status: 'shown' },
      { req: 'Kilometrages and GPS positions', where: [{ label: 'Station header', href: '/stations/campsie' }], status: 'pending', note: 'Shown as provisional until MTS confirms them on site visits (§15).' },
      { req: '§6.2 / Figure 2 Site elevations — sensors at their heights, flood installation, Marrickville wet well', where: [{ label: 'Marrickville', href: '/stations/marrickville/installation' }, { label: 'Lady Game Drive', href: '/stations/lady-game-drive/installation' }, { label: 'Windsor Road', href: '/stations/windsor-road/installation' }], status: 'shown', note: 'Drawn live: water against the rail, float wet/dry, pumps running.' },
    ],
  },
  {
    id: '7',
    title: '§7 Alerting and threshold logic',
    items: [
      { req: '§7.1 Weather alerts within 5 min, system faults within 30 min', where: [{ label: 'Delivery time', href: '/alerts' }, { label: 'Per-alert delivery', href: '/alerts/evt-rail-foot' }], status: 'shown' },
      { req: '§7.1 Each alert carries date, time, track, rail, kilometrage and a hyperlink to the event', where: [{ label: 'Event page', href: '/alerts/evt-rail-foot' }], status: 'shown' },
      { req: '§7.1 Alerts by SMS', where: [{ label: 'Recipients', href: '/admin/recipients' }], status: 'deviation', note: 'Rev B §10 replaces SMS with web push. To confirm with MTS.' },
      { req: '§7.2 Rolling 1 h / 3 h / 3-day totals against 25 / 45 / 120 mm', where: [{ label: 'Vigilance board', href: '/' }, { label: 'Rolling totals', href: '/trends' }], status: 'shown' },
      { req: '§7.2 6 / 12 / 48 h vigilance from when rain falls below the line; reset on re-trigger; cancellation alert', where: [{ label: 'Vigilance board', href: '/' }, { label: 'Vigilance timeline', href: '/' }, { label: 'Alert log', href: '/alerts' }], status: 'shown' },
      { req: '§7.2 Patrol, demobilise and 60 kph TSR wording', where: [{ label: 'Rules', href: '/admin/rules' }, { label: 'Alerts', href: '/alerts' }], status: 'pending', note: 'Wording marked "draft" wherever MTS has not supplied it.' },
      { req: '§7.3 Flood: standing water (PTZ), above rail foot (block the line), trending down (staged reinstatement)', where: [{ label: 'Flood event', href: '/flood' }, { label: 'Reinstatement tracker', href: '/flood' }], status: 'shown' },
      { req: '§7.3 Temperature ≥ 38 / ≥ 45 °C rising > 5 min, falling > 10 min', where: [{ label: 'Rules', href: '/admin/rules' }], status: 'shown', note: 'Seasonal — scheduled for summer in the demo.' },
      { req: '§7.3 Wind ≥ 75 / ≥ 85 km/h TSR at listed kilometrages; ≥ 120 km/h block line', where: [{ label: 'Rules', href: '/admin/rules' }], status: 'pending', note: 'The kilometrage list is MTS’s to supply.' },
      { req: '§7.3 One configurable threshold table: add, edit, enable, disable, schedule; validated, versioned and logged', where: [{ label: 'Rules', href: '/admin/rules' }, { label: 'Version history', href: '/admin/rules' }, { label: 'Audit trail', href: '/admin/audit' }], status: 'shown' },
      { req: '§7.3 Validation before a change takes effect', where: [{ label: 'Rule drawer → test against 24 h', href: '/admin/rules' }], status: 'shown', note: 'The draft is dry-run against stored readings at every location it covers; a warning set above its alert is flagged.' },
      { req: '§7.4 Automatic fallback to the designated alternate source, with the wording rewritten', where: [{ label: 'Redundancy table + wording', href: '/health' }], status: 'pending', note: 'Normal and fallback wording shown side by side. Two pairings need MTS to confirm — flagged on the table.' },
      { req: '§7.5 Standing water: pop-up, blinking camera on the map, one-click live PTZ feed', where: [{ label: 'Map camera', href: '/' }, { label: 'Station button', href: '/stations/canterbury' }, { label: 'Alerts', href: '/alerts' }], status: 'pending', note: 'The pop-up appears by itself when the alert is raised (try the demo clock → "PTZ check — Canterbury"). The feed is simulated; camera URLs come from MTS (§15).' },
      { req: '§7.6 Searchable history: filter by severity, acknowledgement, location, date; named acknowledgement; CSV', where: [{ label: 'Alerts', href: '/alerts' }], status: 'shown' },
    ],
  },
  {
    id: '8',
    title: '§8 Portal, data transmission and power',
    items: [
      { req: '§8.1 Every station over a map with readings against thresholds and system-health fields', where: [{ label: 'Corridor map', href: '/' }, { label: 'Flood points now', href: '/' }], status: 'shown' },
      { req: 'Figure 7 — trends: wind, rainfall, temperature, humidity (+ level, Rev B; + pressure, GMX300)', where: [{ label: 'Trends', href: '/trends' }], status: 'shown', note: 'Set points are each location\u2019s own: pump-start only where there are pumps.' },
      { req: '§8.1 Laptop and mobile HMI — 1 column phone, 2 tablet, 3–4 desktop', where: [{ label: 'Any screen', href: '/' }], status: 'shown' },
      { req: '§8.1 Interrogate, annotate and acknowledge alerts', where: [{ label: 'Event page notes', href: '/alerts/evt-rail-foot' }], status: 'shown' },
      { req: '§8.1 Health dashboard refreshed every 10 minutes', where: [{ label: 'Health', href: '/health' }], status: 'shown' },
      { req: '§8.1 Maintenance notified 48 hours ahead', where: [{ label: 'Notice on every screen', href: '/health' }], status: 'shown' },
      { req: '§8.1 20 named logins', where: [{ label: 'Users', href: '/admin/users' }], status: 'shown' },
      { req: '§8.1 Cloud hosting with the provider\u2019s failover, automated backups, no MTS hardware', where: [{ label: 'Hosting panel', href: '/health/pipeline' }], status: 'pending', note: 'Region and data residency are MTS\u2019s call (§15).' },
      { req: '§8.1 Figure 8 — affected-vicinity inset on the flood screen', where: [{ label: 'Flood event', href: '/flood' }], status: 'shown' },
      { req: '§8.2 Ingest, validation, processing, logging, dissemination', where: [{ label: 'Data pipeline', href: '/health/pipeline' }], status: 'shown' },
      { req: '§8.2 Dissemination to other connected devices or systems', where: [{ label: 'Pipeline outputs', href: '/health/pipeline' }], status: 'pending', note: 'Which systems, and over what interface, is scoped at design.' },
      { req: '§8.2 Readings failing validation flagged or quarantined, with a data-quality alert', where: [{ label: 'Data quality', href: '/health' }], status: 'shown' },
      { req: '§8.3 Query by location, sensor and date range with an interval; sortable paged table; CSV', where: [{ label: 'History', href: '/history' }], status: 'shown' },
      { req: '§8.3 Trend analysis on the queried set', where: [{ label: 'History → run a query', href: '/history' }], status: 'shown', note: 'One chart per parameter, a line per location, with lowest / mean / highest and time over the line.' },
      { req: '§8.4 Add, edit, suspend, remove users; mobile number; notification preferences', where: [{ label: 'Users', href: '/admin/users' }], status: 'shown' },
      { req: '§8.4 Six standard roles, multiple roles per user, station scope, custom roles', where: [{ label: 'Roles', href: '/admin/roles' }, { label: 'Users', href: '/admin/users' }], status: 'shown' },
      { req: '§8.4 Supervised pump control: MANUAL mode plus confirmation, authenticated and logged', where: [{ label: 'Pump control', href: '/stations/marrickville' }], status: 'shown' },
      { req: '§8.4 Maintenance mode (Maintainer)', where: [{ label: 'Campsie', href: '/stations/campsie' }], status: 'shown' },
      { req: '§8.4 Full audit trail, queryable and exportable', where: [{ label: 'Audit trail', href: '/admin/audit' }], status: 'shown' },
      { req: '§8.4 Self-service password reset — no administrator involved', where: [{ label: 'Forgot password', href: '/forgot-password' }, { label: 'Choose a new password', href: '/reset-password?token=demo' }], status: 'shown', note: 'Single-use link valid 30 minutes; the reply never reveals whether an address has an account; resets in the audit trail.' },
      { req: 'Bot protection on sign-in and reset — Cloudflare Turnstile', where: [{ label: 'Sign in', href: '/login' }], status: 'shown', note: 'Client review request. The real widget, on Cloudflare’s test key until MTS supplies one; verified server-side in the build.' },
      { req: 'Super User role — creates organisations, their users and stations', where: [{ label: 'Admin → Organisations', href: '/admin/organisations' }, { label: 'Admin → Stations', href: '/admin/stations' }], status: 'shown', note: 'Client request (3 Oct). In the prototype, switch with demo time → View as → Super User.' },
      { req: 'Per-organisation rights to add users, stations and sensors — off by default, granted by the Super User', where: [{ label: 'Organisations', href: '/admin/organisations' }, { label: 'Users', href: '/admin/users' }, { label: 'Sensors', href: '/admin/sensors' }], status: 'shown', note: 'Client request (3 Oct). MTS is shown with users and sensors granted, stations not; a new organisation starts with all three off.' },
      { req: 'Rain gauge bucket size — 0.1, 0.2, 0.5 or 1.0 mm per tip', where: [{ label: 'Admin → Sensors', href: '/admin/sensors' }], status: 'shown', note: 'Client request (3 Oct). Set when adding or editing a rain gauge; tip counts and the equipment list use it.' },
      { req: 'Data files delivered to /MTS/Sydney/Site-N/, moved to Processed/ once read', where: [{ label: 'Incoming data folders', href: '/health/pipeline' }], status: 'pending', note: 'Client request (3 Oct). Files are moved, never deleted. Station names for the folders and the test server’s fixed IP to confirm.' },
      { req: 'Add and manage sensors — register, like-for-like replacement, decommission', where: [{ label: 'Admin → Sensors', href: '/admin/sensors' }], status: 'shown', note: 'Client review request. Station equipment lists read from it.' },
      { req: '§8.4 Optional MFA, password policy, account lockout, inactivity timeout', where: [{ label: 'MFA', href: '/mfa' }, { label: 'Lockout', href: '/locked' }, { label: 'Inactivity warning', href: '/settings' }], status: 'shown' },
      { req: '§8.5 4G/5G with store-and-forward buffering during outages', where: [{ label: 'Telemetry', href: '/stations/lady-game-drive' }], status: 'shown' },
    ],
  },
  {
    id: '9',
    title: '§9 Performance and availability',
    items: [
      { req: 'Not inoperable > 12 h in any 6 months, ≤ 24 h in any 12', where: [{ label: 'Availability budget', href: '/health' }], status: 'shown' },
      { req: 'One planned 36-hour maintenance window a year', where: [{ label: 'Maintenance notice', href: '/health' }], status: 'shown' },
      { req: 'Report inoperable / unresponsive / missing sensor or pump data / low battery', where: [{ label: 'Monitored conditions', href: '/health' }], status: 'shown' },
      { req: 'Advise when re-calibration is required; calibration certificates', where: [{ label: 'Calibration', href: '/health' }], status: 'shown' },
    ],
  },
  {
    id: '10',
    title: '§10–§13 Delivery, maintenance, safety and governance',
    items: [
      { req: '§10.1 / Figure 16 Implementation programme and milestones', where: [{ label: 'Programme', href: '/admin/system' }], status: 'shown', note: 'Indicative weeks from contract award; kept as the delivery record.' },
      { req: '§10.2 Installation and site works — possessions, siting, height access, competency', where: [{ label: 'Site works', href: '/admin/system' }], status: 'shown' },
      { req: '§11.2 Response ≤ 6 h, on-site investigation ≤ 12 h, repair ≤ 24 h', where: [{ label: 'Work orders', href: '/health' }], status: 'shown', note: 'Each fault opens a Blue2Care work order tracked against the three clocks.' },
      { req: '§11.1 Preventive maintenance and annual calibration certificates', where: [{ label: 'Calibration', href: '/health' }], status: 'shown' },
      { req: '§13 Configuration management — CCB for portal and non-like-for-like changes', where: [{ label: 'Rules → version history', href: '/admin/rules' }], status: 'shown', note: 'Rule edits are configuration and take effect on save; the portal itself changes through the CCB.' },
      { req: '§12 WHS, RSNL, environment, Modern Slavery, physical and OT security', where: [{ label: 'Safety & compliance', href: '/admin/system' }], status: 'shown', note: 'Reference only — obligations of the contract, recorded beside the system.' },
      { req: '§13 Governance — representatives, meetings, incidents, variations, audit; §14 summary of compliance', where: [{ label: 'Governance', href: '/admin/system' }], status: 'shown' },
    ],
  },
  {
    id: '15',
    title: '§15 Confirmations sought from MTS — and where each is flagged',
    items: [
      { req: 'Final kilometrages and GPS positions for all seven locations', where: [{ label: 'Station header', href: '/stations/canterbury' }, { label: 'Vicinity inset', href: '/flood' }], status: 'pending', note: 'Chainages in italics, "provisional"; GPS shown as pending survey.' },
      { req: 'Threshold values and alert wording marked "pending confirmation"', where: [{ label: 'Rules', href: '/admin/rules' }], status: 'pending', note: 'Our wording carries a "draft" tag until MTS supplies theirs.' },
      { req: 'Nominated alert recipients and the 20-login user list', where: [{ label: 'Recipients', href: '/admin/recipients' }, { label: 'Users', href: '/admin/users' }], status: 'pending' },
      { req: '240 V GPO supply and the existing PVC outfall at Marrickville', where: [{ label: 'Marrickville elevation', href: '/stations/marrickville/installation' }], status: 'pending' },
      { req: 'Annexure A track diagrams and Annexure B documentation', where: [{ label: 'Corridor map', href: '/' }], status: 'pending', note: 'The map is schematic until the track diagrams are in hand.' },
      { req: 'PTZ camera live-feed URLs, authentication and network access', where: [{ label: 'PTZ feed', href: '/stations/canterbury' }], status: 'pending', note: 'The feed in the prototype is drawn, and says so.' },
      { req: 'Datasheet items: rainfall accuracy certificate, GMX300 +70 °C and IP ratings', where: [{ label: 'Installation → compliance', href: '/stations/belmore/installation' }], status: 'pending' },
      { req: 'YGRD-65-D rail EMC compliance; existing pump-panel interface points', where: [{ label: 'Equipment', href: '/stations/marrickville/installation' }, { label: 'Pump logic', href: '/stations/marrickville' }], status: 'pending' },
      { req: 'Cloud region, availability zones and data residency', where: [{ label: 'Hosting panel', href: '/health/pipeline' }], status: 'pending' },
    ],
  },
];

const STATUS: Record<Status, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  shown: { label: 'Shown', icon: CheckCircle2, cls: 'bg-sev-normal-tint text-sev-normal-strong' },
  pending: { label: 'Shown — values pending MTS', icon: CircleDashed, cls: 'bg-sev-info-tint text-sev-info-strong' },
  deviation: { label: 'Deliberate deviation', icon: TriangleAlert, cls: 'bg-sev-warning-tint text-sev-warning-strong' },
  outside: { label: 'Outside the portal', icon: MinusCircle, cls: 'bg-muted text-muted-foreground' },
};

export function CoveragePage() {
  const all = SECTIONS.flatMap((s) => s.items);
  const count = (st: Status) => all.filter((i) => i.status === st).length;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Requirements coverage</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every requirement of the proposal (OBS-MTS-M1-WX-2026-01) that touches the portal, and where to see it. Follow a
          link to check it on the screen.
        </p>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          The demo opens at 14:32 with the storm at its height. The <strong>demo time</strong> control (bottom right) plays it
          forward or jumps to each moment — the PTZ pop-up, the water trending down, the pumps stopping, the rain all-clear.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['shown', 'pending', 'deviation', 'outside'] as Status[]).map((st) => {
          const S = STATUS[st];
          return (
            <div key={st} className="rounded-lg border bg-card p-3">
              <p className="text-2xl font-semibold">{count(st)}</p>
              <p className={cn('mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', S.cls)}>
                <S.icon className="h-3 w-3" aria-hidden /> {S.label}
              </p>
            </div>
          );
        })}
      </div>

      {SECTIONS.map((sec) => (
        <section key={sec.id} className="min-w-0 rounded-lg border bg-card">
          <header className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{sec.title}</h2>
          </header>
          <ul className="divide-y">
            {sec.items.map((it) => {
              const S = STATUS[it.status];
              return (
                <li key={it.req} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-start md:gap-4">
                  <div className="min-w-0">
                    <p className="text-sm">{it.req}</p>
                    {it.note ? <p className="mt-0.5 text-xs text-muted-foreground">{it.note}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {it.where.map((w) => (
                      <Link
                        key={w.label + w.href}
                        href={w.href}
                        className="rounded-full border px-2.5 py-0.5 text-xs text-primary-strong hover:bg-primary/10"
                      >
                        {w.label} →
                      </Link>
                    ))}
                  </div>
                  <span className={cn('inline-flex items-center gap-1 justify-self-start rounded-full px-2 py-0.5 text-[11px] font-medium', S.cls)}>
                    <S.icon className="h-3 w-3" aria-hidden /> {S.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
