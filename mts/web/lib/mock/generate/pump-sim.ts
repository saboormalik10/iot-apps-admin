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
