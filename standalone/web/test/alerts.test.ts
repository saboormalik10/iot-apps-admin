import { describe, it, expect } from 'vitest';
import { alertRuleSchema, updateAlertRuleSchema } from '@/lib/api/schemas';
import { ruleSummary, sensorOptionsFor, APP_TYPE_TO_DEVICE_TYPE } from '@/features/alerts/alert-constants';

const OID = 'a'.repeat(24);

const baseRule = {
  name: 'Strong wind',
  deviceId: OID,
  appType: 'MET' as const,
  sensor: 'wind_speed',
  condition: 'gt' as const,
  threshold: 60,
  unit: 'km/h',
  cooldownMinutes: 60,
  notifyUserIds: [],
  isActive: true,
};

describe('alertRuleSchema (client is the primary guard — §10.6)', () => {
  it('accepts a well-formed rule', () => {
    expect(alertRuleSchema.safeParse(baseRule).success).toBe(true);
  });

  it('rejects a sensor that the app type / evaluator does not support', () => {
    // `solar` is a real MET aggregate sensor but the alert evaluator can't fire on it.
    const r = alertRuleSchema.safeParse({ ...baseRule, appType: 'MET', sensor: 'solar' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === 'sensor')).toBe(true);
  });

  it('rejects a water-quality sensor the evaluator no longer knows', () => {
    expect(alertRuleSchema.safeParse({ ...baseRule, sensor: 'turbidity' }).success).toBe(false);
  });

  it('rejects a negative cooldown (no @Min on the DTO)', () => {
    expect(alertRuleSchema.safeParse({ ...baseRule, cooldownMinutes: -5 }).success).toBe(false);
  });

  it('rejects a non-numeric threshold', () => {
    expect(alertRuleSchema.safeParse({ ...baseRule, threshold: Number('abc') }).success).toBe(false);
  });

  it('rejects a malformed deviceId', () => {
    expect(alertRuleSchema.safeParse({ ...baseRule, deviceId: 'not-an-id' }).success).toBe(false);
  });

  it('partial update validates a lone isActive toggle', () => {
    expect(updateAlertRuleSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe('alert constants', () => {
  it('offers exactly the evaluator-supported sensors', () => {
    expect(sensorOptionsFor('MET').map((s) => s.key)).toEqual([
      'wind_speed',
      'wind_dir',
      'temperature',
      'humidity',
      'pressure',
      'dew_point',
    ]);
  });

  it('maps app type to device family', () => {
    expect(APP_TYPE_TO_DEVICE_TYPE.MET).toBe('MET-LINK');
  });

  it('renders a human rule summary', () => {
    expect(ruleSummary(baseRule)).toBe('Wind speed > 60 km/h');
    expect(ruleSummary({ ...baseRule, condition: 'lte', sensor: 'temperature', threshold: 5, unit: '°C' })).toBe(
      'Temperature ≤ 5 °C',
    );
  });
});
