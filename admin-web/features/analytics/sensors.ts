/**
 * The MET sensor allow-list feeding the analytics pickers (multi-sensor,
 * statistics, comparison). Mirrors the backend MET_SENSOR_FIELD map — §10.5 grew
 * it 12 → 15 by adding qnh / qfe / gps_altitude (fields already on MetMeasure).
 * Single source so every picker stays in sync.
 */
export interface SensorOption {
  key: string;
  label: string;
  unit: string;
}

export const MET_SENSORS: SensorOption[] = [
  { key: 'temperature', label: 'Temperature', unit: '°C' },
  { key: 'humidity', label: 'Humidity', unit: '%' },
  { key: 'pressure', label: 'Pressure', unit: 'hPa' },
  { key: 'wind_speed', label: 'Wind speed', unit: 'm/s' },
  { key: 'wind_dir', label: 'Wind direction', unit: '°' },
  { key: 'solar', label: 'Solar', unit: 'W/m²' },
  { key: 'precipitation', label: 'Precipitation', unit: 'mm' },
  { key: 'precip_rate', label: 'Precip rate', unit: 'mm/hr' },
  { key: 'dew_point', label: 'Dew point', unit: '°C' },
  { key: 'voltage', label: 'Voltage', unit: 'V' },
  { key: 'battery_voltage', label: 'Battery voltage', unit: 'V' },
  { key: 'current', label: 'Current', unit: 'A' },
  // §10.5 additions (12 → 15)
  { key: 'qnh', label: 'QNH', unit: 'hPa' },
  { key: 'qfe', label: 'QFE', unit: 'hPa' },
  { key: 'gps_altitude', label: 'GPS altitude', unit: 'm' },
];

export const sensorLabel = (key: string): string => MET_SENSORS.find((s) => s.key === key)?.label ?? key;
export const sensorUnit = (key: string): string => MET_SENSORS.find((s) => s.key === key)?.unit ?? '';
