import { describe, it, expect } from 'vitest';
import { can, capabilitiesFor } from '@/lib/rbac/capabilities';

describe('RBAC capability matrix (plan §3.3)', () => {
  it('viewer can view + export but not manage', () => {
    expect(can('viewer', 'viewData')).toBe(true);
    expect(can('viewer', 'exportData')).toBe(true);
    expect(can('viewer', 'manageAlerts')).toBe(false);
    expect(can('viewer', 'manageOrg')).toBe(false);
  });

  it('operator can manage alerts + edit content but not org/devices', () => {
    expect(can('operator', 'manageAlerts')).toBe(true);
    expect(can('operator', 'editContent')).toBe(true);
    expect(can('operator', 'manageDevices')).toBe(false);
    expect(can('operator', 'manageOrg')).toBe(false);
  });

  it('admin can do everything including org + import', () => {
    expect(can('admin', 'manageOrg')).toBe(true);
    expect(can('admin', 'manageDevices')).toBe(true);
    expect(can('admin', 'importData')).toBe(true);
  });

  it('unknown/absent role has no capabilities', () => {
    expect(can(null, 'viewData')).toBe(false);
    expect(can(undefined, 'viewData')).toBe(false);
  });

  it('capabilitiesFor returns the role set', () => {
    expect(capabilitiesFor('viewer')).toContain('viewData');
    expect(capabilitiesFor('admin').length).toBeGreaterThan(capabilitiesFor('viewer').length);
  });
});
