import type { AlertEvent, LocationId, Severity, TrackDirection } from '@/lib/api/types';
import { STORM_DAY, sydneyAt } from '../clock';
import { valueAt, waterLevelMm, windGustKmh } from '../generate/profiles';
import { TALLY_STEP, rainGrid, tallyAt } from '../generate/tallies';
import { STATIONS_BY_ID } from './stations';
import { THRESHOLDS } from './thresholds';
import { CAMPSIE_RADAR } from './incidents';

/**
 * The event history.
 *
 * The storm rows are not written by hand. Their times come from the same series
 * the charts draw, so the log, the chart, the pump panel and the history screen
 * cannot disagree: if the level curve crosses +100 mm at 13:18, that is when the
 * log says the duty pump started, and moving the weather moves the log with it.
 *
 * Wording is the client's own wherever their documents give it — the rainfall
 * patrol instruction, "block the line", the PTZ verification prompt — because a
 * controller reading this screen is reading an instruction, not a notification.
 * Anything we invented is flagged `draftWording`, so nobody mistakes our phrasing
 * for MTS-approved phrasing.
 */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** When a series first reaches `level` (or, `rising: false`, first falls back below it). */
function crossing(
  read: (t: number) => number,
  level: number,
  opts: { rising?: boolean; after?: number; step?: number } = {},
): number | undefined {
  const rising = opts.rising ?? true;
  // One-minute steps on whole minutes: the pump model searches the same grid.
  const step = opts.step ?? MIN;
  const start = opts.after ?? STORM_DAY + 6 * 60 * MIN;
  const end = STORM_DAY + 23 * 60 * MIN;
  let wasOver = read(start) >= level;
  for (let t = start; t <= end; t += step) {
    const over = read(t) >= level;
    if (rising && over && !wasOver) return t;
    if (!rising && !over && wasOver) return t;
    wasOver = over;
  }
  return undefined;
}

const levelAt = (id: LocationId) => (t: number) => waterLevelMm(id, t);
/**
 * A rolling rain tally as a readable series, off the storm day's grid. Rainfall
 * rules are judged on these tallies (§7.3: "≥ 25 mm in 1 h (rolling)"), not on
 * the instantaneous rate — the difference is twenty minutes on this storm.
 */
const tally = (id: LocationId, windowMs: number) => {
  const g = rainGrid(id, STORM_DAY + 23 * 60 * MIN);
  return (t: number) => tallyAt(g, t, windowMs);
};
const HOUR_MS = 60 * MIN;

interface Seed {
  /**
   * A stable identity. Ids used to be the row's index in the visible list, which
   * meant that the moment the clock ticked past the next event every id shifted
   * by one — and an acknowledgement recorded against `evt-003` silently moved to
   * a different alert.
   */
  id: string;
  /** Absolute time. Rows whose time has not arrived yet are simply not shown. */
  t: number | undefined;
  severity: Severity;
  category: AlertEvent['category'];
  location: LocationId;
  message: string;
  detail?: string;
  track?: TrackDirection;
  acknowledged?: { by: string; minutesAfter: number };
  autoCleared?: boolean;
  camera?: boolean;
  draft?: boolean;
}

/** Local time on a given day, as an absolute instant. */
function at(dayOffset: number, hour: number, minute: number): number {
  return sydneyAt(STORM_DAY, dayOffset, hour, minute);
}

function stormSeeds(): Seed[] {
  const F = THRESHOLDS.flood;
  const mkv = levelAt('marrickville');
  const R = THRESHOLDS.rainfall;
  const mkv1h = tally('marrickville', HOUR_MS);
  const mkv3h = tally('marrickville', 3 * HOUR_MS);
  const mkv3d = tally('marrickville', 3 * DAY);
  const tallyStep = { step: TALLY_STEP };
  const rainStart = crossing(mkv1h, R.intensity.value, tallyStep);
  const rainEnd = crossing(mkv1h, R.intensity.value, { ...tallyStep, rising: false, after: rainStart });
  const shortStart = crossing(mkv3h, R.short.value, tallyStep);
  const multiStart = crossing(mkv3d, R.multiDay.value, tallyStep);
  const dutyStart = crossing(mkv, F.pumpStartMm);
  const standbyStart = crossing(mkv, F.highHighMm);
  const railFoot = crossing(mkv, F.railFootMm);
  const railFootClear = crossing(mkv, F.railFootMm, { rising: false, after: railFoot });
  const pumpsOff = crossing(mkv, F.pumpStopMm, { rising: false, after: dutyStart });
  const canterbury = crossing(levelAt('canterbury'), F.standingWaterMm);
  // §5.2: rate of rise, on its own — a fast rise is worth a warning while the
  // level is still low.
  const riseRate = (t: number) => (mkv(t) - mkv(t - 10 * MIN)) * 6;
  const riseFast = crossing(riseRate, F.rateOfRiseMmHr);
  // §7.3: trending down — the first sustained fall after the line was blocked.
  const trendingDown = railFoot
    ? crossing((t) => (mkv(t - 10 * MIN) - mkv(t) >= 3 ? 1 : 0), 1, { after: railFoot + 10 * MIN })
    : undefined;
  const dulwich = crossing(levelAt('marrickville-dulwich-hill'), F.approachMm);

  return [
    {
      id: 'belmore-watch',
      t: crossing(tally('belmore', HOUR_MS), R.intensity.value * 0.5, tallyStep),
      severity: 'warning',
      category: 'rainfall',
      location: 'belmore',
      message: `Rainfall past half the ${THRESHOLDS.rainfall.intensity.value} mm/hr threshold — watch`,
      draft: true,
      track: 'up',
      acknowledged: { by: 'P. Nair', minutesAfter: 2 },
    },
    {
      id: 'rain-alert',
      t: rainStart,
      severity: 'alert',
      category: 'rainfall',
      location: 'marrickville',
      message: `Rainfall ≥ ${THRESHOLDS.rainfall.intensity.value} mm/hr. Initiate CJC-T front-of-train patrol (Hurlstone Park–Bankstown). Be prepared for network flooding.`,
      detail: `${THRESHOLDS.rainfall.intensity.vigilanceHours}-hour vigilance in force; the timer restarts if further qualifying rain falls.`,
      track: 'up',
    },
    {
      id: 'rain-short',
      t: shortStart,
      severity: 'alert',
      category: 'rainfall',
      location: 'marrickville',
      message: `Rainfall ≥ ${R.short.value} mm in 3 hours. Continue CJC-T front-of-train patrol (Hurlstone Park–Bankstown). Demobilise patrols if visibility is limited and implement a 60 kph TSR until cancelled or visibility improves.`,
      detail: `${R.short.vigilanceHours}-hour vigilance in force from when the 3-hour total falls back below ${R.short.value} mm; it restarts if further qualifying rain falls.`,
      track: 'up',
    },
    {
      id: 'rain-multiday',
      t: multiStart,
      severity: 'alert',
      category: 'rainfall',
      location: 'marrickville',
      message: `Rainfall ≥ ${R.multiDay.value} mm in 3 days. Be prepared for network flooding — ${R.multiDay.vigilanceHours}-hour vigilance.`,
      detail: 'The catchment is saturated: further rain now runs off rather than soaking in.',
      track: 'up',
    },
    {
      id: 'dulwich-watch',
      t: dulwich,
      severity: 'warning',
      category: 'flood',
      location: 'marrickville-dulwich-hill',
      message: `Water level approaching the standing-water line (+${F.approachMm} mm) — watch, no pumps at this location`,
      draft: true,
      track: 'down',
    },
    {
      id: 'duty-start',
      t: dutyStart,
      severity: 'alert',
      category: 'pump',
      location: 'marrickville',
      message: `Water level exceeded pump-start +${F.pumpStartMm} mm — DUTY pump started`,
      detail: 'Local pump-control logic on the OMC-048; the central server was notified, not asked.',
      track: 'both',
    },
    {
      id: 'standby-start',
      t: standbyStart,
      severity: 'alert',
      category: 'pump',
      location: 'marrickville',
      message: `Level still rising past +${F.highHighMm} mm — STANDBY pump started, duty pump continues`,
      detail: 'High-level float WET; the radar reading is cross-confirmed.',
      track: 'both',
    },
    {
      /* Marrickville has a camera too, and its water crosses standing water
         before the pumps start — §7.5 asks for the same verification there. */
      id: 'mkv-ptz',
      t: crossing(mkv, F.standingWaterMm),
      severity: 'alert',
      category: 'camera',
      location: 'marrickville',
      message: `Standing water above +${F.standingWaterMm} mm — PTZ verification requested`,
      detail: 'Verify standing water on the PTZ camera before acting on the reading.',
      camera: true,
      acknowledged: { by: 'J. Okoro', minutesAfter: 3 },
      track: 'both',
    },
    {
      id: 'canterbury-ptz',
      t: canterbury,
      severity: 'alert',
      category: 'camera',
      location: 'canterbury',
      message: `Standing water above +${F.standingWaterMm} mm — PTZ verification requested`,
      detail: 'Verify standing water on the PTZ camera before acting on the reading.',
      camera: true,
      track: 'down',
    },
    {
      id: 'rail-foot',
      t: railFoot,
      severity: 'alert',
      category: 'flood',
      location: 'marrickville',
      message: `Water level reached the rail foot (+${F.railFootMm} mm) — BLOCK THE LINE`,
      detail: 'Both pumps running. Escalated to the Network Control Officer.',
      track: 'both',
    },
    {
      id: 'rise-fast',
      t: riseFast,
      severity: 'warning',
      category: 'flood',
      location: 'marrickville',
      message: `Water level rising at ≥ ${F.rateOfRiseMmHr} mm/hr — rate-of-rise warning, still below pump-start`,
      detail: 'Raised on the rate of change alone, independent of the absolute thresholds (§5.2).',
      draft: true,
      track: 'both',
    },
    {
      id: 'trending-down',
      t: trendingDown,
      severity: 'warning',
      category: 'flood',
      location: 'marrickville',
      message: 'Water level trending down — carry out system checks and a track inspection, then staged reinstatement at 25 kph → 60 kph → unrestricted',
      detail: 'Pumps continue under automatic control until the level reaches the stop point.',
      track: 'both',
    },
    {
      id: 'rail-foot-clear',
      t: railFootClear,
      severity: 'cleared',
      category: 'flood',
      location: 'marrickville',
      message: `Water level receded below the rail foot (+${F.railFootMm} mm) — line block may be reviewed`,
      autoCleared: true,
      track: 'both',
    },
    {
      id: 'vigilance-end',
      t: rainEnd ? rainEnd + R.intensity.vigilanceHours * 60 * MIN : undefined,
      severity: 'cleared',
      category: 'rainfall',
      location: 'marrickville',
      message: `Rainfall intensity vigilance ended (${R.intensity.vigilanceHours} h with no further qualifying rain) — all clear issued automatically`,
      autoCleared: true,
      track: 'up',
    },
    {
      id: 'pumps-off',
      t: pumpsOff,
      severity: 'cleared',
      category: 'pump',
      location: 'marrickville',
      message: `Water level receded below +${F.pumpStopMm} mm — pumps stopped (minimum run time met)`,
      autoCleared: true,
      track: 'both',
    },
    /* Not part of the storm, but on the same day: the things that go wrong while
       everyone is watching the weather. */
    {
      id: 'campsie-fault',
      t: CAMPSIE_RADAR.alertAt,
      severity: 'information',
      category: 'fault',
      location: 'campsie',
      message: 'Radar sensor comms timeout — fallback to float switch; data-quality alert raised',
      detail: 'Alerting for this location has switched to its designated alternate source.',
      acknowledged: { by: 'T. Reilly', minutesAfter: (CAMPSIE_RADAR.acknowledgedAt - CAMPSIE_RADAR.alertAt) / 60_000 },
      track: 'down',
    },
    {
      id: 'campsie-restored',
      t: CAMPSIE_RADAR.closedAt,
      severity: 'cleared',
      category: 'fault',
      location: 'campsie',
      message: 'Radar level sensor restored — cable replaced and reading verified against the staff gauge; alerting back on the primary source',
      detail: 'Work order WO-0412 closed. Maintenance mode off.',
      autoCleared: true,
      track: 'down',
    },
    {
      id: 'lgd-battery',
      t: at(0, 6, 12),
      severity: 'warning',
      category: 'power',
      location: 'lady-game-drive',
      message: `Down-tunnel battery fell to 38% overnight, below the ${THRESHOLDS.power.lowBatteryPct}% leading-indicator threshold — solar recovery confirmed at first light`,
      draft: true,
      autoCleared: true,
      track: 'down',
    },
    {
      id: 'wind-gust',
      /* The southerly change reaching the north-west: the first time the gust at
         Windsor Road actually passes the warning line on the storm day. */
      t: crossing((t) => windGustKmh('windsor-road', t), THRESHOLDS.wind.gustWarn.value),
      severity: 'warning',
      category: 'wind',
      location: 'windsor-road',
      message: `Wind gust ≥ ${THRESHOLDS.wind.gustWarn.value} km/h — apply the TSR wording for the listed kilometrages`,
      acknowledged: { by: 'J. Okoro', minutesAfter: 4 },
      track: 'up',
    },
  ];
}

/**
 * The weeks before the storm.
 *
 * Without them the date filter has nothing to filter and "last 30 days" looks
 * identical to "last 24 hours" — and a client cannot tell whether the control is
 * wired up or decorative.
 */
/** The highest value of a reading on a given day — so a history line quotes the real peak. */
function peakOn(parameter: 'rainfall' | 'water_level' | 'wind_gust', locationId: LocationId, day: number): { t: number; v: number } {
  let best = { t: at(day, 0, 0), v: -1 };
  for (let t = at(day, 0, 0); t < at(day + 1, 0, 0); t += 5 * MIN) {
    const v = valueAt(parameter, locationId, t) ?? 0;
    if (v > best.v) best = { t, v };
  }
  return best;
}

/** After a peak, when the reading first stays under `below` for 30 minutes. */
function settledBelow(parameter: 'wind_gust', locationId: LocationId, from: number, below: number): number {
  let run = 0;
  for (let t = from; t < from + 12 * 60 * MIN; t += 5 * MIN) {
    run = (valueAt(parameter, locationId, t) ?? 0) < below ? run + 5 : 0;
    if (run >= 30) return t;
  }
  return from + 6 * 60 * MIN;
}

/**
 * The weeks before the storm.
 *
 * Without them the date filter has nothing to filter and "last 30 days" looks
 * identical to "last 24 hours". Every weather line quotes the model's own peak
 * for that day — an earlier version quoted figures typed in by hand, and a
 * reviewer running a history query found a "91 km/h gust" that the data showed
 * as 76.
 */
function historySeeds(): Seed[] {
  const rain3 = peakOn('rainfall', 'marrickville', -3);
  const can3 = peakOn('water_level', 'canterbury', -3);
  const rain8 = peakOn('rainfall', 'marrickville', -8);
  const wsr1 = peakOn('wind_gust', 'windsor-road', -1);
  const wsr19 = peakOn('wind_gust', 'windsor-road', -19);
  const W = THRESHOLDS.wind.gustWarn.value;
  return [
    { id: 'h1', t: at(-1, 5, 48), severity: 'information', category: 'fault', location: 'belmore', message: 'Logger restarted after a scheduled firmware update — back online in 4 minutes', autoCleared: true, draft: true, track: 'up' },
    {
      id: 'h2',
      t: wsr1.t,
      severity: wsr1.v >= W ? 'warning' : 'information',
      category: 'wind',
      location: 'windsor-road',
      message: `Gusts to ${Math.round(wsr1.v)} km/h with the afternoon change — ${wsr1.v >= W ? 'TSR wording issued' : 'below the TSR threshold, logged for the record'}`,
      acknowledged: { by: 'D. Smith', minutesAfter: 6 },
      draft: true,
      track: 'down',
    },
    { id: 'h3', t: at(-2, 9, 26), severity: 'information', category: 'fault', location: 'campsie', message: 'Cabinet door opened during a scheduled site visit — closed and locked at 09:58', draft: true, acknowledged: { by: 'T. Reilly', minutesAfter: 3 }, track: 'up' },
    { id: 'h3b', t: at(-2, 10, 2), severity: 'information', category: 'pump', location: 'marrickville', message: 'Weekly pump exercise completed — both pumps ran for 2 minutes, run and flow confirmed', draft: true, track: 'both' },
    { id: 'h4', t: rain3.t, severity: 'information', category: 'rainfall', location: 'marrickville', message: `Rainfall peaked at ${rain3.v} mm in an hour — below the patrol threshold, logged for the record`, autoCleared: true, draft: true, track: 'up' },
    { id: 'h5', t: can3.t, severity: 'information', category: 'flood', location: 'canterbury', message: `Water level peaked at +${can3.v} mm — below the standing-water line, no action required`, autoCleared: true, draft: true, track: 'down' },
    {
      id: 'h6',
      t: at(-5, 2, 29),
      severity: 'alert',
      category: 'fault',
      location: 'lady-game-drive',
      message: `Up-tunnel logger unresponsive — no telemetry for ${THRESHOLDS.silenceMinutes} minutes, site attendance requested`,
      detail: 'Last message at 02:14. Restored without intervention; cause recorded as a carrier outage.',
      acknowledged: { by: 'A. Khan', minutesAfter: 4 },
      track: 'up',
    },
    { id: 'h7', t: at(-5, 3, 1), severity: 'cleared', category: 'fault', location: 'lady-game-drive', message: 'Up-tunnel logger reporting again — 47-minute gap (02:14–03:01) backfilled from the logger’s buffer', autoCleared: true, track: 'up' },
    { id: 'h8', t: rain8.t, severity: 'information', category: 'rainfall', location: 'marrickville', message: `Rainfall peaked at ${rain8.v} mm in an hour — vigilance not triggered`, autoCleared: true, draft: true, track: 'up' },
    { id: 'h9', t: at(-9, 10, 2), severity: 'information', category: 'pump', location: 'marrickville', message: 'Weekly pump exercise completed — both pumps ran for 2 minutes, run and flow confirmed', draft: true, track: 'both' },
    { id: 'h10', t: at(-11, 14, 40), severity: 'information', category: 'fault', location: 'marrickville-dulwich-hill', message: 'Float switch failed its self-test — replaced under warranty', acknowledged: { by: 'A. Khan', minutesAfter: 90 }, draft: true, track: 'down' },
    { id: 'h11', t: at(-14, 13, 5), severity: 'information', category: 'power', location: 'windsor-road', message: 'Solar panel cleaned after a dust report — charge rate back to normal', acknowledged: { by: 'M. Lee', minutesAfter: 17 }, draft: true, track: 'up' },
    {
      id: 'h13',
      t: wsr19.t,
      severity: wsr19.v >= THRESHOLDS.wind.gustAlert.value ? 'alert' : wsr19.v >= W ? 'warning' : 'information',
      category: 'wind',
      location: 'windsor-road',
      message: `Wind gust ${Math.round(wsr19.v)} km/h${wsr19.v >= W ? ` (≥ ${W}) — TSR wording issued for the listed kilometrages` : ' — below the TSR threshold'}`,
      detail: 'Reviewed at the weekly operations meeting; no damage reported.',
      acknowledged: { by: 'S. Chen', minutesAfter: 3 },
      track: 'up',
    },
    { id: 'h14', t: settledBelow('wind_gust', 'windsor-road', wsr19.t, 60), severity: 'cleared', category: 'wind', location: 'windsor-road', message: 'Gusts below 60 km/h for 30 minutes — wind condition cleared', autoCleared: true, track: 'up' },
    { id: 'h16', t: at(-27, 10, 0), severity: 'information', category: 'fault', location: 'marrickville', message: 'Monthly alert-chain test — screen, web push and email reached every recipient group', acknowledged: { by: 'S. Chen', minutesAfter: 2 }, draft: true, track: 'both' },
  ];
}

/**
 * The storm's times depend only on the storm day, so they are computed once.
 * They used to be recomputed on every call — and the header asks for the alert
 * count on every clock tick, which was ~150,000 weather evaluations a second.
 */
let stormMemo: { day: number; seeds: Seed[] } | null = null;
function stormSeedsOnce(): Seed[] {
  if (!stormMemo || stormMemo.day !== STORM_DAY) stormMemo = { day: STORM_DAY, seeds: stormSeeds() };
  return stormMemo.seeds;
}

let historyMemo: { day: number; seeds: Seed[] } | null = null;
function historyOnce(): Seed[] {
  if (!historyMemo || historyMemo.day !== STORM_DAY) historyMemo = { day: STORM_DAY, seeds: historySeeds() };
  return historyMemo.seeds;
}

export function seededEvents(now: number): AlertEvent[] {
  return [...stormSeedsOnce(), ...historyOnce()]
    .filter((s): s is Seed & { t: number } => s.t !== undefined && s.t <= now)
    .sort((a, b) => b.t - a.t)
    .map((s) => {
      const station = STATIONS_BY_ID[s.location];
      const event: AlertEvent = {
        id: `evt-${s.id}`,
        severity: s.severity,
        category: s.category,
        locationId: s.location,
        locationName: station.name,
        message: s.message,
        detail: s.detail,
        t: s.t,
        /* §7.1: an alert names the track and rail it concerns, not the station's
           capability — so these come from the event, not the location. */
        track: s.track ?? station.track,
        rail: s.track ?? station.track,
        chainageLabel: station.chainage.label,
        cameraUrl: s.camera ? station.cameraUrl : undefined,
        autoCleared: s.autoCleared,
        draftWording: s.draft,
      };
      if (s.acknowledged) {
        event.acknowledgement = { by: s.acknowledged.by, at: s.t + s.acknowledged.minutesAfter * 60_000 };
      }
      return event;
    });
}

/** Counts the alerts KPI row shows. */
export function eventTotals(events: AlertEvent[], now: number) {
  const day = 24 * 60 * 60_000;
  return {
    active: events.filter((e) => e.severity === 'alert' && !e.autoCleared && !e.acknowledgement).length,
    unacknowledged: events.filter((e) => !e.acknowledgement && !e.autoCleared && e.severity !== 'cleared').length,
    today: events.filter((e) => e.t >= now - day).length,
    lastSevenDays: events.filter((e) => e.t >= now - 7 * day).length,
  };
}
