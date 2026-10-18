import { alertsEnabled } from '../src/alert-rules/alert-evaluation.service';

/** "Disable - Alerts & Notifications" (client, 10 Oct 2026): off unless switched on. */
describe('alerts switch', () => {
  it('is off by default', () => {
    expect(alertsEnabled({})).toBe(false);
    expect(alertsEnabled({ ALERTS_ENABLED: '' })).toBe(false);
    expect(alertsEnabled({ ALERTS_ENABLED: 'false' })).toBe(false);
  });

  it('is on only when the settings file says so', () => {
    expect(alertsEnabled({ ALERTS_ENABLED: 'true' })).toBe(true);
    expect(alertsEnabled({ ALERTS_ENABLED: ' TRUE ' })).toBe(true);
  });
});
