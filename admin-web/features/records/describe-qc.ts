/**
 * QC codes → something an operator can act on.
 *
 * The codes are written by `backend/src/ingest/qc.ts` as `check:field`. They are
 * stable and machine-readable on purpose; this is the one place that turns them
 * into English, so the wording can change without touching stored data.
 */

const FIELD_LABELS: Record<string, string> = {
  windSpeedMs: 'Wind speed',
  windDirRelDeg: 'Wind direction',
  tempC: 'Temperature',
  humidityPct: 'Humidity',
  pressureHpa: 'Pressure',
  dewPointC: 'Dew point',
  solarWm2: 'Solar radiation',
  precipMm: 'Precipitation',
};

/** One code → one sentence saying what was rejected and why. */
export function describeQcCode(code: string): string {
  const [check, rest = ''] = [code.slice(0, code.indexOf(':')), code.slice(code.indexOf(':') + 1)];
  const field = FIELD_LABELS[rest] ?? rest;

  switch (check) {
    case 'status':
      // The instrument's own verdict. Worth naming the raw code — it is what the
      // sensor manual is indexed by.
      return `The sensor reported a fault (status "${rest}"), so its wind reading was not used`;
    case 'range':
      return `${field} was outside the range that is physically possible`;
    case 'step':
      return `${field} changed faster than it physically can between readings`;
    case 'persist':
      return `${field} did not move at all for hours — the sensor appears stuck`;
    case 'consistency':
      return 'Dew point was above air temperature, which cannot happen';
    default:
      return code;
  }
}

/** The whole row's QC state as one line, for a tooltip or a CSV column. */
export function describeQc(codes: readonly string[] | undefined): string | null {
  if (!codes || codes.length === 0) return null;
  return codes.map(describeQcCode).join('. ');
}
