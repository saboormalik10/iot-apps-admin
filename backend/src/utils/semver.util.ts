/**
 * Minimal dotted-version comparison (e.g. "2.1.0" vs "2.1.4"). Non-numeric or
 * missing segments are treated as 0. Enough for firmware version tracking —
 * avoids pulling in the full `semver` dependency.
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** True when `current` is strictly older than `target`. */
export function isOutdated(
  current: string | null | undefined,
  target: string | null | undefined,
): boolean {
  if (!current || !target) return false;
  return compareVersions(current, target) < 0;
}
