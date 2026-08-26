import { describe, it, expect } from 'vitest';

import { MET_SENSOR_OPTIONS, sensorOptionsFor, ruleSummary } from '@/features/alerts/alert-constants';

/**
 * Sensor availability in the alert-rule builder (M17 W2).
 *
 * The static MET list has six sensors; the wind station reports two. Offering the
 * other four lets an operator build a rule that can never fire — it sits in the
 * table looking armed and simply never triggers.
 *
 * The dialog computes this inline from the devices it already holds; this pins
 * the rule so the intent survives a refactor.
 */

/** Mirrors the dialog's computation. */
function availableFor(
  appType: 'MET' | 'NEP',
  chosen: { availableSensors?: string[] }[],
): { key: string }[] {
  const all = sensorOptionsFor(appType);
  const known = chosen.filter((d) => (d.availableSensors?.length ?? 0) > 0);
  if (known.length === 0) return all;
  return all.filter((opt) => known.every((d) => d.availableSensors!.includes(opt.key)));
}

const WIND_ONLY = { availableSensors: ['wind_speed', 'wind_dir'] };
const FULL = { availableSensors: ['wind_speed', 'wind_dir', 'temperature', 'humidity', 'pressure', 'dew_point'] };

describe('alert-rule sensor options', () => {
  it('offers only what a wind-only station reports', () => {
    const keys = availableFor('MET', [WIND_ONLY]).map((s) => s.key);
    expect(keys).toEqual(['wind_speed', 'wind_dir']);
    expect(keys).not.toContain('temperature');
    expect(keys).not.toContain('pressure');
  });

  it('offers everything for a fully-equipped station', () => {
    expect(availableFor('MET', [FULL])).toHaveLength(MET_SENSOR_OPTIONS.length);
  });

  it('uses the INTERSECTION across several devices', () => {
    // The dialog creates one rule PER selected device, so a sensor only some of
    // them have would produce rules that can never fire on the rest.
    const keys = availableFor('MET', [WIND_ONLY, FULL]).map((s) => s.key);
    expect(keys).toEqual(['wind_speed', 'wind_dir']);
  });

  it('fails open when no device is selected yet', () => {
    expect(availableFor('MET', [])).toHaveLength(MET_SENSOR_OPTIONS.length);
  });

  it('fails open for a device that has not ingested anything', () => {
    // An empty list means "unknown", not "reports nothing" — otherwise a freshly
    // provisioned station could have no rules built for it at all.
    expect(availableFor('MET', [{ availableSensors: [] }])).toHaveLength(MET_SENSOR_OPTIONS.length);
  });

  it('mirrors the backend evaluator, so no offered sensor is dead', () => {
    // These keys must match MET_SENSOR_MAP in alert-rules/evaluate.ts exactly.
    expect(MET_SENSOR_OPTIONS.map((s) => s.key).sort()).toEqual(
      ['dew_point', 'humidity', 'pressure', 'temperature', 'wind_dir', 'wind_speed'].sort(),
    );
  });

  it('summarises a wind rule the way the table shows it', () => {
    expect(
      ruleSummary({ appType: 'MET', sensor: 'wind_speed', condition: 'gt', threshold: 12, unit: 'm/s' }),
    ).toBe('Wind speed > 12 m/s');
  });
});
