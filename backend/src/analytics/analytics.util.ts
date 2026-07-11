/**
 * Analytics math & domain helpers.
 *
 * Pure functions only — no DB access. Covers wind-rose sectors, Beaufort
 * classification, comfort indices (heat index / wind chill), fog risk,
 * NTU water-quality classification, Pearson correlation, descriptive
 * statistics, interval bucketing, and unit conversion.
 */

// ─── MET sensor → DB field / unit maps ──────────────────────────────────────

export const MET_SENSOR_FIELD: Record<string, string> = {
  wind_speed: 'windSpeedMs',
  wind_dir: 'windDirTrueDeg',
  temperature: 'tempC',
  humidity: 'humidityPct',
  pressure: 'pressureHpa',
  solar: 'solarWm2',
  precipitation: 'precipMm',
  precip_rate: 'precipRateMmHr',
  dew_point: 'dewPointC',
  voltage: 'voltageV',
  battery_voltage: 'batteryVoltageV',
  current: 'currentA',
  // §10.5 — comparable atmospheric/altitude channels (fields already on MetMeasure).
  qnh: 'qnhHpa',
  qfe: 'qfeHpa',
  gps_altitude: 'gpsAltM',
};

export const MET_SENSOR_UNIT: Record<string, string> = {
  wind_speed: 'm/s',
  wind_dir: '°',
  temperature: '°C',
  humidity: '%',
  pressure: 'hPa',
  solar: 'W/m²',
  precipitation: 'mm',
  precip_rate: 'mm/hr',
  dew_point: '°C',
  voltage: 'V',
  battery_voltage: 'V',
  current: 'A',
  qnh: 'hPa',
  qfe: 'hPa',
  gps_altitude: 'm',
};

// ─── Wind rose: 16 compass sectors (22.5° each) ─────────────────────────────

export const WIND_SECTORS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

/** Map a 0–360° bearing to a sector index 0–15 (N centred on 0°). */
export function sectorIndex(deg: number): number {
  const norm = ((deg % 360) + 360) % 360;
  return Math.floor((norm + 11.25) / 22.5) % 16;
}

// ─── Wind speed bands (m/s) — Smithtek-aligned ──────────────────────────────

export interface SpeedBand {
  label: string;
  minMs: number;
  maxMs: number;
}

export const SPEED_BANDS: SpeedBand[] = [
  { label: 'Calm', minMs: 0, maxMs: 0.5 },
  { label: 'Light', minMs: 0.5, maxMs: 3.3 },
  { label: 'Gentle', minMs: 3.3, maxMs: 7.9 },
  { label: 'Moderate', minMs: 7.9, maxMs: 13.8 },
  { label: 'Strong', minMs: 13.8, maxMs: Infinity },
];

export function speedBandIndex(ms: number): number {
  for (let i = 0; i < SPEED_BANDS.length; i++) {
    if (ms >= SPEED_BANDS[i].minMs && ms < SPEED_BANDS[i].maxMs) return i;
  }
  return SPEED_BANDS.length - 1;
}

// ─── Beaufort scale ─────────────────────────────────────────────────────────

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
  for (const b of BEAUFORT) {
    if (ms >= b.minMs && ms < b.maxMs) return b;
  }
  return BEAUFORT[BEAUFORT.length - 1];
}

// ─── Comfort indices ────────────────────────────────────────────────────────

/**
 * Heat Index (Steadman, BOM-aligned). Only meaningful when tempC > 27 and
 * humidity > 40 %. Returns null otherwise.
 */
export function heatIndexC(tempC: number | null, humidityPct: number | null): number | null {
  if (tempC == null || humidityPct == null) return null;
  if (tempC <= 27 || humidityPct <= 40) return null;
  const t = (tempC * 9) / 5 + 32; // to °F
  const r = humidityPct;
  let hi =
    -42.379 +
    2.04901523 * t +
    10.14333127 * r -
    0.22475541 * t * r -
    0.00683783 * t * t -
    0.05481717 * r * r +
    0.00122874 * t * t * r +
    0.00085282 * t * r * r -
    0.00000199 * t * t * r * r;
  hi = ((hi - 32) * 5) / 9; // back to °C
  return Math.round(hi * 10) / 10;
}

/**
 * Wind Chill (JAG/TI). Only meaningful when tempC < 10 and windSpeed > 1.34 m/s.
 * Returns null otherwise.
 */
export function windChillC(tempC: number | null, windMs: number | null): number | null {
  if (tempC == null || windMs == null) return null;
  if (tempC >= 10 || windMs <= 1.34) return null;
  const v = windMs * 3.6; // km/h
  const wc = 13.12 + 0.6215 * tempC - 11.37 * Math.pow(v, 0.16) + 0.3965 * tempC * Math.pow(v, 0.16);
  return Math.round(wc * 10) / 10;
}

export function comfortLabel(effectiveTempC: number | null): string {
  if (effectiveTempC == null) return 'Comfortable';
  const t = effectiveTempC;
  if (t >= 40) return 'Very Hot';
  if (t >= 32) return 'Hot';
  if (t >= 27) return 'Warm';
  if (t >= 16) return 'Comfortable';
  if (t >= 5) return 'Cool';
  if (t >= -10) return 'Cold';
  if (t >= -28) return 'Very Cold';
  return 'Dangerously Cold';
}

export function fogRisk(spread: number): 'HIGH' | 'MODERATE' | 'LOW' {
  if (spread < 2) return 'HIGH';
  if (spread <= 4) return 'MODERATE';
  return 'LOW';
}

// ─── Pressure tendency (meteorological standard, normalised to hPa/3h) ──────

export function pressureTendency(deltaPerHr: number): { tendency: string; label: string } {
  const per3h = deltaPerHr * 3;
  if (per3h > 6) return { tendency: 'rising_rapidly', label: 'Rising rapidly — improving conditions' };
  if (per3h > 1.6) return { tendency: 'rising', label: 'Rising — generally improving' };
  if (per3h >= -1.6) return { tendency: 'steady', label: 'Steady — little change expected' };
  if (per3h >= -6) return { tendency: 'falling', label: 'Falling — watch for deteriorating conditions' };
  return { tendency: 'falling_rapidly', label: 'Falling rapidly — stormy conditions likely' };
}

// ─── NTU water-quality classification (WHO / EPA bands) ──────────────────────

export interface NtuClass {
  label: string;
  minNtu: number;
  maxNtu: number;
  waterQualityClass: string;
  color: string;
}

export const NTU_CLASSES: NtuClass[] = [
  { label: '0–1', minNtu: 0, maxNtu: 1, waterQualityClass: 'WHO drinking compliant', color: '#1a7a1a' },
  { label: '1–10', minNtu: 1, maxNtu: 10, waterQualityClass: 'EPA recreational safe', color: '#4caf50' },
  { label: '10–50', minNtu: 10, maxNtu: 50, waterQualityClass: 'Slightly turbid', color: '#ffeb3b' },
  { label: '50–100', minNtu: 50, maxNtu: 100, waterQualityClass: 'Moderately turbid', color: '#ff9800' },
  { label: '100–500', minNtu: 100, maxNtu: 500, waterQualityClass: 'Turbid', color: '#ff5722' },
  { label: '500–1000', minNtu: 500, maxNtu: 1000, waterQualityClass: 'Highly turbid', color: '#f44336' },
  { label: '>1000', minNtu: 1000, maxNtu: Infinity, waterQualityClass: 'Extreme / flood', color: '#b71c1c' },
];

export function ntuClassIndex(ntu: number): number {
  for (let i = 0; i < NTU_CLASSES.length; i++) {
    if (ntu >= NTU_CLASSES[i].minNtu && ntu < NTU_CLASSES[i].maxNtu) return i;
  }
  return NTU_CLASSES.length - 1;
}

export function deriveProbeRange(turbidity: number): 'R1' | 'R2' | 'R3' {
  if (turbidity < 10) return 'R1';
  if (turbidity <= 1000) return 'R2';
  return 'R3';
}

// ─── Descriptive statistics ─────────────────────────────────────────────────

export function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function stdDev(arr: number[], m?: number): number {
  if (arr.length < 2) return 0;
  const mu = m ?? mean(arr);
  const variance = arr.reduce((a, b) => a + (b - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function skewness(arr: number[]): number {
  const n = arr.length;
  if (n < 3) return 0;
  const mu = mean(arr);
  const sd = stdDev(arr, mu);
  if (sd === 0) return 0;
  const s = arr.reduce((a, b) => a + ((b - mu) / sd) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * s;
}

export function round(n: number | null, dp = 2): number | null {
  if (n == null || isNaN(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Pearson correlation coefficient between two equal-length numeric arrays. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

// ─── Interval bucketing ─────────────────────────────────────────────────────

export const INTERVAL_MS: Record<string, number> = {
  '1min': 60_000,
  '5min': 300_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export function bucketStart(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

// ─── Unit conversion ────────────────────────────────────────────────────────

const WIND_TO_MS: Record<string, (v: number) => number> = {
  'm/s': (v) => v,
  'km/h': (v) => v / 3.6,
  kt: (v) => v * 0.514444,
  knots: (v) => v * 0.514444,
  mph: (v) => v * 0.44704,
  bft: (v) => Math.pow(v / 0.836, 2 / 3),
};

const MS_TO_WIND: Record<string, (v: number) => number> = {
  'm/s': (v) => v,
  'km/h': (v) => v * 3.6,
  kt: (v) => v / 0.514444,
  knots: (v) => v / 0.514444,
  mph: (v) => v / 0.44704,
  bft: (v) => 0.836 * Math.pow(v, 1.5),
};

const PRESSURE_TO_HPA: Record<string, (v: number) => number> = {
  hpa: (v) => v,
  mbar: (v) => v,
  inhg: (v) => v * 33.8639,
  mmhg: (v) => v * 1.33322,
  psi: (v) => v * 68.9476,
};

const HPA_TO_PRESSURE: Record<string, (v: number) => number> = {
  hpa: (v) => v,
  mbar: (v) => v,
  inhg: (v) => v / 33.8639,
  mmhg: (v) => v / 1.33322,
  psi: (v) => v / 68.9476,
};

export interface UnitConvertResult {
  input: number;
  fromUnit: string;
  result: number;
  toUnit: string;
  label?: string;
}

export function convertUnit(value: number, fromUnit: string, toUnit: string): UnitConvertResult {
  const from = fromUnit.toLowerCase();
  const to = toUnit.toLowerCase();

  // Wind speed family
  if (WIND_TO_MS[from] && MS_TO_WIND[to]) {
    const ms = WIND_TO_MS[from](value);
    const result = round(MS_TO_WIND[to](ms), 3)!;
    const out: UnitConvertResult = { input: value, fromUnit, result, toUnit };
    if (to === 'bft') out.label = beaufortFromMs(ms).label;
    return out;
  }
  // Pressure family
  if (PRESSURE_TO_HPA[from] && HPA_TO_PRESSURE[to]) {
    const hpa = PRESSURE_TO_HPA[from](value);
    return { input: value, fromUnit, result: round(HPA_TO_PRESSURE[to](hpa), 3)!, toUnit };
  }
  // Temperature family
  const tempFrom = toCelsius(value, from);
  if (tempFrom != null) {
    const result = fromCelsius(tempFrom, to);
    if (result != null) return { input: value, fromUnit, result: round(result, 3)!, toUnit };
  }
  // Altitude family
  if ((from === 'm' || from === 'ft') && (to === 'm' || to === 'ft')) {
    const m = from === 'ft' ? value * 0.3048 : value;
    const result = to === 'ft' ? m / 0.3048 : m;
    return { input: value, fromUnit, result: round(result, 3)!, toUnit };
  }
  throw Object.assign(new Error(`Unsupported conversion: ${fromUnit} → ${toUnit}`), {
    statusCode: 400,
    code: 'UNSUPPORTED_UNIT',
  });
}

function toCelsius(v: number, unit: string): number | null {
  if (unit === '°c' || unit === 'c') return v;
  if (unit === '°f' || unit === 'f') return ((v - 32) * 5) / 9;
  if (unit === 'k') return v - 273.15;
  return null;
}

function fromCelsius(c: number, unit: string): number | null {
  if (unit === '°c' || unit === 'c') return c;
  if (unit === '°f' || unit === 'f') return (c * 9) / 5 + 32;
  if (unit === 'k') return c + 273.15;
  return null;
}
