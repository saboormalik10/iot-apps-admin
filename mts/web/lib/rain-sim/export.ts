import { HOUR, RAIN_MESSAGES, THREE_DAY_RULE, hourlyRain, runRainRule } from './engine';
import {
  EVENT_LABEL,
  LOCATION,
  LOGGER,
  SCENARIO_START,
  atToMs,
  msToAt,
  tipsFor,
  type RainScenario,
} from './scenarios';

/**
 * The test data for one scenario, as the files a tester opens in Excel: every gauge
 * tip, an hourly summary to check the 3-day total by hand, and the expected events.
 * Used by `yarn export:rain` and by the download buttons on the simulation screen.
 */

const sydney = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function sydneyStamp(t: number): string {
  const p = Object.fromEntries(sydney.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** The byte-order mark makes Excel read "≥" and "—" as UTF-8. */
function csv(rows: (string | number)[][]): string {
  const cell = (c: string | number) =>
    /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c);
  return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

export function fileBase(s: RainScenario): string {
  return `${s.id}-${s.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-$/, '')}`;
}

export function tipsCsv(s: RainScenario): string {
  return csv([
    ['timestamp_sydney', 'timestamp_utc', 'location', 'logger_id', 'rain_mm'],
    ...tipsFor(s).map((x) => [
      sydneyStamp(x.t),
      new Date(x.t).toISOString(),
      LOCATION,
      LOGGER,
      x.mm.toFixed(1),
    ]),
  ]);
}

export function hourlyCsv(s: RainScenario): string {
  const tips = tipsFor(s);
  const to = SCENARIO_START + s.runH * HOUR;
  const run = runRainRule(tips, THREE_DAY_RULE, SCENARIO_START, to, HOUR);
  const at = new Map(run.samples.map((x) => [x.t, x]));
  return csv([
    ['hour_ending', 'time_from_start', 'rain_in_hour_mm', 'three_day_total_mm', 'state'],
    ...hourlyRain(tips, SCENARIO_START, to).map((h) => {
      const end = h.t + HOUR;
      const x = at.get(end);
      return [
        sydneyStamp(end),
        msToAt(end),
        h.mm.toFixed(1),
        x ? x.totalMm.toFixed(1) : '',
        x?.state ?? '',
      ];
    }),
  ]);
}

export function expectedCsv(s: RainScenario): string {
  return csv([
    ['event', 'time_from_start', 'timestamp_sydney', 'why', 'message'],
    ...s.expected.map((e) => [
      EVENT_LABEL[e.kind],
      e.at,
      sydneyStamp(atToMs(e.at)),
      e.why,
      RAIN_MESSAGES[e.kind],
    ]),
  ]);
}
