import type { MetMeasureRow } from '@/lib/api/types';

/** Numeric measure channels for the record-detail column-picker chart. */
export interface MeasureField {
  key: keyof MetMeasureRow;
  label: string;
  unit: string;
}

export const MEASURE_FIELDS: MeasureField[] = [
  { key: 'tempC', label: 'Temperature', unit: '°C' },
  { key: 'humidityPct', label: 'Humidity', unit: '%' },
  { key: 'pressureHpa', label: 'Pressure', unit: 'hPa' },
  { key: 'windSpeedMs', label: 'Wind speed', unit: 'm/s' },
  { key: 'windSpeedTrueMs', label: 'Wind speed (true)', unit: 'm/s' },
  { key: 'windSpeedRelMs', label: 'Wind speed (rel)', unit: 'm/s' },
  { key: 'windDirTrueDeg', label: 'Wind dir (true)', unit: '°' },
  { key: 'windDirRelDeg', label: 'Wind dir (rel)', unit: '°' },
  { key: 'dewPointC', label: 'Dew point', unit: '°C' },
  { key: 'precipMm', label: 'Precipitation', unit: 'mm' },
  { key: 'precipRateMmHr', label: 'Precip rate', unit: 'mm/hr' },
  { key: 'solarWm2', label: 'Solar', unit: 'W/m²' },
  { key: 'qnhHpa', label: 'QNH', unit: 'hPa' },
  { key: 'qfeHpa', label: 'QFE', unit: 'hPa' },
  { key: 'gpsAltM', label: 'GPS altitude', unit: 'm' },
  { key: 'voltageV', label: 'Voltage', unit: 'V' },
  { key: 'batteryVoltageV', label: 'Battery voltage', unit: 'V' },
  { key: 'currentA', label: 'Current', unit: 'A' },
];

export const measureFieldLabel = (key: string): string => MEASURE_FIELDS.find((f) => f.key === key)?.label ?? key;
