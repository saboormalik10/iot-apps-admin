import { sydneyDayStart } from '../clock';
import { THRESHOLDS } from '../seed/thresholds';
import { waterLevelMm } from './profiles';

/**
 * The Marrickville pump plant, simulated the way the OMC-048 runs it (§5.6):
 * lead pump on at L-start, lag pump on at L-lag (high-high), both off at L-stop,
 * and the lead alternating every cycle so the two pumps share the wear. Weekly
 * exercise runs are added on top.
 *
 * One simulation, read by the pump cards, the run-time chart and the protection
 * panel — so "1.4 h today" on a card is the same number the chart draws.
 */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const STEP_MIN = 5;

export interface PumpDayRun {
  day: number;
  pump1Min: number;
  pump2Min: number;
  starts: number;
  /** Minutes the duty (lead) and standby (lag) roles ran that day. */
  leadMin: number;
  lagMin: number;
  leadStarts: number;
  lagStarts: number;
}

export interface PumpSim {
  days: PumpDayRun[];
  /** Which physical pump is lead for the current (or next) cycle. */
  leadPump: 1 | 2;
  /** The last exercise run, for the activity feed. */
  lastExercise?: number;
}

let memo: { key: number; sim: PumpSim } | null = null;

export function simulatePumps(t: number, days = 30): PumpSim {
  const key = Math.floor(t / (STEP_MIN * MIN)) * 100 + days;
  if (memo?.key === key) return memo.sim;
  const F = THRESHOLDS.flood;
  const today = sydneyDayStart(t);
  let lead: 1 | 2 = 2;
  let running = false;
  let lagOn = false;
  const map = new Map<number, PumpDayRun>();
  const row = (d: number) => {
    if (!map.has(d)) map.set(d, { day: d, pump1Min: 0, pump2Min: 0, starts: 0, leadMin: 0, lagMin: 0, leadStarts: 0, lagStarts: 0 });
    return map.get(d)!;
  };
  for (let d = today - (days - 1) * DAY; d <= today; d += DAY) row(d);

  const start = today - (days - 1) * DAY;
  for (let u = start; u <= t; u += STEP_MIN * MIN) {
    const level = waterLevelMm('marrickville', u);
    const r = row(sydneyDayStart(u));
    if (!running && level >= F.pumpStartMm) {
      running = true;
      lead = lead === 1 ? 2 : 1;
      r.starts += 1;
      r.leadStarts += 1;
    }
    if (running && !lagOn && level >= F.highHighMm) {
      lagOn = true;
      r.starts += 1;
      r.lagStarts += 1;
    }
    if (running && level < F.pumpStopMm) {
      running = false;
      lagOn = false;
    }
    if (running) {
      r.leadMin += STEP_MIN;
      if (lead === 1) r.pump1Min += STEP_MIN;
      else r.pump2Min += STEP_MIN;
      if (lagOn) {
        r.lagMin += STEP_MIN;
        if (lead === 1) r.pump2Min += STEP_MIN;
        else r.pump1Min += STEP_MIN;
      }
    }
  }

  // Weekly exercise: both pumps for two minutes, at 10:00, two days before the
  // storm and every seven days back from there.
  let lastExercise: number | undefined;
  for (let d = -2; d > -days; d -= 7) {
    const dayStart = today + d * DAY;
    const r = row(dayStart);
    r.pump1Min += 2;
    r.pump2Min += 2;
    r.starts += 2;
    lastExercise ??= dayStart + 10 * 60 * MIN;
  }

  const sim: PumpSim = {
    days: [...map.values()].sort((a, b) => a.day - b.day),
    leadPump: running ? lead : lead === 1 ? 2 : 1,
    lastExercise,
  };
  memo = { key, sim };
  return sim;
}

/**
 * The pump run log (client, 9 Nov 2026): the portal does not control the pumps.
 * It receives each pump's run signal from the existing panel and records every run
 * with its start and stop time, and the water level at each.
 *
 * Simulated minute by minute, the way the panel runs the pumps today: duty on at
 * pump-start, standby on at high-high, both off at the stop level. Minute steps
 * keep the start times on the same minute the alert log reports.
 */
export interface PumpRunRecord {
  pump: 'duty' | 'standby';
  start: number;
  /** Absent while the pump is still running. */
  stop?: number;
  levelStartMm: number;
  levelStopMm?: number;
  /** The weekly exercise run, not a flood. */
  exercise?: boolean;
}

let runMemo: { key: number; runs: PumpRunRecord[] } | null = null;

export function pumpRunLog(t: number, days = 7): PumpRunRecord[] {
  const key = Math.floor(t / MIN) * 100 + days;
  if (runMemo?.key === key) return runMemo.runs;
  const F = THRESHOLDS.flood;
  const level = (u: number) => Math.round(waterLevelMm('marrickville', u));
  const runs: PumpRunRecord[] = [];
  let duty: PumpRunRecord | null = null;
  let standby: PumpRunRecord | null = null;

  const start = Math.floor((t - days * DAY) / MIN) * MIN;
  for (let u = start; u <= t; u += MIN) {
    const mm = level(u);
    if (!duty && mm >= F.pumpStartMm) {
      duty = { pump: 'duty', start: u, levelStartMm: mm };
      runs.push(duty);
    }
    if (duty && !standby && mm >= F.highHighMm) {
      standby = { pump: 'standby', start: u, levelStartMm: mm };
      runs.push(standby);
    }
    if (duty && mm < F.pumpStopMm) {
      for (const r of [duty, standby]) {
        if (r) {
          r.stop = u;
          r.levelStopMm = mm;
        }
      }
      duty = null;
      standby = null;
    }
  }

  // The weekly exercise: both pumps for two minutes at 10:00, as simulatePumps has it.
  const today = sydneyDayStart(t);
  for (let d = -2; d > -days; d -= 7) {
    const at = today + d * DAY + 10 * 60 * MIN;
    if (at < start || at + 2 * MIN > t) continue;
    for (const pump of ['duty', 'standby'] as const) {
      runs.push({ pump, start: at, stop: at + 2 * MIN, levelStartMm: level(at), levelStopMm: level(at + 2 * MIN), exercise: true });
    }
  }

  runs.sort((a, b) => b.start - a.start || (a.pump === 'duty' ? -1 : 1));
  runMemo = { key, runs };
  return runs;
}
