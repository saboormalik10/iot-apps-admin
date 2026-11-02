import { HOUR, MIN, type RainEventKind, type RainTip } from './engine';

/**
 * Test cases for the 3-day rainfall rule (≥ 120 mm in 72 h, 48 h vigilance).
 *
 * Every scenario is rain on the Marrickville gauge (MKV-RIMCO-01, 0.2 mm per tip),
 * built from storms at a steady rate. Rates are chosen so tips fall on whole
 * minutes — 6 mm/h is a tip every 2 minutes, 12 mm/h every minute, 2.4 mm/h every
 * 5 minutes — so every expected time below can be worked out by hand:
 *
 *   • the alert fires on the tip that brings the 3-day total to 600 tips (120.0 mm);
 *   • the total drops below 120 mm when enough of the oldest tips are more than
 *     72 h old (a tip exactly 72 h old has left);
 *   • the all-clear is 48 h after that, unless the total reaches 120 mm again.
 *
 * The expected events were calculated by hand, not by the engine: the engine is
 * what is being tested against them.
 */

export const SCENARIO_START = Date.UTC(2026, 10, 2, 13, 0, 0); // 3 Nov 2026 00:00 AEDT
export const LOCATION = 'Marrickville';
export const LOGGER = 'MKV-RIMCO-01';
export const TIP_MM = 0.2;

export interface Storm {
  /** Hours after the scenario starts. */
  startH: number;
  durationH: number;
  /** mm per hour, steady. */
  rate: number;
}

export interface ExpectedEvent {
  kind: RainEventKind;
  /** Hours:minutes after the start, "74:02". */
  at: string;
  why: string;
}

export interface RainScenario {
  id: string;
  title: string;
  /** What is being proved, in one line. */
  proves: string;
  storms: Storm[];
  /** How long to run, hours. */
  runH: number;
  expected: ExpectedEvent[];
  /** Something that must NOT happen, said for the tester. */
  mustNot?: string;
}

export const SCENARIOS: RainScenario[] = [
  {
    id: 'R3D-01',
    title: 'Just under the line',
    proves: '118 mm over two days does not raise the alert.',
    storms: [
      { startH: 0, durationH: 10, rate: 6 },
      { startH: 48, durationH: 9 + 40 / 60, rate: 6 },
    ],
    runH: 144,
    expected: [],
    mustNot: 'No alert at any time: the most rain in any 72 hours is 118.0 mm (60 mm + 58 mm).',
  },
  {
    id: 'R3D-02',
    title: 'Exactly 120 mm, from two storms',
    proves: 'Rain on different days adds up, and exactly 120.0 mm counts.',
    storms: [
      { startH: 0, durationH: 10, rate: 6 },
      { startH: 50, durationH: 10, rate: 6 },
    ],
    runH: 132,
    expected: [
      {
        kind: 'alert',
        at: '60:00',
        why: 'Last tip of the second storm: 60 mm + 60 mm = 120.0 mm in 72 h.',
      },
      { kind: 'countdown', at: '72:02', why: 'First tip (00:02) is now 72 h old: total 119.8 mm.' },
      {
        kind: 'all-clear',
        at: '120:02',
        why: '48 h after the countdown started, with no more rain.',
      },
    ],
  },
  {
    id: 'R3D-03',
    title: 'One storm, then dry',
    proves:
      'Alert, then it stays in force until the storm leaves the 3-day window, then 48 h vigilance.',
    storms: [{ startH: 0, durationH: 22, rate: 6 }],
    runH: 132,
    expected: [
      { kind: 'alert', at: '20:00', why: '600th tip: 120.0 mm after 20 h of 6 mm/h.' },
      {
        kind: 'countdown',
        at: '74:02',
        why: '61st tip (02:02) is 72 h old: 132 − 12.2 = 119.8 mm.',
      },
      { kind: 'all-clear', at: '122:02', why: '48 h after the countdown started.' },
    ],
    mustNot:
      'No countdown while the 3-day total is still 120 mm or more (20:00 to 74:02), even though it stopped raining at 22:00.',
  },
  {
    id: 'R3D-04',
    title: 'Heavy rain again during the countdown',
    proves: 'A re-trigger during vigilance restarts the full 48 hours.',
    storms: [
      { startH: 0, durationH: 22, rate: 6 },
      { startH: 96, durationH: 11, rate: 12 },
    ],
    runH: 228,
    expected: [
      { kind: 'alert', at: '20:00', why: 'As R3D-03.' },
      { kind: 'countdown', at: '74:02', why: 'As R3D-03; would end at 122:02.' },
      {
        kind: 'retrigger',
        at: '106:00',
        why: '600th tip of the second storm (12 mm/h from 96:00): 120.0 mm again.',
      },
      {
        kind: 'countdown',
        at: '169:01',
        why: '61st tip of the second storm (97:01) is 72 h old: 119.8 mm.',
      },
      { kind: 'all-clear', at: '217:01', why: '48 h after the second countdown started.' },
    ],
    mustNot: 'No all-clear at 122:02 — the first countdown was cancelled by the re-trigger.',
  },
  {
    id: 'R3D-05',
    title: 'Light rain during the countdown',
    proves: 'Rain that does not bring the total back to 120 mm does not restart the countdown.',
    storms: [
      { startH: 0, durationH: 22, rate: 6 },
      { startH: 90, durationH: 5, rate: 6 },
    ],
    runH: 132,
    expected: [
      { kind: 'alert', at: '20:00', why: 'As R3D-03.' },
      { kind: 'countdown', at: '74:02', why: 'As R3D-03.' },
      {
        kind: 'all-clear',
        at: '122:02',
        why: 'The 30 mm shower (90:00–95:00) never brings the total back to 120 mm.',
      },
    ],
    mustNot: 'No re-trigger, and the all-clear is not delayed.',
  },
  {
    id: 'R3D-06',
    title: 'Long steady drizzle',
    proves: 'Slow rain over days reaches the line too, with no single heavy burst.',
    storms: [{ startH: 0, durationH: 60, rate: 2.4 }],
    runH: 144,
    expected: [
      { kind: 'alert', at: '50:00', why: '600th tip at 2.4 mm/h (a tip every 5 min): 120.0 mm.' },
      {
        kind: 'countdown',
        at: '82:05',
        why: '121st tip (10:05) is 72 h old: 144 − 24.2 = 119.8 mm.',
      },
      { kind: 'all-clear', at: '130:05', why: '48 h after the countdown started.' },
    ],
  },
];

/** Every tip in a scenario: steady storms, one tip each 0.2 mm, the first one interval in. */
export function tipsFor(s: RainScenario): RainTip[] {
  const tips: RainTip[] = [];
  for (const storm of s.storms) {
    const everyMs = (TIP_MM / storm.rate) * HOUR;
    const count = Math.round((storm.durationH * storm.rate) / TIP_MM);
    const start = SCENARIO_START + storm.startH * HOUR;
    for (let i = 1; i <= count; i++) tips.push({ t: Math.round(start + i * everyMs), mm: TIP_MM });
  }
  return tips.sort((a, b) => a.t - b.t);
}

/** "74:02" → epoch ms. */
export function atToMs(at: string): number {
  const [h, m] = at.split(':').map(Number);
  return SCENARIO_START + h * HOUR + m * MIN;
}

/** Epoch ms → "74:02" after the start. */
export function msToAt(t: number): string {
  const mins = Math.round((t - SCENARIO_START) / MIN);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

export const EVENT_LABEL: Record<RainEventKind, string> = {
  alert: 'Alert raised',
  countdown: 'Countdown started',
  retrigger: 'Re-triggered',
  'all-clear': 'All-clear sent',
};

export interface CheckRow {
  kind: RainEventKind;
  expectedAt?: string;
  actualAt?: string;
  pass: boolean;
}

/** Expected against actual, in order. An event nobody expected is a fail too. */
export function checkRun(
  expected: ExpectedEvent[],
  actual: { kind: RainEventKind; t: number }[],
): { rows: CheckRow[]; pass: boolean } {
  const rows: CheckRow[] = [];
  const n = Math.max(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    const e = expected[i];
    const a = actual[i];
    rows.push({
      kind: (e ?? a).kind,
      expectedAt: e?.at,
      actualAt: a ? msToAt(a.t) : undefined,
      pass: Boolean(e && a && e.kind === a.kind && atToMs(e.at) === a.t),
    });
  }
  return { rows, pass: rows.every((r) => r.pass) };
}
