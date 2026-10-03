import type {
  ActivityEntry,
  AlertEvent,
  AlertRule,
  AuditEntry,
  EventsQuery,
  HealthFinding,
  HistoryQuery,
  HistoryRow,
  LiveReading,
  LocationId,
  Paged,
  ParameterId,
  PumpCommand,
  PumpCommandResult,
  PumpStationLive,
  Reading,
  Role,
  RuleVersion,
  Series,
  StationLive,
  StationLocation,
  StationStatus,
  Unit,
  User,
} from '@/lib/api/types';
import { STORM_DAY, now, sydneyAt } from './clock';
import { batteryPct, solarInputW, valueAt } from './generate/profiles';
import { simulatePumps } from './generate/pump-sim';
import { hash } from './generate/rng';
import { seededEvents } from './seed/events';
import { DEMO_USER, OTHER_ORG_USERS, ROLES, SUPER_USER, USERS } from './seed/people';

/** Who the prototype is signed in as — the shell and every attribution read this. */
export { DEMO_USER };
import { ALERT_RULES, RULE_HISTORY } from './seed/rules';
import { CAMPSIE_RADAR, WINDSOR_HANDOVER, campsieRadarOut } from './seed/incidents';
import { LOGGER_COUNT, STATIONS, STATIONS_BY_ID } from './seed/stations';
import { THRESHOLDS, THRESHOLD_LABELS } from './seed/thresholds';
import { getStore, mutate } from './store';

/**
 * The fake backend.
 *
 * Written as if it were `lib/api/endpoints.ts` — same function names, same return
 * shapes, same promises — because that is the whole point: when the real system
 * exists, `endpoints.ts` stops re-exporting this file and starts calling HTTP, and
 * nothing above the boundary changes.
 *
 * Nothing under `features/` or `components/` may import this module directly.
 */

/** When the level first crossed a set point, walking back over the same series. */
function findCrossing(locationId: LocationId, level: number, t: number): number | undefined {
  /* Whole minutes, one-minute steps — the same grid the event log searches, so
     the pump panel's "since 13:09" and the log's pump-start entry are the same
     minute rather than a minute apart. */
  const step = 60_000;
  const start = Math.floor((t - 6 * 3_600_000) / step) * step;
  for (let u = start; u <= t; u += step) {
    if ((valueAt('water_level', locationId, u) ?? 0) >= level) return u;
  }
  return undefined;
}

/** A little latency, so loading states are real rather than theoretical. */
function settle<T>(value: T, ms = 90 + Math.random() * 140): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const PARAMETER_LABELS: Record<ParameterId, string> = {
  rainfall: 'Rainfall',
  rain_1h: 'Rainfall — 1 h',
  rain_3h: 'Rainfall — 3 h',
  rain_3d: 'Rainfall — 3 days',
  rain_10m: 'Rainfall — 10 min',
  rain_6h: 'Rainfall — 6 h',
  rain_24h: 'Rainfall — 24 h',
  wind_dir: 'Wind direction',
  pressure: 'Barometric pressure',
  water_level: 'Water level',
  float_switch: 'Flood float switch',
  temperature: 'Air temperature',
  humidity: 'Relative humidity',
  wind_mean: 'Wind speed (mean)',
  wind_gust: 'Wind gust',
  battery: 'Battery',
  solar_input: 'Solar input',
};

export const PARAMETER_UNITS: Record<ParameterId, Unit> = {
  rainfall: 'mm/hr',
  rain_1h: 'mm',
  rain_3h: 'mm',
  rain_3d: 'mm',
  rain_10m: 'mm',
  rain_6h: 'mm',
  rain_24h: 'mm',
  wind_dir: '°',
  pressure: 'hPa',
  water_level: 'mm',
  float_switch: '',
  temperature: '°C',
  humidity: '%RH',
  wind_mean: 'km/h',
  wind_gust: 'km/h',
  battery: '%',
  solar_input: 'W',
};

// ── status ──────────────────────────────────────────────────────────────────

/** Where a reading sits against its rule. This is the only place that decides. */
export function statusFor(parameter: ParameterId, value: number | null): LiveReading['status'] {
  if (value === null) return 'missing';
  switch (parameter) {
    case 'rainfall':
      return value >= THRESHOLDS.rainfall.intensity.value ? 'alert' : value >= THRESHOLDS.rainfall.intensity.value * 0.8 ? 'warning' : 'normal';
    case 'water_level':
      /* Standing water is an alert in its own right (§7.3 — it is what asks for
         PTZ verification), at every flood point. Approaching it is a warning.
         This used to wait for the Marrickville pump-start line, which left
         Canterbury "OK" at +78 mm a minute before its standing-water alert. */
      if (value >= THRESHOLDS.flood.standingWaterMm) return 'alert';
      return value >= THRESHOLDS.flood.approachMm ? 'warning' : 'normal';
    case 'float_switch':
      return value === 1 ? 'alert' : 'normal';
    case 'temperature':
      if (value >= THRESHOLDS.temperature.heat2.value) return 'alert';
      return value >= THRESHOLDS.temperature.heat1.value ? 'warning' : 'normal';
    case 'wind_gust':
      if (value >= THRESHOLDS.wind.extreme.value) return 'alert';
      if (value >= THRESHOLDS.wind.gustAlert.value) return 'alert';
      return value >= THRESHOLDS.wind.gustWarn.value ? 'warning' : 'normal';
    case 'battery':
      return value <= THRESHOLDS.power.lowBatteryPct ? 'warning' : 'normal';
    default:
      return 'normal';
  }
}

function thresholdLabelFor(parameter: ParameterId, station: StationLocation): string | undefined {
  const F = THRESHOLDS.flood;
  switch (parameter) {
    case 'rainfall':
      return THRESHOLD_LABELS.rainIntensityFull;
    case 'water_level':
      /* Pump set points belong to the pump site alone. Every flood point is judged
         on standing water and the rail foot; only Marrickville has a pump-start. */
      return station.pumpStation
        ? `Standing water +${F.standingWaterMm} · pump-start +${F.pumpStartMm} · rail foot +${F.railFootMm} mm`
        : `Standing water +${F.standingWaterMm} (PTZ check) · rail foot +${F.railFootMm} mm (block line)`;
    case 'temperature':
      return `Threshold ${THRESHOLD_LABELS.tempHeat1} · alert ${THRESHOLD_LABELS.tempHeat2} (rising > 5 min)`;
    case 'wind_gust':
      return `Threshold ${THRESHOLD_LABELS.windGustPair} · block line ${THRESHOLD_LABELS.windExtreme}`;
    default:
      return undefined;
  }
}

const COMPASS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compass(deg: number): string {
  return COMPASS16[Math.round(deg / 22.5) % 16];
}

/** The line under a reading: what it is, and the context a controller reads it with. */
/** The bucket size set for a rain gauge in Admin → Sensors (0.2 mm as supplied). */
function bucketFor(sensorId: string): number {
  const store = getStore();
  return (
    (store.instrumentEdits.get(sensorId)?.bucketMm as number | undefined) ??
    store.addedInstruments.find((i) => i.sensorId === sensorId)?.bucketMm ??
    0.2
  );
}

function fmtSydneyTime(t: number): string {
  return new Date(t).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Australia/Sydney' });
}

function noteFor(parameter: ParameterId, sensorId: string, locationId: LocationId, t: number, value: number | null): string | undefined {
  if (value === null && parameter === 'water_level') {
    return `No radar data since ${fmtSydneyTime(CAMPSIE_RADAR.failedAt)} — comms fault (WO-0412). Flood alerting continues from the float switch.`;
  }
  switch (parameter) {
    case 'rainfall': {
      /* §5.1: the gauge counts 0.2 mm tips; the hour's tally is that many tips. */
      const bucket = bucketFor(sensorId);
      const tips = Math.round((value ?? 0) / bucket);
      return `${tips} tips this hour (${bucket} mm bucket) · 10 min ${valueAt('rain_10m', locationId, t)} · 6 h ${valueAt('rain_6h', locationId, t)} · 24 h ${valueAt('rain_24h', locationId, t)} mm`;
    }
    case 'float_switch': {
      // The float's own radar is the YGRD on the same mast.
      const radar = valueAt('water_level', locationId, t, sensorId.replace('RSF80', 'YGRD'));
      const trip = THRESHOLDS.flood.pumpStartMm - 5;
      if (radar === null) return `Trips at +${trip} mm · radar unavailable — the float is the live flood source`;
      const agree = (value === 1) === ((radar ?? 0) >= trip);
      return `Trips at +${trip} mm · radar +${radar} mm — ${agree ? 'agree' : 'DISAGREE, discrepancy alarm'}`;
    }
    case 'wind_mean': {
      const dir = valueAt('wind_dir', locationId, t);
      return `2-minute mean · from ${compass(dir ?? 0)} (${dir}°)`;
    }
    case 'wind_gust':
      return '3-second gust';
    case 'wind_dir':
      return value === null ? undefined : `From the ${compass(value)} — where the wind is blowing from`;
    case 'pressure': {
      const before = valueAt('pressure', locationId, t - 3 * 3_600_000) ?? 0;
      const d = Math.round(((value ?? 0) - before) * 10) / 10;
      return `${d < 0 ? 'Falling' : d > 0 ? 'Rising' : 'Steady'} ${Math.abs(d)} hPa in 3 h`;
    }
    default:
      return undefined;
  }
}

// ── series ──────────────────────────────────────────────────────────────────

/**
 * A series over a window. Downsampled at generation: seven days of one-minute data
 * is 10,080 points, which Recharts renders slowly and nobody can read.
 */
export function buildSeries(
  parameter: ParameterId,
  locationId: LocationId,
  from: number,
  to: number,
  maxPoints = 240,
  /** One sensor where a location has two of the same kind — the tunnel. */
  sensorId?: string,
): Reading[] {
  /* Samples fall on clean clock times — on the minute, the half hour, the
     hour — so a bar is "15:00–15:30" and its label says so, instead of
     "15:01" because that is when the page happened to open. The last point is
     always `to` itself, so the newest value on a chart is the live one. */
  const span = Math.max(1, to - from);
  const NICE = [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000, 3_600_000, 2 * 3_600_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000, 86_400_000];
  const raw = span / maxPoints;
  const step = NICE.find((n) => n >= raw) ?? NICE[NICE.length - 1];
  const points: Reading[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    const v = valueAt(parameter, locationId, t, sensorId);
    points.push({ t, v, status: statusFor(parameter, v) });
  }
  if (!points.length || points[points.length - 1].t < to) {
    const v = valueAt(parameter, locationId, to, sensorId);
    points.push({ t: to, v, status: statusFor(parameter, v) });
  }
  return points;
}

// ── stations ────────────────────────────────────────────────────────────────

function liveReadingsFor(locationId: LocationId, t: number): LiveReading[] {
  const station = STATIONS_BY_ID[locationId];
  /**
   * Keyed by SENSOR, not by parameter.
   *
   * Lady Game Drive is two independent units — up tunnel and down tunnel — that
   * the client asked to see as one place with two monitoring points. De-duplicating
   * by parameter silently threw the second one away, which is the difference
   * between "the tunnel is monitored" and "half the tunnel is monitored".
   */
  const seen = new Set<string>();
  const out: LiveReading[] = [];
  for (const sensor of station.sensors) {
    if (seen.has(sensor.sensorId + sensor.parameter)) continue;
    seen.add(sensor.sensorId + sensor.parameter);
    const value = valueAt(sensor.parameter, locationId, t, sensor.sensorId);
    out.push({
      parameter: sensor.parameter,
      sensorId: sensor.sensorId,
      value,
      unit: PARAMETER_UNITS[sensor.parameter],
      status: statusFor(sensor.parameter, value),
      thresholdLabel: thresholdLabelFor(sensor.parameter, station),
      note: noteFor(sensor.parameter, sensor.sensorId, locationId, t, value),
      updatedAt: t - (hash(sensor.sensorId) % 45) * 1000,
      // Per sensor: the tunnel's two points each draw their own trail.
      spark: buildSeries(sensor.parameter, locationId, t - 3 * 3_600_000, t, 40, sensor.sensorId),
    });
  }
  return out;
}

export function stationStatusFrom(readings: LiveReading[], online: boolean): StationStatus {
  if (!online) return 'offline';
  if (readings.some((r) => r.status === 'alert')) return 'alert';
  // A fitted sensor that has stopped answering degrades the station: it is not "OK".
  if (readings.some((r) => r.status === 'warning' || r.status === 'missing')) return 'warning';
  return 'normal';
}

/** Power telemetry comes from the generator, so every screen quotes one figure. */
function withLivePower(station: (typeof STATIONS)[number], t: number) {
  return {
    ...station,
    loggers: station.loggers.map((l) => ({
      ...l,
      batteryPct: batteryPct(l.id, t),
      solarInputW: solarInputW(l.id, t),
      charging: solarInputW(l.id, t) > 20,
      lastSeen: t - 30_000,
    })),
  };
}

/**
 * §7.5: when standing water is detected the affected station is flagged for PTZ
 * verification. Derived from the level, not pinned to one station — a badge that
 * blinks on a location reading well under its threshold is exactly the kind of
 * thing that teaches a control room to ignore badges.
 */
function cameraVerificationFor(station: StationLocation, readings: LiveReading[]): boolean {
  if (!station.cameraUrl) return false;
  return readings.some(
    (r) => r.parameter === 'water_level' && (r.value ?? 0) >= THRESHOLDS.flood.standingWaterMm,
  );
}

export async function listStations(): Promise<StationLive[]> {
  const t = now();
  return settle(
    STATIONS.map((station) => {
      const readings = liveReadingsFor(station.id, t);
      const online = station.loggers.every((l) => l.online);
      return {
        location: withLivePower(station, t),
        status: stationStatusFrom(readings, online),
        readings,
        cameraVerification: cameraVerificationFor(station, readings),
        updatedAt: t,
      };
    }),
  );
}

export async function getStation(id: LocationId): Promise<StationLive> {
  const t = now();
  const station = STATIONS_BY_ID[id];
  const readings = liveReadingsFor(id, t);
  return settle({
    location: withLivePower(station, t),
    status: stationStatusFrom(readings, station.loggers.every((l) => l.online)),
    readings,
    cameraVerification: cameraVerificationFor(station, readings),
    updatedAt: t,
  });
}

export function stationCount() {
  return { locations: STATIONS.length, loggers: LOGGER_COUNT };
}

// ── pumps ───────────────────────────────────────────────────────────────────

export async function getPumpStation(): Promise<PumpStationLive> {
  const t = now();
  const store = getStore();
  const duty = store.pumps.get('MKV-PUMP-DUTY')!;
  const standby = store.pumps.get('MKV-PUMP-STANDBY')!;

  /**
   * Unless someone has taken manual control, the pumps follow the water — duty
   * from pump-start, standby from high-high — because that is what the logic on
   * the OMC-048 does. Deriving it rather than storing it is what keeps this
   * screen, the flood screen and the event log telling the same story.
   */
  const level = valueAt('water_level', 'marrickville', t) ?? 0;
  const autoDuty = level >= THRESHOLDS.flood.pumpStartMm;
  const autoStandby = level >= THRESHOLDS.flood.highHighMm;
  const dutyState = duty.lastCommand ? duty.state : autoDuty ? 'running' : 'ready';
  const standbyState = standby.lastCommand ? standby.state : autoStandby ? 'running' : 'ready';
  const dutySince = findCrossing('marrickville', THRESHOLDS.flood.pumpStartMm, t);
  const standbySince = findCrossing('marrickville', THRESHOLDS.flood.highHighMm, t);

  /* The activity feed reads the event log and the pump simulation; it used to
     carry its own "rainfall 14 minutes ago" line that contradicted both. */
  const sim = simulatePumps(t);
  const todayRun = sim.days[sim.days.length - 1];
  const rainAlert = allEvents().find((e) => e.id === 'evt-rain-alert');
  const candidates: (ActivityEntry | null)[] = [
    standbySince
      ? { t: standbySince, text: `STANDBY pump started — level reached high-high +${THRESHOLDS.flood.highHighMm} mm`, severity: 'alert' as const }
      : null,
    dutySince
      ? { t: dutySince, text: `DUTY pump started — level crossed pump-start +${THRESHOLDS.flood.pumpStartMm} mm`, severity: 'alert' as const }
      : null,
    rainAlert ? { t: rainAlert.t, text: `Rainfall ≥ ${THRESHOLDS.rainfall.intensity.value} mm/hr — patrol alert issued`, severity: 'warning' as const } : null,
    sim.lastExercise
      ? { t: sim.lastExercise, text: 'Weekly exercise — both pumps ran for 2 minutes, run and flow confirmed', severity: 'information' as const }
      : null,
  ];
  const activity: ActivityEntry[] = candidates.filter((a): a is ActivityEntry => a !== null);
  if (duty.lastCommand) {
    activity.unshift({
      t: duty.lastCommand.at,
      text: `DUTY pump ${duty.lastCommand.action === 'start' ? 'START' : 'STOP'} issued manually by ${duty.lastCommand.by}`,
      severity: 'information',
      simulated: true,
    });
  }

  return settle({
    id: 'MKV-PUMP',
    label: 'Pump station',
    mode: duty.mode,
    state: dutyState === 'running' || standbyState === 'running' ? 'running' : dutyState,
    pumps: [
      {
        id: 'MKV-PUMP-DUTY',
        role: 'duty',
        state: dutyState,
        flowLps: dutyState === 'running' ? 60 : 0,
        runHoursToday: Math.round((todayRun.leadMin / 60) * 10) / 10,
        starts: todayRun.leadStarts,
        since: dutyState === 'running' ? dutySince ?? t - 6 * 60_000 : undefined,
      },
      {
        id: 'MKV-PUMP-STANDBY',
        role: 'standby',
        state: standbyState,
        flowLps: standbyState === 'running' ? 60 : 0,
        runHoursToday: Math.round((todayRun.lagMin / 60) * 10) / 10,
        starts: todayRun.lagStarts,
        since: standbyState === 'running' ? standbySince ?? undefined : undefined,
        lastRun: sim.lastExercise,
        note: standbyState === 'ready' ? 'armed' : 'assisting',
      },
    ],
    condition: { statorTempC: 78, waterInOil: 'dry', insulationMohm: 20, bearingTempC: 52 },
    setpoints: {
      pumpStartMm: THRESHOLDS.flood.pumpStartMm,
      highHighMm: THRESHOLDS.flood.highHighMm,
      railFootMm: THRESHOLDS.flood.railFootMm,
    },
    activity: activity.sort((a, b) => b.t - a.t),
  });
}

export async function setPumpMode(mode: PumpStationLive['mode']): Promise<void> {
  recordAudit('Control mode changed', `Marrickville — ${mode === 'manual' ? 'AUTO → MANUAL' : 'MANUAL → AUTO'}`, 'pump');
  mutate((s) => {
    s.pumps.forEach((p) => (p.mode = mode));
  });
  return settle(undefined, 120);
}

/**
 * A pump command.
 *
 * The prototype accepts the first step and reports the rest as awaiting
 * integration. Showing the chain the real system will have — issued, acknowledged
 * by the RTU, contactor closed, flow confirmed — turns a fake button into a
 * specification, and makes it impossible to read the result as "the pump started".
 */
export async function commandPump(cmd: PumpCommand): Promise<PumpCommandResult> {
  const t = now();
  mutate((s) => {
    const pump = s.pumps.get(cmd.pumpId);
    if (!pump) return;
    pump.state = cmd.action === 'start' ? 'running' : 'stopped';
    pump.lastCommand = { action: cmd.action, at: t, by: cmd.confirmedBy };
  });
  return settle({
    accepted: true,
    simulated: true,
    steps: [
      { step: 'issued', state: 'done', at: t },
      { step: 'acknowledged', state: 'not-integrated' },
      { step: 'contactor', state: 'not-integrated' },
      { step: 'flow', state: 'not-integrated' },
    ],
    message: `Simulated: ${cmd.action.toUpperCase()} accepted. No command is sent to any plant in this prototype.`,
  }, 400);
}

// ── alerts ──────────────────────────────────────────────────────────────────

export function allEvents(): AlertEvent[] {
  const t = now();
  const store = getStore();
  const events = [...seededEvents(t), ...store.injectedEvents];
  return events
    .map((e) => {
      const ack = store.acknowledged.get(e.id);
      return ack ? { ...e, acknowledgement: ack } : e;
    })
    .sort((a, b) => b.t - a.t);
}

export async function listEvents(q: EventsQuery = {}): Promise<Paged<AlertEvent>> {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;
  let items = allEvents();
  if (q.severity && q.severity !== 'all') items = items.filter((e) => e.severity === q.severity);
  if (q.unacknowledgedOnly) items = items.filter((e) => !e.acknowledgement && !e.autoCleared);
  if (q.locationId && q.locationId !== 'all') items = items.filter((e) => e.locationId === q.locationId);
  if (q.withinDays) items = items.filter((e) => e.t >= now() - q.withinDays! * 24 * 60 * 60_000);
  if (q.from) items = items.filter((e) => e.t >= q.from!);
  if (q.to) items = items.filter((e) => e.t <= q.to!);
  const total = items.length;
  return settle({
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}

/** Every standing-water event with a camera, for the map and the PTZ pop-up. */
export function cameraEvents(): AlertEvent[] {
  return allEvents().filter((e) => e.cameraUrl);
}

export async function getEvent(id: string): Promise<AlertEvent | undefined> {
  return settle(allEvents().find((e) => e.id === id));
}

export async function acknowledgeEvent(id: string): Promise<void> {
  mutate((s) => s.acknowledged.set(id, { by: DEMO_USER.name, at: now() }));
  return settle(undefined, 150);
}

export async function acknowledgeAll(): Promise<void> {
  const ids = allEvents().filter((e) => !e.acknowledgement && !e.autoCleared).map((e) => e.id);
  mutate((s) => ids.forEach((id) => s.acknowledged.set(id, { by: DEMO_USER.name, at: now() })));
  return settle(undefined, 200);
}

export function unacknowledgedCount(): number {
  return allEvents().filter((e) => !e.acknowledgement && !e.autoCleared && e.severity !== 'cleared').length;
}

export function activeAlertCount(): number {
  return allEvents().filter((e) => e.severity === 'alert' && !e.autoCleared && !e.acknowledgement).length;
}

/**
 * What the ticker carries.
 *
 * Not simply the newest alert: the banner is the instruction a controller acts
 * on, and the client's Figure 6 shows the rainfall patrol wording there. So an
 * unacknowledged alert that carries an operational instruction wins over a later
 * status line like "float WET confirmed".
 */
export function leadAlert(): AlertEvent | undefined {
  const active = allEvents().filter((e) => e.severity === 'alert' && !e.autoCleared && !e.acknowledgement);
  return active.find((e) => e.category === 'rainfall') ?? active.find((e) => e.category === 'flood') ?? active[0];
}

// ── rules ───────────────────────────────────────────────────────────────────

export async function listRules(): Promise<AlertRule[]> {
  const store = getStore();
  return settle(
    [...ALERT_RULES, ...store.addedRules].map((r) => ({
      ...r,
      ...(store.ruleEdits.get(r.id) as Partial<AlertRule> | undefined),
      enabled: store.ruleEnabled.get(r.id) ?? r.enabled,
    })),
  );
}

export async function setRuleEnabled(id: string, enabled: boolean): Promise<void> {
  const name = ruleName(id);
  recordAudit(enabled ? 'Rule enabled' : 'Rule disabled', name, 'rule');
  mutate((s) => s.ruleEnabled.set(id, enabled));
  publishVersion(`${name}: ${enabled ? 'enabled' : 'disabled'}`, [
    { rule: name, field: 'Enabled', from: enabled ? 'Off' : 'On', to: enabled ? 'On' : 'Off' },
  ]);
  return settle(undefined, 120);
}

export async function createRule(rule: AlertRule): Promise<void> {
  recordAudit('Rule created', rule.name || 'New rule', 'rule');
  mutate((s) =>
    s.addedRules.push({ ...rule, id: `rule-added-${s.addedRules.length + 1}`, draftWording: true }),
  );
  publishVersion(`${rule.name || 'New rule'}: added`, [{ rule: rule.name || 'New rule', field: 'Rule', from: '—', to: 'Added' }]);
  return settle(undefined, 250);
}

export async function saveRule(id: string, patch: Partial<AlertRule>): Promise<void> {
  const before = (await listRules()).find((r) => r.id === id);
  const name = ruleName(id);
  recordAudit('Rule edited', `${name} — changes validated and saved`, 'rule');
  mutate((s) => s.ruleEdits.set(id, { ...(s.ruleEdits.get(id) ?? {}), ...patch }));
  const changes = before ? diffRule(before, { ...before, ...patch }) : [];
  if (changes.length) publishVersion(`${name}: ${changes.map((c) => c.field.toLowerCase()).join(', ')} changed`, changes);
  return settle(undefined, 200);
}

/** The rule set's versions, newest first: this session's, then the seeded history. */
export async function listRuleVersions(): Promise<RuleVersion[]> {
  return settle([...getStore().ruleVersions, ...RULE_HISTORY.map((v) => ({ ...v, at: versionTime(v) }))], 120);
}

/** Who published the current version, when, and its number — the rules footer. */
export function currentRuleVersion(): { version: number; at: number; by: string } {
  const top = getStore().ruleVersions[0] ?? RULE_HISTORY[0];
  return { version: top.version, at: versionTime(top), by: top.by };
}

/**
 * "Restore" never rewrites history: the older table is published again as a new
 * version, so v5 restored becomes v9 and the audit says so.
 */
export async function restoreRuleVersion(version: number): Promise<void> {
  recordAudit('Rule set restored', `v${version} republished as a new version`, 'rule');
  publishVersion(`Restored v${version} — published as a new version`, [
    { rule: 'All rules', field: 'Table', from: `v${currentRuleVersion().version}`, to: `as v${version}` },
  ]);
  return settle(undefined, 220);
}

function versionTime(v: RuleVersion): number {
  if (typeof v.at === 'number') return v.at;
  const [d, h, m] = v.at;
  return sydneyAt(STORM_DAY, d, h, m);
}

function publishVersion(summary: string, changes: RuleVersion['changes']): void {
  mutate((s) =>
    s.ruleVersions.unshift({
      version: currentRuleVersion().version + 1,
      at: now(),
      by: shortName(DEMO_USER.name),
      summary,
      changes,
      session: true,
    }),
  );
}

function ruleName(id: string): string {
  return ALERT_RULES.find((r) => r.id === id)?.name ?? getStore().addedRules.find((r) => r.id === id)?.name ?? id;
}

/** Field-by-field, in the words the drawer uses — what a reviewer compares. */
function diffRule(a: AlertRule, b: AlertRule): RuleVersion['changes'] {
  const out: RuleVersion['changes'] = [];
  const add = (field: string, x: string, y: string) => x !== y && out.push({ rule: b.name, field, from: x || '—', to: y || '—' });
  const op = (r: AlertRule) => (r.operator === 'gte' ? '≥' : '≤');
  add('Threshold', `${op(a)} ${a.value} ${a.unit}`, `${op(b)} ${b.value} ${b.unit}`);
  add('Parameter', PARAMETER_LABELS[a.parameter], PARAMETER_LABELS[b.parameter]);
  add('Window', a.window, b.window);
  add('Severity', a.severity, b.severity);
  add('Dwell', a.dwell ?? '', b.dwell ?? '');
  add('Vigilance', a.vigilance ?? '', b.vigilance ?? '');
  add('Reset on re-trigger', a.resetOnRetrigger ? 'Yes' : 'No', b.resetOnRetrigger ? 'Yes' : 'No');
  add('Schedule', a.schedule ? `${a.schedule.from} → ${a.schedule.to}` : 'Always active', b.schedule ? `${b.schedule.from} → ${b.schedule.to}` : 'Always active');
  add('Locations', a.appliesTo.map((l) => STATIONS_BY_ID[l].name).join(', '), b.appliesTo.map((l) => STATIONS_BY_ID[l].name).join(', '));
  add('Message', a.message, b.message);
  add('Recipients', a.recipients.join(', '), b.recipients.join(', '));
  add('Channels', a.channels.join(', '), b.channels.join(', '));
  if (b.name !== a.name) out.push({ rule: a.name, field: 'Name', from: a.name, to: b.name });
  return out;
}

// ── people ──────────────────────────────────────────────────────────────────

export async function listRoles(): Promise<Role[]> {
  return settle([...ROLES, ...getStore().addedRoles], 120);
}

export async function createRole(role: Omit<Role, 'id'>): Promise<void> {
  recordAudit('Role created', `${role.name} — ${role.permissions.length} permissions`, 'role');
  mutate((s) =>
    s.addedRoles.push({ ...role, id: `custom-${s.addedRoles.length + 1}` as Role['id'] }),
  );
  return settle(undefined, 250);
}

/**
 * Mobile numbers for the seeded people, from ACMA's range reserved for fiction
 * (0491 570 xxx – 0491 579 xxx), so a demo screenshot never shows a number that
 * rings a real phone.
 */
const FICTIONAL_MOBILES = [
  '0491 570 156', '0491 570 157', '0491 570 158', '0491 570 159', '0491 570 110', '0491 570 313', '0491 570 737',
  '0491 571 266', '0491 571 491', '0491 571 804', '0491 572 549', '0491 572 665', '0491 572 983', '0491 573 770',
  '0491 573 087', '0491 574 118', '0491 574 632', '0491 575 254', '0491 575 789', '0491 576 398', '0491 576 801',
  '0491 577 426',
];

/** A sensible default: every channel in scope, alerts and warnings, no quiet hours. */
const DEFAULT_NOTIFY: NonNullable<User['notify']> = { channels: ['screen', 'push', 'email'], severities: ['alert', 'warning'] };

/** Who the prototype is signed in as: the MTS Administrator, or — via the demo dock — the Super User. */
export function actingUser(): User {
  return getStore().actingAs === 'super-user' ? SUPER_USER : DEMO_USER;
}

/**
 * The people in one organisation (MTS unless said otherwise), or — `'all'` — in
 * every organisation, as only the Super User sees them.
 */
export async function listUsers(scope: string | 'all' = 'mts'): Promise<User[]> {
  const store = getStore();
  const t = now();
  return settle(
    [...USERS, ...OTHER_ORG_USERS, ...store.addedUsers]
      .map((u) => ({ ...u, orgId: u.orgId ?? 'mts' }))
      .filter((u) => !store.removedUsers.has(u.id) && (scope === 'all' || u.orgId === scope))
      .map((u, i) => ({
        ...u,
        mobile: u.mobile ?? (u.status === 'invited' ? undefined : FICTIONAL_MOBILES[i % FICTIONAL_MOBILES.length]),
        notify: u.notify ?? (u.roles.includes('viewer') ? { channels: ['screen'], severities: ['alert'] } : DEFAULT_NOTIFY),
        ...(store.userEdits.get(u.id) as Partial<User> | undefined),
        /* Seeded logins are offsets from "now"; ones added in this session are
           already absolute, and must not be shifted again. */
        lastLogin: u.lastLogin && u.lastLogin < 0 ? t + u.lastLogin : u.lastLogin,
      })),
  );
}

export async function createUser(user: Omit<User, 'id'>): Promise<void> {
  recordAudit('User invited', `${user.name} — ${user.roles.join(', ')}${user.orgId && user.orgId !== 'mts' ? ` · organisation ${user.orgId}` : ''}`, 'user');
  mutate((s) => s.addedUsers.push({ ...user, id: `u-added-${s.addedUsers.length + 1}` }));
  return settle(undefined, 250);
}

export async function updateUser(id: string, patch: Partial<User>): Promise<void> {
  recordAudit('User edited', USERS.find((u) => u.id === id)?.name ?? id, 'user');
  mutate((s) => s.userEdits.set(id, { ...(s.userEdits.get(id) ?? {}), ...patch }));
  return settle(undefined, 200);
}

export async function removeUser(id: string): Promise<void> {
  recordAudit('User removed', `${USERS.find((u) => u.id === id)?.name ?? id} — audit history retained`, 'user');
  mutate((s) => s.removedUsers.add(id));
  return settle(undefined, 250);
}

export async function setUserStatus(id: string, status: User['status']): Promise<void> {
  recordAudit(status === 'suspended' ? 'User suspended' : 'User reinstated', USERS.find((u) => u.id === id)?.name ?? id, 'user');
  mutate((s) => s.userEdits.set(id, { ...(s.userEdits.get(id) ?? {}), status }));
  return settle(undefined, 150);
}

// ── health ──────────────────────────────────────────────────────────────────

export async function listHealth(): Promise<HealthFinding[]> {
  const t = now();
  const faultAt = CAMPSIE_RADAR.failedAt;
  /**
   * All five conditions §9 names appear, so the client can see what each one
   * looks like — a health screen that only ever shows the two that happen to be
   * active does not tell them what they are buying.
   */
  /* The battery finding reads the battery curve: when it went under the line
     and how low it got, rather than a figure typed into the text. */
  let lowSince: number | undefined;
  let lowMin = 100;
  for (let u = t - 18 * 3_600_000; u <= t; u += 5 * 60_000) {
    const b = batteryPct('LGD-DN-01', u);
    if (b < THRESHOLDS.power.lowBatteryPct && lowSince === undefined) lowSince = u;
    lowMin = Math.min(lowMin, b);
  }
  const findings: HealthFinding[] = [];
  if (campsieRadarOut(t)) {
    findings.push({
      locationId: 'campsie',
      locationName: STATIONS_BY_ID.campsie.name,
      loggerId: 'CAM-YGRD-01',
      condition: 'missing-sensor-data',
      since: faultAt,
      detail: `Radar level sensor has not reported since ${new Date(faultAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Australia/Sydney' })}. Alerting has fallen back to the float switch, and the alert wording now states the additional section covered. Work order WO-0412.`,
      severity: 'warning',
    });
  }
  findings.push(
    {
      locationId: 'lady-game-drive',
      locationName: STATIONS_BY_ID['lady-game-drive'].name,
      loggerId: 'LGD-DN-01',
      condition: 'low-battery',
      since: lowSince ?? t - 210 * 60_000,
      detail: `Down-tunnel battery fell to ${lowMin}% overnight, below the ${THRESHOLDS.power.lowBatteryPct}% leading-indicator threshold, and is back at ${batteryPct('LGD-DN-01', t)}% on solar. Held open until a maintainer acknowledges it — a battery that dipped once will dip again.`,
      severity: 'warning',
    },
    {
      locationId: 'windsor-road',
      locationName: STATIONS_BY_ID['windsor-road'].name,
      loggerId: 'WSR-01',
      condition: 'unresponsive',
      since: WINDSOR_HANDOVER.raisedAt,
      detail: `No telemetry for ${THRESHOLDS.silenceMinutes} minutes during a cellular handover. Reporting resumed; retained readings were backfilled from the logger.`,
      severity: 'information',
    },
  );
  /* An information finding ages off after six hours; one that has not happened yet is not shown. */
  return settle(
    findings.filter((f) => f.since <= t && (f.condition !== 'unresponsive' || t - f.since < 6 * 3_600_000)),
  );
}

// ── history ─────────────────────────────────────────────────────────────────

const INTERVAL_MS = { raw: 60_000, '10min': 600_000, '1h': 3_600_000, '1d': 86_400_000 };

export async function runHistoryQuery(q: HistoryQuery): Promise<Paged<HistoryRow>> {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;
  const step = INTERVAL_MS[q.interval];
  const rows: HistoryRow[] = [];

  for (let t = q.to; t >= q.from && rows.length < 4000; t -= step) {
    for (const locationId of q.locationIds) {
      const station = STATIONS_BY_ID[locationId];
      for (const parameter of q.parameters) {
        const sensor = station.sensors.find((s) => s.parameter === parameter);
        if (!sensor) continue;
        const value = valueAt(parameter, locationId, t);
        rows.push({
          t,
          locationId,
          locationName: station.name,
          parameter,
          parameterLabel: PARAMETER_LABELS[parameter],
          value,
          unit: PARAMETER_UNITS[parameter],
          status: statusFor(parameter, value),
          sensorId: sensor.sensorId,
        });
      }
    }
  }

  const total = rows.length;
  return settle({
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}

// ── audit ───────────────────────────────────────────────────────────────────

/** "Sarah Chen" → "S. Chen", the form the audit trail and alert log use. */
function shortName(name: string): string {
  const [first, ...rest] = name.split(' ');
  return `${first[0]}. ${rest.join(' ')}`;
}

/** Record an action taken in this session against the signed-in user. */
export function recordAudit(action: string, detail: string, category: AuditEntry['category']): void {
  const store = getStore();
  store.audit.push({ id: `s-${store.audit.length + 1}`, t: now(), actor: shortName(actingUser().name), action, detail, category });
}

/**
 * The audit trail (§8.4), assembled from the rest of the demo rather than
 * written beside it: acknowledgements come from the alert log with the same
 * people and times, sign-ins match each user's "last login", the pump entries
 * are the weekly exercise runs the pump history shows, and Campsie's maintenance
 * mode follows its 11:04 radar fault. An earlier version had its own list — with
 * an acknowledgement for an alert the Alerts screen showed as unacknowledged,
 * and a manual pump start at a level the water never reached that morning.
 */
export async function listAudit(): Promise<AuditEntry[]> {
  const t = now();
  const store = getStore();
  const day = (d: number, h: number, m = 0) => sydneyAt(STORM_DAY, d, h, m);
  const out: AuditEntry[] = [];

  // Acknowledgements, from the events themselves.
  for (const e of allEvents()) {
    if (e.acknowledgement && e.acknowledgement.at <= t) {
      out.push({
        id: `ack-${e.id}`,
        t: e.acknowledgement.at,
        actor: e.acknowledgement.by.includes('.') ? e.acknowledgement.by : shortName(e.acknowledgement.by),
        action: 'Alert acknowledged',
        detail: `${e.locationName} — ${e.message.length > 90 ? e.message.slice(0, 88) + '…' : e.message}`,
        category: 'alert',
      });
    }
  }

  // Sign-ins, matching "last login" on the Users screen.
  USERS.forEach((u, i) => {
    if (u.lastLogin && t + u.lastLogin <= t) {
      out.push({ id: `in-${u.id}`, t: t + u.lastLogin, actor: shortName(u.name), action: 'Signed in', detail: `MFA verified · 10.4.18.${20 + i}`, category: 'auth' });
    }
  });

  // The weekly pump exercise — the same runs as the pump history.
  for (const [d, who] of [
    [-2, 'A. Quinn'],
    [-9, 'O. Berg'],
  ] as const) {
    out.push(
      { id: `ex1${d}`, t: day(d, 9, 58), actor: who, action: 'Control mode changed', detail: 'Marrickville — AUTO → MANUAL for the weekly exercise', category: 'pump' },
      { id: `ex2${d}`, t: day(d, 10, 0), actor: who, action: 'Pump START (manual)', detail: 'Both pumps — MANUAL mode, confirmed. Exercise run, 2 minutes.', category: 'pump' },
      { id: `ex3${d}`, t: day(d, 10, 2), actor: who, action: 'Pump STOP (manual)', detail: 'Both pumps — run and flow confirmed', category: 'pump' },
      { id: `ex4${d}`, t: day(d, 10, 3), actor: who, action: 'Control mode changed', detail: 'Marrickville — MANUAL → AUTO', category: 'pump' },
    );
  }

  out.push(
    { id: 'm-campsie', t: day(0, 11, 41), actor: 'T. Reilly', action: 'Maintenance mode on', detail: 'Campsie — radar comms fault, technician on site; float switch remains live', category: 'maintenance' },
    { id: 'pw-smith-req', t: day(-4, 7, 12), actor: 'D. Smith', action: 'Password reset requested', detail: 'Self-service from the sign-in screen · Cloudflare check passed · link emailed', category: 'auth' },
    { id: 'pw-smith-done', t: day(-4, 7, 16), actor: 'D. Smith', action: 'Password changed', detail: 'Via the single-use reset link · other sessions signed out', category: 'auth' },
    { id: 'u-lee-fail', t: day(-12, 7, 52), actor: 'M. Lee', action: 'Sign-in failed', detail: 'Three attempts from 10.4.18.91 — account locked for 15 minutes', category: 'auth' },
    { id: 'u-lee', t: day(-11, 9, 15), actor: 'S. Chen', action: 'User suspended', detail: 'Mark Lee — access revoked, audit history retained', category: 'user' },
    { id: 'u-mensah', t: day(-2, 15, 20), actor: 'K. Fraser', action: 'User invited', detail: 'Kofi Mensah — Analyst / Reporting, all stations', category: 'user' },
    { id: 'u-role', t: day(-3, 16, 5), actor: 'K. Fraser', action: 'Role assigned', detail: 'Alex Quinn granted Pump Controller (Marrickville, Marrickville–Dulwich Hill)', category: 'role' },
    { id: 'u-export', t: t - 2 * 86_400_000 + 20 * 60_000, actor: 'A. Khan', action: 'Data exported', detail: 'Historical query — 4 locations, 30 days, 10-minute interval (CSV)', category: 'user' },
  );

  // Every published rule-set version — the same list the rules screen shows.
  for (const v of RULE_HISTORY) {
    out.push({ id: `r-v${v.version}`, t: versionTime(v), actor: v.by, action: `Rule set published (v${v.version})`, detail: v.summary, category: 'rule' });
  }
  for (const v of store.ruleVersions) {
    out.push({ id: `r-sv${v.version}`, t: versionTime(v), actor: v.by, action: `Rule set published (v${v.version})`, detail: v.summary, category: 'rule' });
  }

  // This session's own actions.
  store.pumps.forEach((p, id) => {
    if (!p.lastCommand) return;
    out.push({
      id: `cmd-${id}`,
      t: p.lastCommand.at,
      actor: shortName(p.lastCommand.by),
      action: `Pump ${p.lastCommand.action === 'start' ? 'START' : 'STOP'} (manual)`,
      detail: `${id} — MANUAL mode, confirmed. Simulated in this prototype.`,
      category: 'pump',
    });
  });
  store.acknowledged.forEach((a, id) => {
    const e = allEvents().find((x) => x.id === id);
    out.push({ id: `sack-${id}`, t: a.at, actor: shortName(a.by), action: 'Alert acknowledged', detail: e ? `${e.locationName} — ${e.message.slice(0, 88)}` : id, category: 'alert' });
  });
  out.push(...store.audit);

  return settle(out.filter((e) => e.t <= t).sort((a, b) => b.t - a.t));
}

export type { Series };
