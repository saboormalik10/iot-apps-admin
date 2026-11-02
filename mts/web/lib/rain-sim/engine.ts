/**
 * The 3-day rainfall rule (proposal §7.2), as one small engine.
 *
 *   • A running total of the rain in the last 72 hours: window (now − 72 h, now].
 *     A tip exactly 72 hours old has left the window.
 *   • The total reaching 120 mm (≥, so exactly 120.0 counts) raises the alert.
 *   • When the total falls back below 120 mm the 48-hour vigilance countdown starts;
 *     the alert and its instructions stay in force while it runs.
 *   • The total reaching 120 mm again during the countdown is a re-trigger: the
 *     alert is active again and the full 48 hours restart when it next falls below.
 *   • The countdown reaching zero sends the all-clear.
 *
 * The same engine drives the simulation screen, the automated check
 * (`yarn test:rain`) and the exported test data, so all three agree by construction.
 * It works in tenths of a millimetre, so 0.2 mm tips add up exactly.
 */

export const MIN = 60_000;
export const HOUR = 60 * MIN;

export interface RainTip {
  /** When the bucket tipped, epoch ms. */
  t: number;
  /** Rain in this tip, mm (0.2 for the RIMCO 7499). */
  mm: number;
}

export interface RainRule {
  thresholdMm: number;
  windowHours: number;
  vigilanceHours: number;
}

/** The proposal's 3-day rule (§7.2, values pending MTS confirmation). */
export const THREE_DAY_RULE: RainRule = { thresholdMm: 120, windowHours: 72, vigilanceHours: 48 };

export type RainState = 'normal' | 'alert' | 'vigilance';
export type RainEventKind = 'alert' | 'countdown' | 'retrigger' | 'all-clear';

export interface RainEvent {
  kind: RainEventKind;
  t: number;
  /** The 3-day total at that moment, mm. */
  totalMm: number;
  /** For a countdown: when it will end if nothing else happens. */
  endsAt?: number;
}

export interface RainSample {
  t: number;
  totalMm: number;
  state: RainState;
}

export interface RainRun {
  events: RainEvent[];
  /** The 3-day total and state, every `sampleMs` — what the chart draws. */
  samples: RainSample[];
}

/** The messages the alert engine sends, in the wording of proposal §7.2. */
export const RAIN_MESSAGES: Record<RainEventKind, string> = {
  alert:
    'ALERT — Rainfall ≥ 120 mm in 3 days. Initiate CJC-T front-of-train patrol between Hurlstone Park and Bankstown. Be prepared for network flooding.',
  countdown:
    '3-day total back below 120 mm. 48-hour vigilance in force: demobilise patrols when visibility is limited and implement a 60 kph TSR between Hurlstone Park and Bankstown until cancelled or visibility improves.',
  retrigger:
    'Rainfall ≥ 120 mm in 3 days again during vigilance. Alert active; the 48-hour vigilance restarts when the total falls back below 120 mm.',
  'all-clear':
    'CANCELLED — 48-hour rainfall vigilance ended with no further qualifying rain. Restore normal operations.',
};

/**
 * Runs the rule over `tips` from `from` to `to`, checking once a minute (tips fall on
 * whole minutes, so nothing is missed). Tips before `from` still count towards the
 * window — the gauge's history does not start when the test does.
 */
export function runRainRule(
  tips: RainTip[],
  rule: RainRule,
  from: number,
  to: number,
  sampleMs = 10 * MIN,
): RainRun {
  const sorted = [...tips].sort((a, b) => a.t - b.t);
  const tenths = sorted.map((x) => Math.round(x.mm * 10));
  const threshold = Math.round(rule.thresholdMm * 10);
  const windowMs = rule.windowHours * HOUR;
  const vigilanceMs = rule.vigilanceHours * HOUR;

  const events: RainEvent[] = [];
  const samples: RainSample[] = [];
  let added = 0; // tips with t ≤ now
  let removed = 0; // tips with t ≤ now − window
  let total = 0; // tenths of a mm in (now − window, now]
  let state: RainState = 'normal';
  let endsAt = 0;

  const start = Math.floor(from / MIN) * MIN;
  for (let t = start; t <= to; t += MIN) {
    while (added < sorted.length && sorted[added].t <= t) total += tenths[added++];
    while (removed < added && sorted[removed].t <= t - windowMs) total -= tenths[removed++];
    const over = total >= threshold;
    const mm = total / 10;

    if (state === 'normal' && over) {
      state = 'alert';
      events.push({ kind: 'alert', t, totalMm: mm });
    } else if (state === 'alert' && !over) {
      state = 'vigilance';
      endsAt = t + vigilanceMs;
      events.push({ kind: 'countdown', t, totalMm: mm, endsAt });
    } else if (state === 'vigilance' && over) {
      state = 'alert';
      events.push({ kind: 'retrigger', t, totalMm: mm });
    } else if (state === 'vigilance' && t >= endsAt) {
      state = 'normal';
      events.push({ kind: 'all-clear', t, totalMm: mm });
    }

    if ((t - start) % sampleMs === 0) samples.push({ t, totalMm: mm, state });
  }
  return { events, samples };
}

/** Rain per hour, for the bar chart and the hourly CSV. */
export function hourlyRain(tips: RainTip[], from: number, to: number): { t: number; mm: number }[] {
  const hours = Math.ceil((to - from) / HOUR);
  const out = Array.from({ length: hours }, (_, i) => ({ t: from + i * HOUR, mm: 0 }));
  for (const x of tips) {
    // A tip at exactly 01:00 belongs to the hour ending 01:00.
    const i = Math.ceil((x.t - from) / HOUR) - 1;
    if (i >= 0 && i < hours) out[i].mm = Math.round((out[i].mm + x.mm) * 10) / 10;
  }
  return out;
}
