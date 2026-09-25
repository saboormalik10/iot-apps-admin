/**
 * Dew point from temperature and relative humidity — Magnus-Tetens.
 *
 * The station reports temperature, humidity and pressure but NOT dew point, and
 * several screens are gated on having one: the Fog risk panel (dew-point spread),
 * the comfort indices, and the dew-point series in analytics. All are built and
 * currently dark.
 *
 * Deriving it is standard meteorology rather than an invention — the same
 * coefficients the WMO publishes for the −45…+60 °C range, accurate to about
 * ±0.35 °C. It is computed at ingest, once, so every consumer reads a stored
 * value instead of each re-deriving it slightly differently.
 */

/** Magnus coefficients over water, WMO — valid roughly −45 °C to +60 °C. */
const A = 17.62;
const B = 243.12;

/**
 * @param tempC     Air temperature in °C.
 * @param humidity  Relative humidity, 0–100 %.
 * @returns Dew point in °C, or null when either input is missing or nonsensical.
 */
export function dewPointC(tempC: number | null, humidity: number | null): number | null {
  if (tempC === null || humidity === null) return null;
  if (!Number.isFinite(tempC) || !Number.isFinite(humidity)) return null;
  // 0 % would make the logarithm diverge, and neither bound is physical. A
  // sensor reporting outside them is faulty, and a derived value from a faulty
  // reading is worse than no value.
  if (humidity <= 0 || humidity > 100) return null;
  if (tempC < -80 || tempC > 80) return null;

  const gamma = Math.log(humidity / 100) + (A * tempC) / (B + tempC);
  const dp = (B * gamma) / (A - gamma);
  if (!Number.isFinite(dp)) return null;

  // Two decimals: the inputs carry two, and the approximation is ±0.35 °C, so
  // more would be false precision.
  return Math.round(dp * 100) / 100;
}
