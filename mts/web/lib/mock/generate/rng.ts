/**
 * Seeded randomness.
 *
 * Every number on screen is derived from a seed and a timestamp, never from
 * `Math.random()`. Two consequences that matter for a design review:
 *
 *   • the demo looks identical every time it is opened, so a screenshot taken on
 *     Tuesday matches the screen the client sees on Thursday, and
 *   • a value and the sparkline beside it are the same function evaluated at
 *     different times, so they can never disagree.
 */

/** mulberry32 — small, fast, good enough, and deterministic. */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit hash of a string, so `sensorId` alone seeds a series. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Value noise over time: smooth, repeatable, and continuous across window edges —
 * so panning a chart does not make the line jump.
 */
export function noise(seed: number, t: number, periodMs: number): number {
  const x = t / periodMs;
  const i = Math.floor(x);
  const f = x - i;
  const a = rngFrom(seed + i)();
  const b = rngFrom(seed + i + 1)();
  // smoothstep, so the first derivative is continuous at the knots
  const u = f * f * (3 - 2 * f);
  return a * (1 - u) + b * u;
}

/** Layered noise, for a signal that looks natural rather than sinusoidal. */
export function fbm(seed: number, t: number, periodMs: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(seed + o * 7919, t, periodMs / 2 ** o);
    total += amp;
    amp /= 2;
  }
  return sum / total;
}
