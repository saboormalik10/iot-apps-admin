import { evaluate } from '../src/alert-rules/evaluate';

/**
 * Pure unit test for the alert threshold comparator (no DB/app needed). Runs
 * under the same jest-e2e config via the `.e2e-spec.ts` suffix.
 */
describe('alert evaluate() comparator (unit)', () => {
  it('gt', () => {
    expect(evaluate('gt', 5, 3)).toBe(true);
    expect(evaluate('gt', 3, 3)).toBe(false);
    expect(evaluate('gt', 2, 3)).toBe(false);
  });
  it('gte', () => {
    expect(evaluate('gte', 3, 3)).toBe(true);
    expect(evaluate('gte', 4, 3)).toBe(true);
    expect(evaluate('gte', 2, 3)).toBe(false);
  });
  it('lt', () => {
    expect(evaluate('lt', 2, 3)).toBe(true);
    expect(evaluate('lt', 3, 3)).toBe(false);
  });
  it('lte', () => {
    expect(evaluate('lte', 3, 3)).toBe(true);
    expect(evaluate('lte', 4, 3)).toBe(false);
  });
});

/**
 * Threshold unit conversion.
 *
 * THE DEFECT THIS GUARDS
 * `wind_speed` is stored as `windSpeedMs` (metres per second), while the whole
 * dashboard displays km/h. The comparator was handed `rule.threshold` raw, so a
 * perfectly reasonable "wind speed > 20 km/h" rule was evaluated as 20 m/s —
 * it could only fire at 72 km/h. The station's record maximum is 35.9 km/h, so
 * that rule was armed, looked correct in the UI, and could never fire. Nothing
 * reported it.
 *
 * Sensors whose display unit already equals their stored unit (%, hPa, °C) were
 * unaffected, which is why it survived: only wind shows it.
 */
describe('alert threshold unit conversion', () => {
  const { thresholdInStoredUnit, valueInRuleUnit, SENSOR_STORED_UNIT } =
    require('../src/alert-rules/evaluate') as typeof import('../src/alert-rules/evaluate');
  const { convertUnit } = require('../src/analytics/analytics.util') as typeof import('../src/analytics/analytics.util');

  it('converts a km/h wind threshold into stored m/s', () => {
    expect(thresholdInStoredUnit('wind_speed', 20, 'km/h', convertUnit)).toBeCloseTo(5.556, 2);
  });

  it('leaves a threshold already in the stored unit untouched', () => {
    expect(thresholdInStoredUnit('wind_speed', 20, 'm/s', convertUnit)).toBe(20);
    expect(thresholdInStoredUnit('humidity', 80, '%', convertUnit)).toBe(80);
    expect(thresholdInStoredUnit('pressure', 1013, 'hPa', convertUnit)).toBe(1013);
  });

  it('converts knots and °F', () => {
    expect(thresholdInStoredUnit('wind_speed', 15, 'knots', convertUnit)).toBeCloseTo(7.717, 2);
    expect(thresholdInStoredUnit('temperature', 100, '°F', convertUnit)).toBeCloseTo(37.778, 2);
  });

  it('makes a real gust actually fire the rule it should', () => {
    // 9.97 m/s = 35.9 km/h — the highest reading this station has ever recorded.
    const gust = 9.97;
    const raw = 20; // "> 20 km/h"
    expect(evaluate('gt', gust, raw)).toBe(false); // the old behaviour: silent
    const converted = thresholdInStoredUnit('wind_speed', raw, 'km/h', convertUnit);
    expect(evaluate('gt', gust, converted)).toBe(true); // fixed
  });

  it('never invents a number when the unit is unknown', () => {
    // An unconvertible unit must fall back to the threshold as written rather
    // than silently producing a wrong one.
    expect(thresholdInStoredUnit('wind_speed', 20, 'bananas', convertUnit)).toBe(20);
    expect(thresholdInStoredUnit('wind_speed', 20, '', convertUnit)).toBe(20);
    expect(thresholdInStoredUnit('unknown_sensor', 20, 'km/h', convertUnit)).toBe(20);
  });

  it('reports the reading back in the rule’s unit', () => {
    // The message used to print the stored value beside the rule's unit label:
    // "read 9.97km/h" for a 35.9 km/h gust.
    expect(valueInRuleUnit('wind_speed', 9.97, 'km/h', convertUnit)).toBeCloseTo(35.89, 1);
    expect(valueInRuleUnit('wind_speed', 9.97, 'm/s', convertUnit)).toBe(9.97);
  });

  it('round-trips: a threshold converted and back is unchanged', () => {
    for (const unit of ['km/h', 'knots', 'mph']) {
      const stored = thresholdInStoredUnit('wind_speed', 20, unit, convertUnit);
      expect(valueInRuleUnit('wind_speed', stored, unit, convertUnit)).toBeCloseTo(20, 1);
    }
  });

  it('every sensor the evaluator maps has a stored unit declared', () => {
    // A sensor missing from SENSOR_STORED_UNIT silently skips conversion, which
    // is the failure this whole change exists to remove.
    const { MET_SENSOR_MAP, NEP_SENSOR_MAP } = require('../src/alert-rules/evaluate');
    for (const key of [...Object.keys(MET_SENSOR_MAP), ...Object.keys(NEP_SENSOR_MAP)]) {
      expect(SENSOR_STORED_UNIT[key]).toBeDefined();
    }
  });
});
