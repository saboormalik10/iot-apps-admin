import type { ParameterId, Severity } from '@/lib/api/types';

/**
 * Which colour does which job — decided once, here, and nowhere else.
 *
 * Four kinds of colour appear in a chart, and each has one rule:
 *
 *   IDENTITY   which measurement is this?   → a series slot, fixed per parameter
 *   MAGNITUDE  how much?                     → the sequential ramp (heatmaps)
 *   ORDER      which band of a scale?        → the ordinal ramp (wind-rose speeds)
 *   POLARITY   which side of zero?           → the diverging pair (rate of rise)
 *
 * and, kept apart from all four, STATUS — how bad is it? — which only ever uses
 * the severity tokens and always travels with an icon and a word.
 *
 * Mixing these is the classic control-room misreading: a red *series* next to a
 * red *alarm*, or temperature and rainfall swapping colours between screens. So a
 * parameter wears the same slot on every screen, and slot 8 (red) is held back
 * entirely: on a system whose alarms are red, a red line reads as an alarm.
 */

const slot = (n: number) => `hsl(var(--chart-${n}))`;

export const PARAM_COLOR: Record<ParameterId, string> = {
  water_level: slot(1), // blue — the client's own colour for water
  temperature: slot(2), // orange
  rainfall: slot(3), // aqua
  rain_1h: slot(3),
  rain_3h: slot(3),
  rain_3d: slot(3),
  rain_10m: slot(3),
  rain_6h: slot(3),
  rain_24h: slot(3),
  battery: slot(4), // yellow — the sun
  solar_input: slot(4),
  humidity: slot(5), // magenta
  float_switch: slot(6), // green
  wind_mean: slot(7), // violet; the gust is the same hue, dashed
  wind_gust: slot(7),
  wind_dir: slot(7),
  /* Never on a chart with the float switch, so the two may share green. */
  pressure: slot(6),
};

/** For multi-series charts: slots in their validated order, never cycled. */
export const SERIES = [1, 2, 3, 4, 5, 6, 7].map(slot);

/**
 * The emphasis form: one series is the story, the rest are context. Context
 * wears this neutral rather than a second hue, so the eye goes where it should.
 */
export const CONTEXT = 'hsl(var(--muted-foreground))';

/** Sequential, light → dark in light mode and flipped in dark (see tokens.css). */
export const SEQ = [1, 2, 3, 4, 5, 6, 7].map((n) => `hsl(var(--seq-${n}))`);

/** Ordinal — five ordered bins, one hue. */
export const ORD = [1, 2, 3, 4, 5].map((n) => `hsl(var(--ord-${n}))`);

/** Diverging — falling water is the good side; rising is the bad one. */
export const DIV = {
  neg: 'hsl(var(--div-neg))',
  pos: 'hsl(var(--div-pos))',
  mid: 'hsl(var(--div-mid))',
};

/** Status — reserved meaning, never a series. */
export const SEVERITY_COLOR: Record<Severity, string> = {
  alert: 'hsl(var(--sev-alert))',
  warning: 'hsl(var(--sev-warning))',
  information: 'hsl(var(--sev-info))',
  cleared: 'hsl(var(--sev-cleared))',
};

/** Chart chrome. Solid hairlines; dashes are reserved for thresholds. */
export const CHROME = {
  grid: 'hsl(var(--grid))',
  axis: 'hsl(var(--axis))',
  ink: 'hsl(var(--foreground))',
  muted: 'hsl(var(--muted-foreground))',
  surface: 'hsl(var(--chart-surface))',
  threshold: 'hsl(var(--threshold))',
  thresholdSoft: 'hsl(var(--threshold-soft))',
};

/** Bin an index into a ramp of `n` steps. */
export function rampStep(ramp: string[], value: number, max: number): string {
  if (max <= 0 || value <= 0) return ramp[0];
  const i = Math.min(ramp.length - 1, Math.floor((value / max) * ramp.length));
  return ramp[i];
}
