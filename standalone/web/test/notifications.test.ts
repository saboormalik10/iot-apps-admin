import { describe, it, expect } from 'vitest';
import { notificationLink, notificationMeta } from '@/features/notifications/notification-meta';

describe('notification deep-links (plan §6)', () => {
  it('alert → the device that fired', () => {
    expect(notificationLink({ type: 'alert', data: { ruleId: 'r1', deviceId: 'd1' } })).toBe('/devices/d1');
  });
  it('falls back to the stations list when the device id is missing', () => {
    expect(notificationLink({ type: 'alert', data: { ruleId: 'r1' } })).toBe('/devices');
    expect(notificationLink({ type: 'alert', data: null })).toBe('/devices');
  });
});

describe('notification meta', () => {
  it('assigns a reserved tone + label', () => {
    expect(notificationMeta('alert').tone).toBe('warn');
    expect(notificationMeta('alert').label).toBe('Alert');
  });
});
