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

/** rule.sensor → NEP sample field (NepSampleEvent.sample). */
export const NEP_SENSOR_MAP: Record<string, string> = {
  turbidity: 'turbidityValue',
  temperature: 'temperatureValue',
};

/** rule.sensor → MET latest field (MetMeasuresEvent.latest). */
export const MET_SENSOR_MAP: Record<string, string> = {
  wind_speed: 'windSpeedMs',
  wind_dir: 'windDirTrueDeg',
  temperature: 'tempC',
  humidity: 'humidityPct',
  pressure: 'pressureHpa',
  dew_point: 'dewPointC',
};
