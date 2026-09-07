import type { AlertAppType, AlertCondition, DeviceType } from '@/lib/api/types';

/**
 * Alert-rule builder options. The sensor lists mirror the backend evaluator's
 * MET_/NEP_SENSOR_MAP (alert-rules/evaluate.ts) EXACTLY — these are the only keys
 * a rule can actually fire on, so the builder never offers a dead sensor.
 */
export interface SensorOption {
  key: string;
  label: string;
  /**
   * The unit the sensor is STORED in, and the default when it is picked.
   *
   * Must match `SENSOR_STORED_UNIT` in the backend's alert-rules/evaluate.ts —
   * it is the unit the raw reading is compared in, so it is also the one
   * conversion is measured from.
   */
  unit: string;
  /**
   * Units a threshold may be written in for this sensor.
   *
   * Constrained rather than free text: the server converts the threshold into
   * `unit` before comparing, and it can only convert units it recognises. A
   * typed-in unit it cannot parse would leave the threshold unconverted — a rule
   * that looks armed and silently never fires, which is exactly the defect this
   * replaced.
   */
  units: string[];
}

export const MET_SENSOR_OPTIONS: SensorOption[] = [
  { key: 'wind_speed', label: 'Wind speed', unit: 'm/s', units: ['km/h', 'm/s', 'knots', 'mph'] },
  { key: 'wind_dir', label: 'Wind direction', unit: '°', units: ['°'] },
  { key: 'temperature', label: 'Temperature', unit: '°C', units: ['°C', '°F'] },
  { key: 'humidity', label: 'Humidity', unit: '%', units: ['%'] },
  { key: 'pressure', label: 'Pressure', unit: 'hPa', units: ['hPa', 'mbar', 'inHg', 'mmHg'] },
  { key: 'dew_point', label: 'Dew point', unit: '°C', units: ['°C', '°F'] },
];

export const NEP_SENSOR_OPTIONS: SensorOption[] = [
  { key: 'turbidity', label: 'Turbidity', unit: 'NTU', units: ['NTU'] },
  { key: 'temperature', label: 'Temperature', unit: '°C', units: ['°C', '°F'] },
];

export function sensorOptionsFor(appType: AlertAppType): SensorOption[] {
  return appType === 'MET' ? MET_SENSOR_OPTIONS : NEP_SENSOR_OPTIONS;
}

export function sensorLabel(appType: AlertAppType, key: string): string {
  return sensorOptionsFor(appType).find((s) => s.key === key)?.label ?? key;
}

/** An alert rule's appType maps to exactly one device family. */
export const APP_TYPE_TO_DEVICE_TYPE: Record<AlertAppType, DeviceType> = {
  MET: 'MET-LINK',
  NEP: 'NEP-LINK',
};

export const CONDITION_LABELS: Record<AlertCondition, string> = {
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
};

export const CONDITION_OPTIONS: { key: AlertCondition; label: string }[] = [
  { key: 'gt', label: 'greater than  (>)' },
  { key: 'gte', label: 'at least  (≥)' },
  { key: 'lt', label: 'less than  (<)' },
  { key: 'lte', label: 'at most  (≤)' },
];

/** A one-line human summary, e.g. "Turbidity > 300 NTU". */
export function ruleSummary(rule: {
  appType: AlertAppType;
  sensor: string;
  condition: AlertCondition;
  threshold: number;
  unit: string;
}): string {
  return `${sensorLabel(rule.appType, rule.sensor)} ${CONDITION_LABELS[rule.condition]} ${rule.threshold}${rule.unit ? ` ${rule.unit}` : ''}`;
}
