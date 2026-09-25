export type AlertCondition = 'gt' | 'lt' | 'gte' | 'lte';

/** Pure threshold comparator — unit-tested in isolation. */
export function evaluate(condition: AlertCondition, value: number, threshold: number): boolean {
  switch (condition) {
    case 'gt':
      return value > threshold;
    case 'lt':
      return value < threshold;
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    default:
      return false;
  }
}

/** rule.sensor → MET latest field (MetMeasuresEvent.latest). */
export const MET_SENSOR_MAP: Record<string, string> = {
  wind_speed: 'windSpeedMs',
  wind_dir: 'windDirTrueDeg',
  temperature: 'tempC',
  humidity: 'humidityPct',
  pressure: 'pressureHpa',
  dew_point: 'dewPointC',
};

/**
 * The unit each sensor is STORED in, per `MET_SENSOR_MAP`.
 *
 * A rule's `threshold` is entered in whatever unit the operator chose, but the
 * value it is compared against comes straight out of the database in the unit
 * below. Wind is the one that bites: readings are `windSpeedMs` (m/s) while the
 * entire dashboard displays km/h, so a perfectly reasonable "wind speed > 20
 * km/h" rule was being compared as 20 m/s — it would only have fired at 72 km/h,
 * which this station has never reached. The rule looked armed and could never
 * fire, and nothing said so.
 *
 * Sensors whose display unit already equals their stored unit (%, hPa, °C) were
 * unaffected, which is exactly why the bug survived: it only shows up on wind.
 */
export const SENSOR_STORED_UNIT: Record<string, string> = {
  wind_speed: 'm/s',
  wind_dir: '°',
  temperature: '°C',
  humidity: '%',
  pressure: 'hPa',
  dew_point: '°C',
};

/**
 * Convert a rule's threshold into the unit its sensor is stored in.
 *
 * Returns the threshold unchanged when the units already match, when the sensor
 * has no known stored unit, or when the conversion is not one `convertUnit`
 * recognises — never a silently wrong number. A dimensionless sensor (humidity,
 * bearing) has nothing to convert.
 */
export function thresholdInStoredUnit(
  sensor: string,
  threshold: number,
  ruleUnit: string | undefined,
  convert: (value: number, from: string, to: string) => { result: number | null },
): number {
  const stored = SENSOR_STORED_UNIT[sensor];
  const from = (ruleUnit ?? '').trim();
  if (!stored || !from) return threshold;
  if (from.toLowerCase() === stored.toLowerCase()) return threshold;

  // `convertUnit` THROWS on a pair it does not recognise. This field used to be
  // free text, so a rule saved before the dropdown can hold any string at all —
  // letting that propagate would take down evaluation for every rule on the
  // device, turning a bad label into an alerting outage. Fall back to the
  // threshold as written instead.
  try {
    const converted = convert(threshold, from, stored).result;
    return typeof converted === 'number' && Number.isFinite(converted) ? converted : threshold;
  } catch {
    return threshold;
  }
}

/**
 * Convert a stored reading into the unit a rule is written in, for display.
 *
 * The inverse of `thresholdInStoredUnit`, and used only for the message a person
 * reads. Falls back to the raw value when the conversion is unknown, so a
 * notification never invents a number.
 */
export function valueInRuleUnit(
  sensor: string,
  value: number,
  ruleUnit: string | undefined,
  convert: (v: number, from: string, to: string) => { result: number | null },
): number {
  const stored = SENSOR_STORED_UNIT[sensor];
  const to = (ruleUnit ?? '').trim();
  if (!stored || !to) return value;
  if (to.toLowerCase() === stored.toLowerCase()) return value;

  try {
    const converted = convert(value, stored, to).result;
    return typeof converted === 'number' && Number.isFinite(converted)
      ? Math.round(converted * 100) / 100
      : value;
  } catch {
    return value;
  }
}

/**
 * The words a person reads in an alert.
 *
 * A rule is stored in machine terms (`wind_speed`, `gt`) because that is what
 * the evaluator compares; the notification that lands on the wall screen should
 * not be. QA read "wind_speed gt 1m/s — read 18.29m/s" on the site PC.
 */
const SENSOR_LABEL: Record<string, string> = {
  wind_speed: 'Wind speed',
  wind_dir: 'Wind direction',
  temperature: 'Temperature',
  humidity: 'Humidity',
  pressure: 'Pressure',
  dew_point: 'Dew point',
};

export function sensorLabel(sensor: string): string {
  return SENSOR_LABEL[sensor] ?? sensor.replace(/_/g, ' ');
}

export function conditionPhrase(condition: string): string {
  switch (condition) {
    case 'gt':
      return 'above';
    case 'gte':
      return 'at or above';
    case 'lt':
      return 'below';
    case 'lte':
      return 'at or below';
    default:
      return condition;
  }
}

/**
 * Which reading of the minute crossed the line. An "above" rule fires on the
 * minute's HIGHEST reading and a "below" rule on its lowest — so the number in
 * the alert is not the minute average shown on the dashboard, and the message
 * says which it is.
 */
export function extremeWord(condition: string): string {
  return condition === 'gt' || condition === 'gte' ? 'peaked at' : 'dropped to';
}
