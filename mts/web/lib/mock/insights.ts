import type {
  AlertRule,
  ChargeController,
  Instrument,
  InstrumentInput,
  InstrumentKind,
  Annotation,
  AvailabilityBudget,
  CalibrationItem,
  EventDelivery,
  ExceedanceBand,
  LocationId,
  LoggerStrip,
  WorkOrder,
  MaintenanceWindow,
  OutageRecord,
  ParameterId,
  PowerTrail,
  PumpDay,
  PumpProtection,
  QualityFlag,
  StaffGaugeCheck,
  Telemetry,
  MaintenanceState,
  Reading,
  RuleSimulation,
  VigilanceRule,
  VigilanceStatus,
  WindRoseBin,
} from '@/lib/api/types';
import { STORM_DAY, now, sydneyAt, sydneyDayStart } from './clock';
import {
  batteryPct,
  rainfallMmHr,
  solarInputW,
  valueAt,
  waterLevelMm,
  windDirDeg,
  windMeanKmh,
} from './generate/profiles';
import { hash, rngFrom } from './generate/rng';
import { simulatePumps } from './generate/pump-sim';
import { TALLY_STEP, rainGrid, tallyAt } from './generate/tallies';
import { PARAMETER_LABELS, allEvents, recordAudit, statusFor } from './api';
import { DEMO_USER } from './seed/people';
import { ALERT_RULES } from './seed/rules';
import { STATIONS, STATIONS_BY_ID } from './seed/stations';
import { THRESHOLDS } from './seed/thresholds';
import { CAMPSIE_RADAR, LGD_PANEL, RESPONSE_OBLIGATIONS, WINDSOR_HANDOVER, WORK_ORDERS } from './seed/incidents';
import { TERMINAL_FOR } from './seed/wiring';
import { getStore, mutate } from './store';

/**
 * The numbers behind the operational charts.
 *
 * Nothing here is written down. Every tally, band, run-hour and countdown is
 * computed from the same weather functions the trend charts draw — so the
 * vigilance countdown ends when the 1-hour tally actually fell below 25 mm, the
 * pump run-hours are the time the level actually spent above the start point,
 * and the corridor timeline shows red exactly where the chart line is red.
 * Everything a reviewer can cross-check agrees because it is one calculation,
 * not two that were made to match.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function settle<T>(value: T, ms = 160): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ── rainfall tallies ────────────────────────────────────────────────────────

const STEP = TALLY_STEP;

const RAIN_RULES = [
  { id: 'intensity' as const, label: 'Intensity', windowLabel: '1 hour', windowMs: HOUR, rule: THRESHOLDS.rainfall.intensity },
  { id: 'short' as const, label: 'Short accumulation', windowLabel: '3 hours', windowMs: 3 * HOUR, rule: THRESHOLDS.rainfall.short },
  { id: 'multiDay' as const, label: 'Multi-day', windowLabel: '3 days', windowMs: 3 * DAY, rule: THRESHOLDS.rainfall.multiDay },
];

/**
 * §7.2, the tally board: for each rule, where the rolling total is, whether it
 * is over the line, and — once it falls back — how long the vigilance has left.
 * A further qualifying burst inside the countdown restarts it from the top.
 */
function vigilanceFor(locationId: LocationId, t: number): VigilanceStatus {
  const end = Math.floor(t / STEP) * STEP;
  const g = rainGrid(locationId, end);
  const rules: VigilanceRule[] = RAIN_RULES.map(({ id, label, windowLabel, windowMs, rule }) => {
    const threshold = rule.value;
    const vigilanceMs = rule.vigilanceHours * HOUR;
    const from = Math.max(g.start + windowMs, end - vigilanceMs - DAY);

    let firstBreachAt: number | undefined;
    let belowAt: number | undefined;
    let endsAt: number | undefined;
    let resets = 0;
    let over = false;
    for (let u = from; u <= end; u += STEP) {
      const nowOver = tallyAt(g, u, windowMs) >= threshold;
      if (nowOver && !over) {
        // A new crossing inside a running countdown restarts it; otherwise it
        // is a new episode.
        if (endsAt !== undefined && u < endsAt) resets += 1;
        else {
          firstBreachAt = u;
          resets = 0;
        }
        belowAt = undefined;
        endsAt = undefined;
      }
      if (!nowOver && over) {
        belowAt = u;
        endsAt = u + vigilanceMs;
      }
      over = nowOver;
    }

    const tally = tallyAt(g, end, windowMs);
    const state: VigilanceRule['state'] = over
      ? 'breached'
      : endsAt !== undefined && t < endsAt
        ? 'vigilance'
        : 'clear';

    const trail: { t: number; v: number }[] = [];
    for (let u = end - DAY; u <= end; u += 15 * MIN) {
      trail.push({ t: u, v: Math.round(tallyAt(g, u, windowMs) * 10) / 10 });
    }

    return {
      id,
      label,
      windowLabel,
      thresholdMm: threshold,
      vigilanceHours: rule.vigilanceHours,
      tallyMm: Math.round(tally * 10) / 10,
      state,
      firstBreachAt,
      belowAt,
      endsAt,
      clearedAt: state === 'clear' && endsAt !== undefined ? endsAt : undefined,
      resets,
      trail,
    };
  });
  return { locationId, locationName: STATIONS_BY_ID[locationId].name, rules };
}

export async function getVigilance(): Promise<VigilanceStatus[]> {
  const t = now();
  const gauges = STATIONS.filter((s) => s.sensors.some((x) => x.parameter === 'rainfall'));
  return settle(gauges.map((s) => vigilanceFor(s.id, t)));
}

// ── rule dry run ────────────────────────────────────────────────────────────

const RAIN_WINDOW_MS: Record<AlertRule['window'], number> = {
  instant: HOUR,
  '1h-rolling': HOUR,
  '3h-rolling': 3 * HOUR,
  '3d-rolling': 3 * DAY,
};

/** "Rising > 5 min · falling < 38 °C > 10 min" → 5 and 10. "over 10 min" is a window, not a dwell. */
function parseDwell(dwell: string | undefined): { rise: number; clear: number } {
  if (!dwell || /over|after/i.test(dwell)) return { rise: 0, clear: 0 };
  const mins = [...dwell.matchAll(/(\d+)\s*min/gi)].map((m) => Number(m[1]));
  return { rise: mins[0] ?? 0, clear: mins[1] ?? 0 };
}

/**
 * §7.3 says every rule change is *validated* before it takes effect. The most
 * useful validation an administrator can have is this: run the draft rule over
 * the last day of stored readings and see when it would have fired — before it
 * is saved, not after the first false alarm. The same state machine as the live
 * engine: dwell before raising, a clear dwell before standing down, then the
 * vigilance countdown, restarted by a re-trigger where the rule says so.
 *
 * In the real build this is a dry-run call against the database; here it reads
 * the same weather functions every chart draws, so its answer can be checked
 * against the trend screens by eye.
 */
export function simulateRule(rule: AlertRule, locationId: LocationId, hours = 24): RuleSimulation {
  const step = 5 * MIN;
  const to = Math.floor(now() / step) * step;
  const from = to - hours * HOUR;
  const station = STATIONS_BY_ID[locationId];
  const base: ParameterId = rule.group === 'rainfall' ? 'rainfall' : rule.parameter;
  const { rise, clear } = parseDwell(rule.dwell);
  const vigilanceHours = Number(/(\d+(?:\.\d+)?)\s*h/i.exec(rule.vigilance ?? '')?.[1] ?? 0);
  const blank: RuleSimulation = {
    locationId, metric: PARAMETER_LABELS[base], unit: rule.unit, parameter: base, points: [], from, to,
    fires: [], resets: [], inForce: [], vigilance: [], peak: null, dwellMin: rise, clearDwellMin: clear, vigilanceHours,
  };
  if (!station.sensors.some((x) => x.parameter === base)) {
    return { ...blank, note: `${station.name} has no ${PARAMETER_LABELS[base].toLowerCase()} sensor fitted — this rule cannot fire there.` };
  }

  /* What the rule actually compares, and how it is drawn. */
  const isRate = rule.parameter === 'water_level' && rule.unit === 'mm/hr';
  const isFalling = rule.parameter === 'water_level' && rule.operator === 'lte';
  const level = (u: number) => valueAt('water_level', locationId, u);
  let metric: string;
  let read: (u: number) => number | null;
  if (rule.group === 'rainfall') {
    const w = RAIN_WINDOW_MS[rule.window];
    const g = rainGrid(locationId, to);
    metric = `${{ [HOUR]: '1-hour', [3 * HOUR]: '3-hour', [3 * DAY]: '3-day' }[w]} rolling rainfall`;
    read = (u) => Math.round(tallyAt(g, u, w) * 10) / 10;
  } else if (isRate) {
    metric = 'Rate of rise (10-min)';
    read = (u) => {
      const a = level(u);
      const b = level(u - 10 * MIN);
      return a === null || b === null ? null : Math.round((a - b) * 6);
    };
  } else {
    metric = isFalling ? 'Water level (falling after a block)' : PARAMETER_METRIC[rule.parameter] ?? rule.parameter;
    read = (u) => valueAt(rule.parameter, locationId, u);
  }

  /* The trending-down rule is armed by a block — water over the rail foot —
     and fires once the level has fallen for ten minutes; it stands down when
     the water is back below standing-water level. */
  let armed = false;
  let armedAt: number | undefined;
  const condition = (u: number, v: number | null): boolean => {
    if (v === null) return false;
    if (isFalling) {
      if (v >= THRESHOLDS.flood.railFootMm && !armed) {
        armed = true;
        armedAt = u;
      }
      const prev = level(u - 10 * MIN);
      return armed && prev !== null && v < prev;
    }
    return rule.operator === 'gte' ? v >= rule.value : v <= rule.value;
  };

  const points: Reading[] = [];
  const fires: number[] = [];
  const resets: number[] = [];
  const inForce: { from: number; to: number }[] = [];
  const vigilance: { from: number; to: number }[] = [];
  let state: 'idle' | 'active' | 'vigilance' = 'idle';
  let pendingSince: number | undefined;
  let clearingSince: number | undefined;
  let activeFrom = 0;
  let vigFrom = 0;
  let vigEnd = 0;
  let peak: RuleSimulation['peak'] = null;

  /* Warm up over the preceding window, so a rule already in force when the
     chart begins is drawn in force from its left edge, not raised at it. */
  const warm = from - Math.max(vigilanceHours * HOUR, 2 * HOUR);
  for (let u = warm; u <= to; u += step) {
    const v = read(u);
    const shown = u >= from;
    if (shown) {
      points.push({ t: u, v, status: statusFor(base, v) });
      if (v !== null && (!peak || (isFalling || rule.operator === 'lte' ? v < peak.v : v > peak.v))) peak = { t: u, v };
    }
    const met = condition(u, v);
    if (state === 'active') {
      if (met) clearingSince = undefined;
      else {
        clearingSince ??= u;
        const stillWet = isFalling && v !== null && v >= THRESHOLDS.flood.standingWaterMm;
        if (u - clearingSince >= clear * MIN && !stillWet) {
          inForce.push({ from: activeFrom, to: u });
          if (isFalling) armed = false;
          if (vigilanceHours) {
            state = 'vigilance';
            vigFrom = u;
            vigEnd = u + vigilanceHours * HOUR;
          } else state = 'idle';
          clearingSince = undefined;
        }
      }
      continue;
    }
    if (state === 'vigilance' && u >= vigEnd) {
      vigilance.push({ from: vigFrom, to: vigEnd });
      state = 'idle';
    }
    if (met) {
      pendingSince ??= u;
      if (u - pendingSince >= rise * MIN) {
        if (state === 'vigilance') {
          vigilance.push({ from: vigFrom, to: u });
          if (rule.resetOnRetrigger) {
            if (shown) resets.push(u);
          } else if (shown) fires.push(u);
        } else if (shown) fires.push(u);
        state = 'active';
        activeFrom = u;
        pendingSince = undefined;
      }
    } else pendingSince = undefined;
  }
  if (state === 'active') inForce.push({ from: activeFrom, to });
  if (state === 'vigilance') vigilance.push({ from: vigFrom, to: Math.min(vigEnd, to) });

  const clip = (b: { from: number; to: number }) => ({ from: Math.max(b.from, from), to: Math.min(b.to, to) });
  const note =
    locationId === 'campsie' && rule.parameter === 'water_level' && points.some((p) => p.v === null)
      ? 'A gap in Campsie\u2019s line is its radar fault (WO-0412), not dry track — the float switch and the alternate source covered it (§7.4).'
      : undefined;

  return {
    ...blank,
    metric,
    unit: isRate ? 'mm/hr' : rule.group === 'rainfall' ? 'mm' : rule.unit,
    parameter: rule.group === 'rainfall' ? 'rain_1h' : rule.parameter,
    points,
    fires,
    resets,
    inForce: inForce.map(clip).filter((b) => b.to > b.from),
    vigilance: vigilance.map(clip).filter((b) => b.to > b.from),
    peak,
    armedAt: isFalling && armed ? armedAt : undefined,
    note,
  };
}

const PARAMETER_METRIC: Partial<Record<ParameterId, string>> = {
  water_level: 'Water level',
  temperature: 'Air temperature',
  wind_gust: 'Wind gust (3-s)',
  wind_mean: 'Wind speed (2-min mean)',
};

/** Rainfall by hour for one gauge, `days` back — the heatmap's grid. */
export async function rainfallByHour(locationId: LocationId, days = 14): Promise<{ day: number; hours: number[] }[]> {
  const t = now();
  const today = sydneyDayStart(t);
  const rows: { day: number; hours: number[] }[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = today - d * DAY;
    const hours: number[] = [];
    for (let h = 0; h < 24; h++) {
      const hs = dayStart + h * HOUR;
      if (hs > t) {
        hours.push(Number.NaN);
        continue;
      }
      let mm = 0;
      for (let u = hs; u < hs + HOUR && u <= t; u += STEP) mm += (rainfallMmHr(locationId, u) * STEP) / HOUR;
      hours.push(Math.round(mm * 10) / 10);
    }
    rows.push({ day: dayStart, hours });
  }
  return settle(rows, 220);
}

// ── corridor exceedance timeline ─────────────────────────────────────────────

const WATCHED: ParameterId[] = ['rainfall', 'water_level', 'wind_gust', 'temperature'];
const PARAM_WORD: Partial<Record<ParameterId, string>> = {
  rainfall: 'Rainfall',
  water_level: 'Water level',
  wind_gust: 'Wind gust',
  temperature: 'Heat',
};

/**
 * When was each location over which line? Uses `statusFor` — the same judgement
 * that colours a reading card — so a band on this timeline is exactly the period
 * a card for that sensor would have shown amber or red.
 */
export async function corridorExceedance(hours = 24): Promise<{ from: number; to: number; bands: ExceedanceBand[] }> {
  const t = now();
  const from = t - hours * HOUR;
  const step = Math.max(5 * MIN, Math.round((hours * HOUR) / 288));
  const bands: ExceedanceBand[] = [];
  for (const station of STATIONS) {
    const sensors = station.sensors.filter((s) => WATCHED.includes(s.parameter));
    for (const sensor of sensors) {
      let open: ExceedanceBand | null = null;
      for (let u = from; u <= t; u += step) {
        const v = valueAt(sensor.parameter, station.id, u, sensor.sensorId);
        const st = statusFor(sensor.parameter, v);
        const sev = st === 'alert' || st === 'warning' ? st : null;
        if (open && (sev !== open.severity || u + step > t)) {
          open.to = u;
          bands.push(open);
          open = null;
        }
        if (sev && !open) {
          const where = sensor.sensorId.includes('-UP-') ? ' (up)' : sensor.sensorId.includes('-DN-') ? ' (down)' : '';
          open = { locationId: station.id, from: u, to: u, severity: sev, label: `${PARAM_WORD[sensor.parameter]}${where}` };
        }
      }
    }
  }
  return settle({ from, to: t, bands }, 200);
}

// ── wind rose ────────────────────────────────────────────────────────────────

/** Speed bands for the rose, km/h. The top band starts where warnings begin. */
export const ROSE_BANDS = [
  { from: 0, to: 10, label: '< 10' },
  { from: 10, to: 20, label: '10–20' },
  { from: 20, to: 30, label: '20–30' },
  { from: 30, to: 45, label: '30–45' },
  { from: 45, to: Infinity, label: '≥ 45' },
];

export async function windRose(locationId: LocationId, days = 7): Promise<{ bins: WindRoseBin[]; calmPct: number; samples: number }> {
  const t = now();
  const sectors = 16;
  const counts = Array.from({ length: sectors }, () => ROSE_BANDS.map(() => 0));
  let samples = 0;
  let calm = 0;
  for (let u = t - days * DAY; u <= t; u += 10 * MIN) {
    const speed = windMeanKmh(locationId, u);
    samples += 1;
    if (speed < 2) {
      calm += 1;
      continue;
    }
    const dir = windDirDeg(locationId, u);
    const sector = Math.round(dir / (360 / sectors)) % sectors;
    const band = ROSE_BANDS.findIndex((b) => speed >= b.from && speed < b.to);
    counts[sector][band] += 1;
  }
  const bins = counts.map((bands, i) => ({ dirDeg: i * (360 / sectors), bands: bands.map((c) => c / samples) }));
  return settle({ bins, calmPct: (calm / samples) * 100, samples }, 200);
}

// ── alert delivery ───────────────────────────────────────────────────────────

/**
 * How each alert actually reached people. §7.1 obliges delivery within 5 minutes
 * for weather and 30 for a system fault; §8.2 says delivery is confirmed and
 * retried on failure. Both are visible here, per channel.
 */
export function deliveryFor(eventId: string, t: number, category: string): EventDelivery {
  const rng = rngFrom(hash(`delivery:${eventId}`));
  const fault = category === 'fault' || category === 'power';
  const screenS = 2 + rng() * 10;
  const pushS = 8 + rng() * 40;
  const emailRetry = rng() < 0.2;
  const emailS = 25 + rng() * 150 + (emailRetry ? 60 : 0);
  return {
    eventId,
    slaMinutes: fault ? THRESHOLDS.deliveryMinutes.systemFault : THRESHOLDS.deliveryMinutes.weather,
    attempts: [
      { channel: 'screen', queuedAt: t, deliveredAt: t + screenS * 1000, attempts: 1, state: 'delivered', recipients: 9 },
      { channel: 'push', queuedAt: t, deliveredAt: t + pushS * 1000, attempts: 1, state: 'delivered', recipients: 6 },
      {
        channel: 'email',
        queuedAt: t,
        deliveredAt: t + emailS * 1000,
        attempts: emailRetry ? 2 : 1,
        state: emailRetry ? 'retried' : 'delivered',
        recipients: 14,
        note: emailRetry ? 'First attempt deferred by the receiving server; delivered on retry.' : undefined,
      },
      {
        channel: 'sms',
        queuedAt: t,
        attempts: 0,
        state: 'not-in-scope',
        recipients: 0,
        note: 'SMS is replaced by web push in Rev B §10 — pending MTS confirmation.',
      },
    ],
  };
}

export async function getDelivery(eventId: string): Promise<EventDelivery | undefined> {
  const e = allEvents().find((x) => x.id === eventId);
  return settle(e ? deliveryFor(e.id, e.t, e.category) : undefined, 120);
}

/** Every alert in the window, as seconds to deliver per channel. */
export async function deliveryStats(days = 30): Promise<{
  channel: 'screen' | 'push' | 'email';
  seconds: number[];
  withinSla: number;
  total: number;
}[]> {
  const t = now();
  const events = allEvents().filter((e) => e.t >= t - days * DAY && e.severity !== 'cleared');
  const out = (['screen', 'push', 'email'] as const).map((channel) => {
    const seconds: number[] = [];
    let within = 0;
    for (const e of events) {
      const d = deliveryFor(e.id, e.t, e.category);
      const a = d.attempts.find((x) => x.channel === channel)!;
      const s = ((a.deliveredAt ?? a.queuedAt) - a.queuedAt) / 1000;
      seconds.push(s);
      if (s <= d.slaMinutes * 60) within += 1;
    }
    return { channel, seconds: seconds.sort((a, b) => a - b), withinSla: within, total: seconds.length };
  });
  return settle(out, 180);
}

// ── annotations ──────────────────────────────────────────────────────────────

/** Seeded notes, so the annotation thread is not empty on first look. */
function seededAnnotations(): Annotation[] {
  const rail = allEvents().find((e) => e.id === 'evt-rail-foot');
  const rain = allEvents().find((e) => e.id === 'evt-rain-alert');
  const out: Annotation[] = [];
  if (rain) {
    out.push({
      id: 'n-rain-1',
      eventId: rain.id,
      by: 'James Okoro',
      at: rain.t + 4 * MIN,
      text: 'CJC-T patrol requested through OCC. First train out of Hurlstone Park at reduced speed.',
    });
  }
  if (rail) {
    out.push({
      id: 'n-rail-1',
      eventId: rail.id,
      by: 'James Okoro',
      at: rail.t + 3 * MIN,
      text: 'Line blocked between Marrickville and Dulwich Hill. NCO informed by phone.',
    });
  }
  return out.filter((n) => n.at <= now());
}

export async function listAnnotations(eventId: string): Promise<Annotation[]> {
  const added = getStore().annotations.filter((a) => a.eventId === eventId);
  return settle([...seededAnnotations().filter((a) => a.eventId === eventId), ...added].sort((a, b) => a.at - b.at), 100);
}

export async function addAnnotation(eventId: string, text: string): Promise<void> {
  const e = allEvents().find((x) => x.id === eventId);
  recordAudit('Note added', `${e?.locationName ?? eventId} — “${text.length > 70 ? text.slice(0, 68) + '…' : text}”`, 'alert');
  mutate((s) =>
    s.annotations.push({ id: `n-${s.annotations.length + 1}`, eventId, by: DEMO_USER.name, at: now(), text }),
  );
  return settle(undefined, 150);
}

// ── availability, §9 ─────────────────────────────────────────────────────────

/**
 * Unplanned downtime against the two §9 limits: not inoperable for more than
 * 12 hours in any 6 months, and no more than 24 hours in any 12. The outages the
 * rest of the demo already mentions are here with the same times — the tunnel
 * carrier outage five days ago, Windsor Road's cellular handover today.
 */
function outagesFor(loggerId: string, locationId: LocationId, t: number): OutageRecord[] {
  const day = (d: number, h: number, m = 0) => sydneyAt(STORM_DAY, d, h, m);
  const known: Record<string, OutageRecord[]> = {
    'LGD-UP-01': [
      { loggerId, locationId, from: day(-5, 2, 14), hours: 47 / 60, cause: 'Cellular carrier outage', planned: false },
      { loggerId, locationId, from: day(-140, 9, 0), hours: 6.5, cause: 'Solar charge controller replaced', planned: false },
    ],
    'WSR-01': [
      { loggerId, locationId, from: WINDSOR_HANDOVER.from, hours: WINDSOR_HANDOVER.minutes / 60, cause: 'Cellular handover', planned: false },
      { loggerId, locationId, from: day(-230, 13, 0), hours: 9.2, cause: 'Lightning strike — surge protector replaced', planned: false },
    ],
    'CAM-01': [{ loggerId, locationId, from: day(-60, 22, 0), hours: 3.1, cause: 'Enclosure door switch fault', planned: false }],
  };
  const rng = rngFrom(hash(`outage:${loggerId}`));
  const extra: OutageRecord[] = [];
  const count = Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    extra.push({
      loggerId,
      locationId,
      from: day(-Math.floor(20 + rng() * 330), Math.floor(rng() * 23)),
      hours: Math.round((0.2 + rng() * 2.4) * 10) / 10,
      cause: ['Cellular coverage', 'Logger restart after firmware update', 'Radar sensor comms timeout'][Math.floor(rng() * 3)],
      planned: false,
    });
  }
  // The yearly 36-hour window, planned and so excluded from the budget.
  const planned: OutageRecord = { loggerId, locationId, from: day(-180, 22), hours: 36, cause: 'Annual maintenance (weekend possession)', planned: true };
  return [...(known[loggerId] ?? []), ...extra, planned].filter((o) => o.from <= t).sort((a, b) => b.from - a.from);
}

/**
 * The availability strip, from the record rather than drawn: a cell is grey
 * where the logger was silent (an outage above), amber where it was reporting
 * but one of its sensors was not — Campsie's radar since 10:58 — and green
 * otherwise. An earlier strip painted four amber cells "an hour ago" for a fault
 * that had in fact been running for three and a half hours.
 */
export function loggerStrips(hours = 24, cellMin = 20): LoggerStrip[] {
  const t = now();
  const cell = cellMin * MIN;
  const end = Math.ceil(t / cell) * cell;
  const start = end - hours * HOUR;
  return STATIONS.flatMap((station) =>
    station.loggers.map((logger) => {
      const outages = outagesFor(logger.id, station.id, t);
      const prefix = logger.id.replace(/-\d+$/, '-');
      const sensors = station.sensors.filter((x) => x.sensorId.startsWith(prefix));
      const cells: LoggerStrip['cells'] = [];
      for (let u = start; u < end; u += cell) {
        const to = Math.min(u + cell, t);
        if (u >= t) break;
        const out = outages.find((o) => o.from < to && o.from + o.hours * HOUR > u);
        if (out) {
          cells.push({ from: u, to, state: 'silent', note: out.cause });
          continue;
        }
        const missing = sensors.find((x) => [u, (u + to) / 2, to - MIN].some((s) => valueAt(x.parameter, station.id, s, x.sensorId) === null));
        cells.push(
          missing
            ? { from: u, to, state: 'partial', note: `${missing.model.split(' (')[0]} not reporting` }
            : { from: u, to, state: 'ok' },
        );
      }
      return { loggerId: logger.id, locationId: station.id, cells };
    }),
  );
}

/**
 * Work orders as they stand at the demo's "now": a step finished later than now
 * is shown as still due, so jumping the clock forward closes Campsie's order at
 * 07:52 tomorrow exactly when its "restored" event appears in the log.
 */
export async function workOrders(): Promise<WorkOrder[]> {
  const t = now();
  const O = RESPONSE_OBLIGATIONS;
  const due = { response: O.responseH, investigation: O.investigationH, repair: O.repairH };
  const label = { response: 'Response', investigation: 'On-site investigation', repair: 'Repair' };
  return settle(
    WORK_ORDERS.filter((w) => w.raisedAt <= t)
      .map((w) => ({
        id: w.id,
        locationId: w.locationId,
        locationName: STATIONS_BY_ID[w.locationId].name,
        loggerId: w.loggerId,
        title: w.title,
        kind: w.kind,
        raisedAt: w.raisedAt,
        assignee: w.assignee,
        eventId: w.eventId,
        steps: w.steps.map((s) => ({
          key: s.key,
          label: label[s.key],
          dueAt: w.kind === 'fault' ? w.raisedAt + due[s.key] * HOUR : undefined,
          doneAt: s.doneAt <= t ? s.doneAt : undefined,
          note: s.doneAt <= t ? s.note : undefined,
        })),
        closedAt: w.closedAt <= t ? w.closedAt : undefined,
      }))
      .sort((a, b) => Number(Boolean(a.closedAt)) - Number(Boolean(b.closedAt)) || b.raisedAt - a.raisedAt),
  );
}

export async function availabilityBudgets(): Promise<AvailabilityBudget[]> {
  const t = now();
  const out: AvailabilityBudget[] = [];
  for (const station of STATIONS) {
    for (const logger of station.loggers) {
      const outages = outagesFor(logger.id, station.id, t);
      const unplanned = outages.filter((o) => !o.planned);
      out.push({
        loggerId: logger.id,
        locationId: station.id,
        label: station.loggers.length > 1 ? `${station.name} — ${logger.label}` : station.name,
        hours12m: Math.round(unplanned.filter((o) => o.from >= t - 365 * DAY).reduce((a, o) => a + o.hours, 0) * 10) / 10,
        longest6m: Math.round(Math.max(0, ...unplanned.filter((o) => o.from >= t - 182 * DAY).map((o) => o.hours)) * 10) / 10,
        outages,
      });
    }
  }
  return settle(out, 160);
}

// ── calibration, §9 and §11.1 ────────────────────────────────────────────────

const CAL_INTERVAL_MONTHS: Partial<Record<ParameterId, number>> = {
  rainfall: 12,
  water_level: 12,
  float_switch: 24,
  temperature: 24,
  humidity: 24,
  wind_mean: 24,
};

/** One instrument's calibration — shared by the calibration list and the sensor register. */
function calibrationFor(sensorId: string, parameter: ParameterId, t: number): { last: number; due: number; certificate: string } {
  const months = CAL_INTERVAL_MONTHS[parameter] ?? 12;
  const rng = rngFrom(hash(`cal:${sensorId}`));
  // Seeded so that most are current, a few are coming due, and one is late —
  // which is the situation a maintenance screen actually has to handle.
  const ageDays =
    sensorId === 'CAM-YGRD-01' ? months * 30.4 + 12 : sensorId === 'BEL-RIMCO-01' ? months * 30.4 - 20 : 30 + rng() * (months * 30.4 - 90);
  const last = t - ageDays * DAY;
  return { last, due: last + months * 30.4 * DAY, certificate: `CAL-${new Date(last).getFullYear()}-${String((hash(sensorId) % 9000) + 1000)}` };
}

export async function calibrationSchedule(): Promise<CalibrationItem[]> {
  const t = now();
  const seen = new Set<string>();
  const items: CalibrationItem[] = [];
  for (const station of STATIONS) {
    for (const s of station.sensors) {
      if (seen.has(s.sensorId) || s.parameter === 'wind_gust' || s.parameter === 'humidity') continue;
      seen.add(s.sensorId);
      const c = calibrationFor(s.sensorId, s.parameter, t);
      items.push({
        sensorId: s.sensorId,
        locationId: station.id,
        instrument: s.model,
        lastCalibrated: c.last,
        dueAt: c.due,
        certificate: c.certificate,
        state: c.due < t ? 'overdue' : c.due - t < 45 * DAY ? 'due-soon' : 'current',
      });
    }
  }
  return settle(items.sort((a, b) => a.dueAt - b.dueAt), 140);
}

// ── data quality, §8.2 ───────────────────────────────────────────────────────

/**
 * Readings the validation module refused to trust. Each is a real reason from
 * §8.2 — range, rate of change, a frozen value, a failed cross-check — and each
 * one's time matches the event history where the two overlap.
 */
export async function qualityFlags(): Promise<QualityFlag[]> {
  const day = (d: number, h: number, m = 0) => sydneyAt(STORM_DAY, d, h, m);
  const flags: QualityFlag[] = [
    {
      id: 'q1',
      t: day(0, 10, 58),
      locationId: 'campsie',
      sensorId: 'CAM-YGRD-01',
      parameter: 'water_level',
      value: 31,
      rule: 'frozen',
      detail: 'Identical reading for 6 consecutive polls, then no response. Alerting moved to the float switch.',
      action: 'quarantined',
    },
    {
      id: 'q2',
      t: day(0, 9, 14),
      locationId: 'marrickville-dulwich-hill',
      sensorId: 'MDH-YGRD-01',
      parameter: 'water_level',
      value: 1480,
      rule: 'range',
      detail: 'Single reading of +1,480 mm between two of +33 mm — above the radar’s plausible range for this site.',
      action: 'quarantined',
    },
    {
      id: 'q3',
      t: day(-1, 11, 40),
      locationId: 'belmore',
      sensorId: 'BEL-RIMCO-01',
      parameter: 'rainfall',
      value: 96,
      rule: 'rate-of-change',
      detail: '96 mm/hr for one minute on a dry day — 48 bucket tips during the scheduled gauge cleaning.',
      action: 'quarantined',
    },
    {
      id: 'q4',
      t: day(-4, 3, 20),
      locationId: 'lady-game-drive',
      sensorId: 'LGD-DN-YGRD-01',
      parameter: 'water_level',
      value: 12,
      rule: 'cross-check',
      detail: 'Radar +12 mm while the float reported WET for 4 minutes. Float found fouled with debris; radar confirmed correct.',
      action: 'flagged',
    },
    {
      id: 'q5',
      t: day(-9, 16, 5),
      locationId: 'windsor-road',
      sensorId: 'WSR-WS-01',
      parameter: 'wind_gust',
      value: 212,
      rule: 'rate-of-change',
      detail: 'Gust of 212 km/h between 3-second samples of 30 km/h — a bird on the sensor head.',
      action: 'quarantined',
    },
  ];
  return settle(flags.filter((f) => f.t <= now()), 140);
}

// ── pumps, §5.6 ──────────────────────────────────────────────────────────────

/**
 * Pump running history by simulating the OMC-048's own logic over the level
 * curve: lead pump on at L-start, lag pump on at L-lag, both off at L-stop after
 * the minimum run time, and the lead alternating each cycle. The weekly exercise
 * runs are added on top — the audit trail records the latest one.
 */
export async function pumpHistory(days = 30): Promise<{ days: PumpDay[]; totals: { pump1H: number; pump2H: number } }> {
  const sim = simulatePumps(now(), days);
  const list: PumpDay[] = sim.days.map((d) => ({ day: d.day, pump1Min: d.pump1Min, pump2Min: d.pump2Min, starts: d.starts }));
  const totals = {
    pump1H: Math.round((list.reduce((a, d) => a + d.pump1Min, 0) / 60) * 10) / 10,
    pump2H: Math.round((list.reduce((a, d) => a + d.pump2Min, 0) / 60) * 10) / 10,
  };
  return settle({ days: list, totals }, 220);
}

export async function pumpProtection(): Promise<PumpProtection> {
  const t = now();
  const F = THRESHOLDS.flood;
  const level = waterLevelMm('marrickville', t);
  let starts = 0;
  let prev = waterLevelMm('marrickville', t - HOUR);
  for (let u = t - HOUR + 5 * MIN; u <= t; u += 5 * MIN) {
    const l = waterLevelMm('marrickville', u);
    if ((prev < F.pumpStartMm && l >= F.pumpStartMm) || (prev < F.highHighMm && l >= F.highHighMm)) starts += 1;
    prev = l;
  }
  const floatWet = valueAt('float_switch', 'marrickville', t) === 1;
  const radarSaysWet = level >= F.pumpStartMm - 5;
  return settle({
    floatWet,
    debounceS: 30,
    lStartMm: F.pumpStartMm,
    lLagMm: F.highHighMm,
    lStopMm: F.pumpStopMm,
    railFootMm: F.railFootMm,
    floatTripMm: F.pumpStartMm - 5,
    deadBandMm: F.pumpStartMm - F.pumpStopMm,
    minRunMin: 5,
    minRestMin: 3,
    maxStartsPerHour: 6,
    startsLastHour: starts,
    leadPump: simulatePumps(t).leadPump,
    radarFloatAgreement: floatWet === radarSaysWet ? 'agree' : 'discrepancy',
    controlSource: 'radar',
    levelMm: level,
  }, 120);
}

// ── power, §5.7 and §8.6 ─────────────────────────────────────────────────────

/**
 * §8.6, the controller's own report: state of charge, PV input, charge or
 * discharge, and its fault flags — each flag listed whether raised or not, so a
 * maintainer sees what is monitored, not just what is wrong.
 */
export function chargeController(loggerId: string): ChargeController {
  const t = now();
  const soc = batteryPct(loggerId, t);
  const pv = solarInputW(loggerId, t);
  const batteryV = Math.round((restingVoltage(soc) + (pv > LOAD_W ? 0.25 : 0)) * 100) / 100;
  const netA = Math.round(((pv * 0.96 - LOAD_W) / batteryV) * 10) / 10;
  const underYield = loggerId === 'LGD-DN-01' && t >= LGD_PANEL.underYieldFrom && t < LGD_PANEL.cleanedAt;
  const enclosure = STATIONS.flatMap((s) => s.loggers).find((l) => l.id === loggerId)?.enclosure.internalC ?? 30;
  return {
    loggerId,
    socPct: soc,
    pvW: pv,
    batteryV,
    netA,
    flags: [
      { id: 'uv', label: 'Battery under-voltage', active: soc < THRESHOLDS.power.lowBatteryPct / 2 },
      { id: 'ov', label: 'Battery over-voltage', active: false },
      { id: 'yield', label: 'PV under-yield', active: underYield, since: underYield ? LGD_PANEL.underYieldFrom : undefined },
      { id: 'temp', label: 'Over-temperature', active: enclosure > 55 },
      { id: 'lvd', label: 'Load disconnect', active: false },
    ],
  };
}

/** 12 V LiFePO4 is nearly flat across its middle; this is its resting curve. */
function restingVoltage(soc: number): number {
  const curve: [number, number][] = [
    [0, 12.0],
    [10, 12.8],
    [20, 13.0],
    [50, 13.2],
    [90, 13.3],
    [100, 13.4],
  ];
  for (let i = 1; i < curve.length; i++) {
    const [s0, v0] = curve[i - 1];
    const [s1, v1] = curve[i];
    if (soc <= s1) return Math.round((v0 + ((soc - s0) / (s1 - s0)) * (v1 - v0)) * 100) / 100;
  }
  return 13.4;
}

/** Station load, W: logger, modem and sensors. Sized to give §5.7's 3–4 days. */
const LOAD_W = 13;
/** 2 × 55 Ah at 12.8 V nominal, 90 % usable. */
const USABLE_WH = 2 * 55 * 12.8 * 0.9;

export async function powerTrails(days = 7): Promise<PowerTrail[]> {
  const t = now();
  const out: PowerTrail[] = [];
  for (const station of STATIONS) {
    for (const logger of station.loggers) {
      const soc: Reading[] = [];
      const pv: Reading[] = [];
      for (let u = t - days * DAY; u <= t; u += HOUR) {
        soc.push({ t: u, v: batteryPct(logger.id, u), status: 'normal' });
        pv.push({ t: u, v: solarInputW(logger.id, u), status: 'normal' });
      }
      const nowSoc = batteryPct(logger.id, t);
      const solar = solarInputW(logger.id, t);
      out.push({
        loggerId: logger.id,
        locationId: station.id,
        label: station.loggers.length > 1 ? `${station.name} — ${logger.label}` : station.name,
        soc,
        pv,
        voltage: restingVoltage(nowSoc) + (solar > LOAD_W ? 0.25 : 0),
        chargeW: Math.round(solar - LOAD_W),
        autonomyDays: Math.round(((USABLE_WH * nowSoc) / 100 / (LOAD_W * 24)) * 10) / 10,
      });
    }
  }
  return settle(out, 200);
}

// ── maintenance notice, §8.1 and §9 ──────────────────────────────────────────

/**
 * The one 36-hour window a year, on a weekend possession, notified at least 48
 * hours ahead. The next one sits nine days after the storm so the notice is on
 * screen during the demo — which is the point of showing it.
 */
export async function maintenanceWindows(): Promise<MaintenanceWindow[]> {
  const t = now();
  /* Forward to the next Saturday — Sydney's weekday, not the server's — and place
     both ends on the Sydney wall clock: 22:00 Saturday to 10:00 Monday, even when
     the clocks change in between. */
  const weekday = new Date(sydneyAt(STORM_DAY, 9, 12)).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Sydney' });
  const toSat = (6 - ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday) + 7) % 7;
  const from = sydneyAt(STORM_DAY, 9 + toSat, 22);
  return settle([
    {
      id: 'mw-next',
      from,
      to: sydneyAt(STORM_DAY, 9 + toSat + 2, 10),
      scope: 'Annual calibration and preventive maintenance — all seven locations',
      possession: 'Weekend possession (Southwest corridor)',
      notifiedAt: t - 3 * DAY,
    },
  ], 100);
}

// ── telemetry, §4 and §8.5 ───────────────────────────────────────────────────

/**
 * How each logger is reporting. Logging is every minute and the routine send is
 * every five (§4), but a threshold breach goes immediately — so the count of
 * event-triggered sends is the count of alerts raised at that location today.
 * Above half the warning level the logger drops to one-minute sends (§5.2).
 */
export async function telemetryFor(locationId: LocationId): Promise<Telemetry[]> {
  const t = now();
  const station = STATIONS_BY_ID[locationId];
  const today = sydneyDayStart(t);
  const sent = allEvents().filter((e) => e.locationId === locationId && e.t >= today && e.t <= t).length;
  return settle(
    station.loggers.map((l) => {
      const levelSensor = station.sensors.find(
        (s) => s.parameter === 'water_level' && (station.loggers.length === 1 || s.sensorId.startsWith(l.id.replace('-01', ''))),
      );
      const level = levelSensor ? valueAt('water_level', locationId, t, levelSensor.sensorId) ?? 0 : 0;
      const fast = levelSensor ? level >= THRESHOLDS.flood.standingWaterMm / 2 : false;
      const minutesToday = Math.floor((t - today) / MIN);
      return {
        loggerId: l.id,
        label: station.loggers.length > 1 ? l.label : station.name,
        loggingIntervalS: 60,
        transmitIntervalMin: fast ? 1 : 5,
        lastTransmission: t - ((hash(l.id) % 50) + 5) * 1000,
        eventSendsToday: sent,
        fastReporting: fast,
        bufferedReadings: 0,
        lastBackfill: l.id === 'LGD-UP-01' ? { at: STORM_DAY - 5 * DAY + 3 * HOUR + MIN, readings: 47, gapMin: 47 } : undefined,
        messagesToday: Math.floor(minutesToday / 5) + sent,
      };
    }),
    100,
  );
}

/**
 * The last manual check of each water-level point against its staff gauge
 * (§5.2): a technician reads the gauge by eye and the radar's value at that
 * moment is recorded beside it. The radar is ±1 mm and the gauge reads in
 * 10 mm steps, so a few millimetres apart is a pass.
 */
export async function staffGaugeChecks(locationId: LocationId): Promise<StaffGaugeCheck[]> {
  const t = now();
  const station = STATIONS_BY_ID[locationId];
  const people = ['T. Reilly', "S. O'Brien", 'A. Quinn'];
  return settle(
    station.sensors
      .filter((s) => s.parameter === 'water_level')
      .map((s) => {
        const rng = rngFrom(hash(`staff:${s.sensorId}`));
        const at = sydneyDayStart(t) - Math.floor(4 + rng() * 40) * DAY + (9 * 60 + Math.floor(rng() * 300)) * MIN;
        const radar = valueAt('water_level', locationId, at, s.sensorId) ?? 0;
        return {
          sensorId: s.sensorId,
          label: s.sensorId.includes('-UP-') ? 'Up tunnel' : s.sensorId.includes('-DN-') ? 'Down tunnel' : station.name,
          at,
          by: people[Math.floor(rng() * people.length)],
          staffMm: Math.round(radar / 10) * 10,
          radarMm: radar,
        };
      }),
    100,
  );
}

// ── maintenance mode, §8.4 ───────────────────────────────────────────────────

/**
 * Campsie is in maintenance mode when the demo opens: its radar failed at 11:04,
 * T. Reilly acknowledged it at 11:13 and put the location into maintenance on
 * arrival — the float switch stays live, so flood alerting continues from it.
 */
function seededMaintenance(locationId: LocationId): MaintenanceState {
  if (locationId !== 'campsie') return { on: false };
  const since = CAMPSIE_RADAR.onSiteAt;
  return since <= now() && now() < CAMPSIE_RADAR.closedAt
    ? { on: true, by: 'T. Reilly', since, reason: 'Radar comms fault — technician on site. Float switch remains live; flood alerting continues from it.' }
    : { on: false };
}

export async function getMaintenance(locationId: LocationId): Promise<MaintenanceState> {
  const set = getStore().maintenance.get(locationId);
  if (set === null) return settle({ on: false }, 60);
  if (set) return settle({ on: true, ...set }, 60);
  return settle(seededMaintenance(locationId), 60);
}

export function maintenanceNow(locationId: LocationId): MaintenanceState {
  const set = getStore().maintenance.get(locationId);
  if (set === null) return { on: false };
  if (set) return { on: true, ...set };
  return seededMaintenance(locationId);
}

export async function setMaintenance(locationId: LocationId, on: boolean, reason?: string): Promise<void> {
  recordAudit(on ? 'Maintenance mode on' : 'Maintenance mode off', `${STATIONS_BY_ID[locationId].name}${on && reason ? ` — ${reason}` : ''}`, 'maintenance');
  mutate((s) =>
    s.maintenance.set(locationId, on ? { by: DEMO_USER.name, since: now(), reason: reason ?? 'Planned work on site' } : null),
  );
  return settle(undefined, 150);
}

// ── data pipeline, §4.1 / §8.2 / §8.5 ────────────────────────────────────────

export interface PipelineStats {
  /** Messages per 10 minutes over the last 24 h, split by why they were sent. */
  bins: { t: number; routine: number; fast: number; event: number }[];
  messagesToday: number;
  eventSendsToday: number;
  readingsToday: number;
  quarantinedToday: number;
  rulesEvaluatedToday: number;
  alertsToday: number;
  deliveriesToday: number;
  deliveredInTime: number;
  backfilledLast30d: number;
  storedSince: number;
}

/**
 * The five modules of Figure 11, counted. Every number is derived: messages from
 * the reporting rules (every 5 min, every minute above half the warning level,
 * immediately on a breach), quarantines from the validation flags, alerts and
 * deliveries from the alert log.
 */
export async function pipelineStats(): Promise<PipelineStats> {
  const t = now();
  const today = sydneyDayStart(t);
  const events = allEvents();
  const bins: PipelineStats['bins'] = [];
  /* 30-minute bins: 48 bars stay drawable on a phone, where 144 ten-minute
     bars were each under a pixel wide and simply did not render. */
  const step = 30 * MIN;
  const start = Math.ceil((t - DAY) / step) * step;
  const levelLoggers = STATIONS.flatMap((s) =>
    s.loggers.map((l) => ({
      s,
      sensor: s.sensors.find((x) => x.parameter === 'water_level' && (s.loggers.length === 1 || x.sensorId.startsWith(l.id.replace('-01', '')))),
    })),
  );
  for (let u = start; u <= t; u += step) {
    let routine = 0;
    let fast = 0;
    for (const { s, sensor } of levelLoggers) {
      const lvl = sensor ? valueAt('water_level', s.id, u, sensor.sensorId) ?? 0 : 0;
      if (sensor && lvl >= THRESHOLDS.flood.standingWaterMm / 2) fast += 30;
      else routine += 6;
    }
    const event = events.filter((e) => e.t > u - step && e.t <= u).length;
    bins.push({ t: u, routine, fast, event });
  }
  const minutesToday = Math.floor((t - today) / MIN);
  const eventSendsToday = events.filter((e) => e.t >= today && e.t <= t).length;
  const loggers = STATIONS.reduce((a, s) => a + s.loggers.length, 0);
  const channels = STATIONS.reduce((a, s) => a + s.sensors.length, 0);
  const alertsToday = events.filter((e) => e.t >= today && e.t <= t && e.severity !== 'cleared').length;
  return settle(
    {
      bins,
      messagesToday: Math.floor(minutesToday / 5) * loggers + eventSendsToday,
      eventSendsToday,
      readingsToday: minutesToday * channels,
      quarantinedToday: (await qualityFlags()).filter((f) => f.t >= today).length,
      rulesEvaluatedToday: minutesToday * ALERT_RULES.filter((r) => r.enabled).length,
      alertsToday,
      deliveriesToday: alertsToday * 3,
      deliveredInTime: alertsToday * 3,
      backfilledLast30d: 47,
      storedSince: STORM_DAY - 182 * DAY,
    },
    180,
  );
}


// ── sensor register (Admin → Sensors) ────────────────────────────────────────

/** What each kind of instrument is, where it is wired and how it is mounted (§4.3, §5). */
export const INSTRUMENT_CATALOG: Record<InstrumentKind, { label: string; model: string; parameter: ParameterId; code: string; mounting: string }> = {
  rain: { label: 'Rain gauge', model: 'RIMCO 7499 tipping bucket', parameter: 'rainfall', code: 'RIMCO', mounting: 'Mast, 1.5–2 m, clear of splash' },
  level: { label: 'Radar water level', model: 'YGRD-65-D radar (mm above datum)', parameter: 'water_level', code: 'YGRD', mounting: '2.5 m aluminium mast over the channel' },
  float: { label: 'Float switch', model: 'RS PRO RSF80 high-level backup', parameter: 'float_switch', code: 'RSF80', mounting: 'Through-wall, beside the radar' },
  gmx: { label: 'Temperature / RH / pressure', model: 'Gill GMX300', parameter: 'temperature', code: 'GMX', mounting: '1.5–2 m above rail, shaded' },
  wind: { label: 'Anemometer', model: 'Gill WindSonic 75 (10 m)', parameter: 'wind_mean', code: 'WS', mounting: '10 m on the VM5F mast' },
};

function kindOf(p: ParameterId): InstrumentKind | undefined {
  if (p === 'rainfall') return 'rain';
  if (p === 'water_level') return 'level';
  if (p === 'float_switch') return 'float';
  if (p === 'temperature' || p === 'humidity' || p === 'pressure') return 'gmx';
  if (p === 'wind_mean' || p === 'wind_gust' || p === 'wind_dir') return 'wind';
  return undefined;
}

/**
 * Every instrument on the line, one row per physical device — the GMX300 that
 * reports three parameters is one instrument. Seeded from the station list,
 * then this session's additions and edits applied on top.
 */
export function instrumentsNow(): Instrument[] {
  const t = now();
  const store = getStore();
  const seen = new Set<string>();
  const out: Instrument[] = [];
  for (const station of STATIONS) {
    for (const s of station.sensors) {
      const kind = kindOf(s.parameter);
      if (!kind || seen.has(s.sensorId)) continue;
      seen.add(s.sensorId);
      const logger = station.loggers.find((l) => s.sensorId.startsWith(l.id.replace(/-\d+$/, '-'))) ?? station.loggers[0];
      const c = calibrationFor(s.sensorId, INSTRUMENT_CATALOG[kind].parameter, t);
      out.push({
        sensorId: s.sensorId,
        locationId: station.id,
        locationName: station.name,
        loggerId: logger.id,
        kind,
        model: s.model,
        terminal: TERMINAL_FOR[INSTRUMENT_CATALOG[kind].parameter]?.terminal ?? '—',
        serial: `${INSTRUMENT_CATALOG[kind].code}-${String((hash(`serial:${s.sensorId}`) % 900000) + 100000)}`,
        mounting: INSTRUMENT_CATALOG[kind].mounting,
        // Installed in the site-installation stage, commissioned before rule set v1.
        installedAt: sydneyAt(STORM_DAY, -40 + (hash(s.sensorId) % 9), 9 + (hash(s.sensorId) % 6)),
        calibrationDueAt: c.due,
        certificate: c.certificate,
        // §5.1: the RIMCO 7499 as supplied tips at 0.2 mm (0.1 mm option).
        bucketMm: kind === 'rain' ? 0.2 : undefined,
        status: 'in-service',
      });
    }
  }
  return [...out, ...store.addedInstruments].map((i) => ({ ...i, ...(store.instrumentEdits.get(i.sensorId) ?? {}) }));
}

export async function listInstruments(): Promise<Instrument[]> {
  return settle(instrumentsNow(), 120);
}

export async function addInstrument(input: InstrumentInput): Promise<void> {
  const station = STATIONS_BY_ID[input.locationId];
  const kind = INSTRUMENT_CATALOG[input.kind];
  mutate((s) =>
    s.addedInstruments.push({
      ...input,
      locationName: station.name,
      model: kind.model,
      terminal: TERMINAL_FOR[kind.parameter]?.terminal ?? '—',
      installedAt: now(),
      status: 'commissioning',
      added: true,
    }),
  );
  recordAudit('Sensor added', `${input.sensorId} — ${kind.label} at ${station.name} (${input.loggerId}), serial ${input.serial}. Commissioning.`, 'maintenance');
  return settle(undefined, 220);
}

export async function updateInstrument(sensorId: string, patch: Partial<Instrument>, action: string, detail: string): Promise<void> {
  mutate((s) => s.instrumentEdits.set(sensorId, { ...(s.instrumentEdits.get(sensorId) ?? {}), ...patch }));
  recordAudit(action, `${sensorId} — ${detail}`, 'maintenance');
  return settle(undefined, 180);
}
