import { describe, it, expect } from 'vitest';
import { notificationLink, notificationMeta } from '@/features/notifications/notification-meta';

describe('notification deep-links (plan §6)', () => {
  it('session_complete → that session detail', () => {
    expect(notificationLink({ type: 'session_complete', data: { sessionId: 'abc', deviceId: 'd1' } })).toBe('/sessions/abc');
  });
  it('firmware → that device detail', () => {
    expect(notificationLink({ type: 'firmware', data: { deviceId: 'd9', current: '1.0', target: '1.1' } })).toBe('/devices/d9');
  });
  it('alert → the alerts page', () => {
    expect(notificationLink({ type: 'alert', data: { ruleId: 'r1', deviceId: 'd1' } })).toBe('/alerts');
  });
  it('falls back to the section landing when the id is missing', () => {
    expect(notificationLink({ type: 'session_complete', data: null })).toBe('/sessions');
    expect(notificationLink({ type: 'firmware', data: {} })).toBe('/devices');
  });
});

describe('notification meta', () => {
  it('assigns a reserved tone + label per type', () => {
    expect(notificationMeta('alert').tone).toBe('warn');
    expect(notificationMeta('session_complete').tone).toBe('ok');
    expect(notificationMeta('firmware').tone).toBe('info');
    expect(notificationMeta('alert').label).toBe('Alert');
  });
});
