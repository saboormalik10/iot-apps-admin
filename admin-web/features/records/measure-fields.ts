import type { MetMeasureRow } from '@/lib/api/types';

/**
 * Numeric measure channels for the record-detail column-picker chart.
 *
 * `unit` is the CANONICAL unit these fields are stored in — see the note in
 * `features/analytics/sensors.ts`. The record-detail chart and table convert at
 * render time via `useUnits()`.
 */
export interface MeasureField {
  key: keyof MetMeasureRow;
  label: string;
  unit: string;
}

/**
 * Only channels this deployment actually records.
 *
 * Verified against the live database (612,246 readings over seven days): every
 * field below had values, and every field REMOVED had exactly zero. A picker
 * entry that can only ever draw an empty chart is not a feature — it reads as a
 * broken chart, and it buries the ten that work among twenty-one that do not.
 *
 * Removed, with their row counts all zero: windSpeedTrueMs, windSpeedRelMs,
 * precipMm, precipRateMmHr, solarWm2, qnhHpa, qfeHpa, gpsAltM, voltageV,
 * batteryVoltageV, currentA.
 *
 * None of this deletes data. The fields remain on the model, in the CSV export
 * and in the API — so the day a rain gauge or a solar sensor is fitted, the
 * entry comes back here and everything behind it already works. Check first with
 * `yarn field-presence` in the backend rather than re-adding one on a hunch.
 */
export const MEASURE_FIELDS: MeasureField[] = [
  { key: 'tempC', label: 'Temperature', unit: '°C' },
  { key: 'humidityPct', label: 'Humidity', unit: '%' },
  { key: 'pressureHpa', label: 'Pressure', unit: 'hPa' },
  { key: 'dewPointC', label: 'Dew point', unit: '°C' },
  { key: 'windSpeedMs', label: 'Wind speed', unit: 'm/s' },
  // The WMO quantities, stored on every minute record since Sept 2026.
  { key: 'windGustMs', label: 'Gust (3s peak)', unit: 'm/s' },
  { key: 'windSpeedMean2mMs', label: 'Wind 2-min mean', unit: 'm/s' },
  { key: 'windSpeedMean10mMs', label: 'Wind 10-min mean', unit: 'm/s' },
  { key: 'windDirTrueDeg', label: 'Wind dir (true)', unit: '°' },
  { key: 'windDirRelDeg', label: 'Wind dir (rel)', unit: '°' },
];

export const measureFieldLabel = (key: string): string => MEASURE_FIELDS.find((f) => f.key === key)?.label ?? key;
