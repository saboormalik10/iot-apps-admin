/**
 * A compass bearing, normalised and rounded — and then normalised again.
 *
 * Rounding last is the trap. Every direction path here was written as
 * `round(((deg % 360) + 360) % 360)`, which is correct until the rounding
 * carries: 359.95° to whole degrees is 360°, and 360 is not a bearing — north
 * is 0. The query screen shows whole degrees, so anything from 359.5° up came
 * out as "360°" (QA, 24 Sep 2026: 28 stored minutes did it). At two decimal
 * places it needs 359.995°, which is rarer but not impossible at one reading a
 * second, for ever.
 *
 * So: normalise, round, wrap the carry away.
 */
export function roundBearing(deg: number, dp = 2): number {
  const factor = 10 ** dp;
  const normalised = ((deg % 360) + 360) % 360;
  return (Math.round(normalised * factor) / factor) % 360;
}
