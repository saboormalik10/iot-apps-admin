/**
 * One reading in the shape the ingest pipeline takes — what QC checks, what the
 * minute aggregate averages. The sensor stream produces these (stream/to-met-row.ts).
 */
export interface ParsedMetRow {
  timestampMs: number;
  /** The raw line as received, stored verbatim on MetMeasure.dataSentence for provenance. */
  raw: string;
  windSpeedMs: number | null;
  windSpeedKmh: number | null;
  windSpeedKnots: number | null;
  windDirRelDeg: number | null;
  tempC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  dewPointC: number | null;
  solarWm2: number | null;
  precipMm: number | null;
  voltageV: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  /** NMEA validity flag: 'A' = valid, 'V' = void. Anything else is passed through. */
  status: string | null;
  /**
   * QC codes, set by `applyQc` AFTER parsing — never by the parser itself.
   *
   * Absent on a good reading, which is the overwhelming majority, so it costs
   * nothing to store. Present means at least one field on this row failed a
   * check and was nulled; the raw line in `dataSentence` still holds the
   * original value.
   */
  qc?: string[];
}
