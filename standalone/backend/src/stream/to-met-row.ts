import type { ParsedMetRow } from '../ingest/met-row';
import { dewPointC } from '../ingest/dew-point';
import type { GmxReading } from './gmx';

/**
 * A GMX551 reading → the per-reading shape the ingest pipeline takes.
 *
 * From here every step is the one the cloud's SFTP files took: QC, the minute
 * aggregate (mean, vector-mean direction, WMO gust), 2- and 10-minute means.
 *
 * DIRECTION. The GMX551 has a compass, and sends both the raw bearing (`DIR`,
 * relative to the unit's north marker) and the compass-corrected one (`CDIR`).
 * The corrected one is used when present, unless `STREAM_DIRECTION=raw`. The
 * station's surveyed `headingOffsetDeg` is applied later, as for every station.
 *
 * SPEED. `SPEED`, never `CSPEED`: the corrected speed only differs on a moving
 * platform with GPS, and a fixed mast is neither.
 *
 * RAIN. `precipMm` is the site's running total from `RainAccumulator`, passed in —
 * never the gauge's own counter, which can reset.
 *
 * DEW POINT. Taken from the unit when it sends one; otherwise derived from
 * temperature and humidity with the same formula the environmental stream uses.
 */
export function toMetRow(
  reading: GmxReading,
  receivedAtMs: number,
  rainTotalMm: number | null,
  preferCorrectedDirection = true,
): ParsedMetRow {
  const v = reading.values;
  const speed = v.speed ?? null;
  const dir = preferCorrectedDirection && v.cdir != null ? v.cdir : v.dir ?? null;
  const tempC = v.temp ?? null;
  const humidityPct = v.rh ?? null;

  return {
    timestampMs: receivedAtMs,
    raw: reading.raw,
    windSpeedMs: speed,
    windSpeedKmh: speed === null ? null : Math.round(speed * 3.6 * 100) / 100,
    windSpeedKnots: speed === null ? null : Math.round((speed / 0.514444) * 100) / 100,
    windDirRelDeg: dir === null ? null : ((dir % 360) + 360) % 360,
    tempC,
    humidityPct,
    pressureHpa: v.press ?? null,
    dewPointC: v.dewpoint ?? dewPointC(tempC, humidityPct),
    solarWm2: v.solar ?? null,
    precipMm: rainTotalMm,
    voltageV: v.volt ?? null,
    gpsLat: null,
    gpsLng: null,
    status: reading.status,
  };
}

/**
 * What a reading's direction is measured from: `magnetic` when the compass-
 * corrected bearing (CDIR) was used, `mast` for the raw one (the unit's own north
 * marker). The station's heading offset turns either into TRUE north — the mast
 * alignment in one case, the local magnetic declination in the other — and the
 * dashboard says which it is while no offset is set.
 */
export function directionReference(reading: GmxReading, preferCorrectedDirection = true): 'magnetic' | 'mast' | null {
  const v = reading.values;
  if (preferCorrectedDirection && v.cdir != null) return 'magnetic';
  return v.dir != null ? 'mast' : null;
}

/** The sensor keys a set of rows carried — the portal shows charts and alert sensors for these. */
export function sensorsIn(rows: readonly ParsedMetRow[]): string[] {
  const keys: Array<[keyof ParsedMetRow, string]> = [
    ['windSpeedMs', 'wind_speed'],
    ['windDirRelDeg', 'wind_dir'],
    ['tempC', 'temperature'],
    ['humidityPct', 'humidity'],
    ['pressureHpa', 'pressure'],
    ['dewPointC', 'dew_point'],
    ['solarWm2', 'solar'],
    ['precipMm', 'precipitation'],
  ];
  return keys.filter(([field]) => rows.some((r) => r[field] !== null && r[field] !== undefined)).map(([, key]) => key);
}
