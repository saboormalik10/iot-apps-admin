/**
 * Calculations defined by the WMO Guide to Instruments and Methods of
 * Observation (WMO-No. 8), kept in one place so the definitions are auditable.
 *
 * These are pure and exported so the maths is tested directly. A meteorological
 * formula that is only exercised through an aggregation pipeline is a formula
 * nobody has checked.
 */

/** WMO reports wind as a 10-minute mean. */
export const WMO_MEAN_WINDOW_MS = 10 * 60_000;

/** WMO defines a gust as the peak 3-SECOND mean, not the peak instant. */
export const WMO_GUST_WINDOW_MS = 3_000;

/**
 * Mean wind direction, averaged as VECTORS.
 *
 * The arithmetic mean of bearings is wrong, and wrong in a way that looks
 * plausible: 350° and 10° are both nearly north, and their arithmetic mean is
 * 180° — due south. A wind rose built that way is not slightly off, it points
 * the opposite way.
 *
 * WMO-No. 8 specifies the vector method: convert each bearing to a unit vector,
 * average the components, and take the bearing of the result.
 *
 * Returns null for an empty input, and also when the vectors cancel — a set
 * spread evenly around the compass has no mean direction, and reporting one
 * (0°, say, from floating-point residue) would invent a northerly that was
 * never there.
 */
export function vectorMeanDirectionDeg(bearings: readonly (number | null)[]): number | null {
  let sumSin = 0;
  let sumCos = 0;
  let n = 0;

  for (const b of bearings) {
    if (b === null || !Number.isFinite(b)) continue;
    const rad = (b * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
    n += 1;
  }
  if (n === 0) return null;

  const meanSin = sumSin / n;
  const meanCos = sumCos / n;

  // Resultant length. Near zero means the directions cancelled and the mean is
  // undefined — not north.
  if (Math.hypot(meanSin, meanCos) < 1e-9) return null;

  const deg = (Math.atan2(meanSin, meanCos) * 180) / Math.PI;
  return Math.round((((deg % 360) + 360) % 360) * 100) / 100;
}

/** One wind sample: when it was taken, how fast, and from where. */
export interface WindSample {
  timestampMs: number;
  speedMs: number | null;
  dirDeg?: number | null;
}

export interface GustResult {
  /** Peak 3-second mean speed, m/s. */
  gustMs: number;
  /** When that 3-second window ended. */
  atMs: number;
  /** Direction at the peak, vector-averaged over the same 3 seconds. */
  dirDeg: number | null;
}

/**
 * Peak 3-second mean — the WMO gust.
 *
 * Ours used to be the single highest reading in the period. That is a different
 * quantity: it reads high, because one noisy sample is enough, and it cannot be
 * compared against any reference station reporting to the standard.
 *
 * The window is by TIME, not by sample count. The logger is nominally 1 Hz but
 * not exactly — a real minute arrives at :00, :02, :03, :04 — so "the last three
 * documents" would silently be a 4-second window whenever a second was skipped.
 */
export function peakGust(
  samples: readonly WindSample[],
  windowMs: number = WMO_GUST_WINDOW_MS,
): GustResult | null {
  const usable = samples
    .filter((s) => s.speedMs !== null && Number.isFinite(s.speedMs))
    .sort((a, b) => a.timestampMs - b.timestampMs);
  if (usable.length === 0) return null;

  let best: GustResult | null = null;
  let start = 0;
  let sum = 0;

  for (let end = 0; end < usable.length; end++) {
    sum += usable[end].speedMs as number;
    // Drop anything that has fallen out of the trailing window.
    while (usable[end].timestampMs - usable[start].timestampMs >= windowMs) {
      sum -= usable[start].speedMs as number;
      start += 1;
    }
    const n = end - start + 1;
    const mean = sum / n;

    // Strictly greater, so the EARLIEST window wins a tie — matching how the
    // previous implementation resolved ties, and stable across reruns.
    if (best === null || mean > best.gustMs) {
      best = {
        gustMs: Math.round(mean * 100) / 100,
        atMs: usable[end].timestampMs,
        dirDeg: vectorMeanDirectionDeg(usable.slice(start, end + 1).map((s) => s.dirDeg ?? null)),
      };
    }
  }

  return best;
}

export interface MeanWindResult {
  /** Scalar mean speed over the window, m/s. */
  speedMs: number | null;
  /** Vector mean direction over the window, degrees. */
  dirDeg: number | null;
  /** How many samples went in — a 10-minute mean from 3 samples is not one. */
  samples: number;
}

/**
 * The WMO 10-minute mean: scalar mean for SPEED, vector mean for DIRECTION.
 *
 * The two are averaged differently on purpose. Speed is a magnitude and averages
 * arithmetically; direction is an angle and does not.
 */
export function meanWind(samples: readonly WindSample[]): MeanWindResult {
  const speeds = samples
    .map((s) => s.speedMs)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  return {
    speedMs: speeds.length ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 100) / 100 : null,
    dirDeg: vectorMeanDirectionDeg(samples.map((s) => s.dirDeg ?? null)),
    samples: speeds.length,
  };
}
