/**
 * Classification scales — MIRRORED from backend `src/analytics/analytics.util.ts`
 * (plan §10.9). The backend owns these thresholds/labels; a chart that invents its
 * own would silently disagree with the API. The CI `check-contract` step diffs the
 * enumerations here against the backend file, so labels/boundaries can't drift.
 *
 * COLOUR-SOURCE RULE (§10.9): `NTU_CLASSES` ships a raw hex per class on the backend,
 * but that hex is NOT dark-mode/CVD-validated. We map each class **by index** onto our
 * own validated palette token (a CSS `--role`), and NEVER render the backend hex.
 * The 5 tendency / 3 fog / 8 comfort states likewise map onto reserved status tokens.
 */

/** A design-system colour role (CSS custom property, minus the `--`). Never a raw hex. */
export type PaletteRole =
  | 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'chart-6' | 'chart-7' | 'chart-8'
  | 'seq-0' | 'seq-1' | 'seq-2' | 'seq-3' | 'seq-4' | 'seq-5'
  | 'status-ok' | 'status-warn' | 'status-error' | 'status-info' | 'status-offline';

export const cssVar = (role: PaletteRole): string => `hsl(var(--${role}))`;

// ─── Wind-speed bands — 5, "Smithtek-aligned" (wind-rose stack + legend) ─────
export interface WindSpeedBand {
  label: string;
  minMs: number;
  maxMs: number;
  role: PaletteRole;
}
export const WIND_SPEED_BANDS: WindSpeedBand[] = [
  { label: 'Calm', minMs: 0, maxMs: 0.5, role: 'seq-0' },
  { label: 'Light', minMs: 0.5, maxMs: 3.3, role: 'seq-1' },
  { label: 'Gentle', minMs: 3.3, maxMs: 7.9, role: 'seq-2' },
  { label: 'Moderate', minMs: 7.9, maxMs: 13.8, role: 'seq-4' },
  { label: 'Strong', minMs: 13.8, maxMs: Infinity, role: 'seq-5' },
];

export function windBandIndex(ms: number): number {
  for (let i = 0; i < WIND_SPEED_BANDS.length; i++) {
    if (ms >= WIND_SPEED_BANDS[i].minMs && ms < WIND_SPEED_BANDS[i].maxMs) return i;
  }
  return WIND_SPEED_BANDS.length - 1;
}

// ─── Beaufort — 13 forces (0–12) ────────────────────────────────────────────
export interface BeaufortForce {
  force: number;
  label: string;
  description: string;
  minMs: number;
  maxMs: number;
}
export const BEAUFORT: BeaufortForce[] = [
  { force: 0, label: 'Calm', description: 'Smoke rises vertically', minMs: 0, maxMs: 0.5 },
  { force: 1, label: 'Light air', description: 'Smoke drift indicates direction', minMs: 0.5, maxMs: 1.5 },
  { force: 2, label: 'Light breeze', description: 'Wind felt on face, leaves rustle', minMs: 1.5, maxMs: 3.3 },
  { force: 3, label: 'Gentle breeze', description: 'Leaves and twigs in motion', minMs: 3.3, maxMs: 5.5 },
  { force: 4, label: 'Moderate breeze', description: 'Dust and loose paper raised', minMs: 5.5, maxMs: 7.9 },
  { force: 5, label: 'Fresh breeze', description: 'Small trees sway', minMs: 7.9, maxMs: 10.7 },
  { force: 6, label: 'Strong breeze', description: 'Large branches in motion', minMs: 10.7, maxMs: 13.8 },
  { force: 7, label: 'Near gale', description: 'Whole trees in motion', minMs: 13.8, maxMs: 17.1 },
  { force: 8, label: 'Gale', description: 'Twigs break off trees', minMs: 17.1, maxMs: 20.7 },
  { force: 9, label: 'Strong gale', description: 'Slight structural damage', minMs: 20.7, maxMs: 24.4 },
  { force: 10, label: 'Storm', description: 'Trees uprooted', minMs: 24.4, maxMs: 28.4 },
  { force: 11, label: 'Violent storm', description: 'Widespread damage', minMs: 28.4, maxMs: 32.6 },
  { force: 12, label: 'Hurricane', description: 'Devastation', minMs: 32.6, maxMs: Infinity },
];

export function beaufortFromMs(ms: number): BeaufortForce {
  for (const b of BEAUFORT) if (ms >= b.minMs && ms < b.maxMs) return b;
  return BEAUFORT[BEAUFORT.length - 1];
}

// ─── Comfort — 8 labels off effective temperature ───────────────────────────
export interface ComfortLevel {
  label: string;
  minC: number;
  role: PaletteRole;
}
export const COMFORT_LEVELS: ComfortLevel[] = [
  { label: 'Very Hot', minC: 40, role: 'status-error' },
  { label: 'Hot', minC: 32, role: 'chart-8' },
  { label: 'Warm', minC: 27, role: 'status-warn' },
  { label: 'Comfortable', minC: 16, role: 'status-ok' },
  { label: 'Cool', minC: 5, role: 'chart-2' },
  { label: 'Cold', minC: -10, role: 'status-info' },
  { label: 'Very Cold', minC: -28, role: 'seq-4' },
  { label: 'Dangerously Cold', minC: -Infinity, role: 'seq-5' },
];

export function comfortLabel(effectiveTempC: number | null): string {
  if (effectiveTempC == null) return 'Comfortable';
  for (const c of COMFORT_LEVELS) if (effectiveTempC >= c.minC) return c.label;
  return 'Dangerously Cold';
}

// ─── Fog risk — 3 levels off dew-point spread (°C) ──────────────────────────
export type FogLevel = 'HIGH' | 'MODERATE' | 'LOW';
export const FOG_LEVELS: { level: FogLevel; role: PaletteRole }[] = [
  { level: 'HIGH', role: 'status-error' },
  { level: 'MODERATE', role: 'status-warn' },
  { level: 'LOW', role: 'status-ok' },
];
export function fogRisk(spread: number): FogLevel {
  if (spread < 2) return 'HIGH';
  if (spread <= 4) return 'MODERATE';
  return 'LOW';
}

// ─── Pressure tendency — 5 states (normalised to hPa/3h) ────────────────────
export interface TendencyState {
  tendency: string;
  label: string;
  arrow: string;
  role: PaletteRole;
}
export const PRESSURE_TENDENCY: TendencyState[] = [
  { tendency: 'rising_rapidly', label: 'Rising rapidly — improving conditions', arrow: '⇈', role: 'status-ok' },
  { tendency: 'rising', label: 'Rising — generally improving', arrow: '↑', role: 'status-ok' },
  { tendency: 'steady', label: 'Steady — little change expected', arrow: '→', role: 'status-info' },
  { tendency: 'falling', label: 'Falling — watch for deteriorating conditions', arrow: '↓', role: 'status-warn' },
  { tendency: 'falling_rapidly', label: 'Falling rapidly — stormy conditions likely', arrow: '⇊', role: 'status-error' },
];

// ─── Turbidity / water-quality — 7 WHO/EPA classes (NTU) ────────────────────
// `role` maps each class onto our validated sequential+status ramp (NOT the backend hex).
export interface NtuClass {
  label: string;
  minNtu: number;
  maxNtu: number;
  waterQualityClass: string;
  role: PaletteRole;
}
export const NTU_CLASSES: NtuClass[] = [
  { label: '0–1', minNtu: 0, maxNtu: 1, waterQualityClass: 'WHO drinking compliant', role: 'status-ok' },
  { label: '1–10', minNtu: 1, maxNtu: 10, waterQualityClass: 'EPA recreational safe', role: 'seq-1' },
  { label: '10–50', minNtu: 10, maxNtu: 50, waterQualityClass: 'Slightly turbid', role: 'status-warn' },
  { label: '50–100', minNtu: 50, maxNtu: 100, waterQualityClass: 'Moderately turbid', role: 'chart-8' },
  { label: '100–500', minNtu: 100, maxNtu: 500, waterQualityClass: 'Turbid', role: 'chart-6' },
  { label: '500–1000', minNtu: 500, maxNtu: 1000, waterQualityClass: 'Highly turbid', role: 'status-error' },
  { label: '>1000', minNtu: 1000, maxNtu: Infinity, waterQualityClass: 'Extreme / flood', role: 'seq-5' },
];

export function ntuClassIndex(ntu: number): number {
  for (let i = 0; i < NTU_CLASSES.length; i++) {
    if (ntu >= NTU_CLASSES[i].minNtu && ntu < NTU_CLASSES[i].maxNtu) return i;
  }
  return NTU_CLASSES.length - 1;
}

// ─── Probe range (NTU thresholds) ───────────────────────────────────────────
export type ProbeRange = 'R1' | 'R2' | 'R3';
export function deriveProbeRange(turbidity: number): ProbeRange {
  if (turbidity < 10) return 'R1';
  if (turbidity <= 1000) return 'R2';
  return 'R3';
}

// ─── Interval enum — every time-bucketed endpoint ───────────────────────────
export const INTERVALS = ['1min', '5min', '1h', '4h', '1d'] as const;
export type Interval = (typeof INTERVALS)[number];
export const INTERVAL_MS: Record<Interval, number> = {
  '1min': 60_000,
  '5min': 300_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};
