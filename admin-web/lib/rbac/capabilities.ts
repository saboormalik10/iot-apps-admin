import type { Role } from '../api/types';

/**
 * Single capability matrix (plan §3.3) — drives route guards, nav visibility, and
 * disabled controls. Client guards are UX only; the backend re-checks every role
 * (RolesGuard), so the UI never assumes it's the only line of defence.
 */
export type Capability =
  | 'viewData' // dashboards / analytics / maps
  | 'exportData' // CSV / ZIP, create share links
  | 'editContent' // record/session comments, upload/delete files
  | 'manageAlerts' // create/edit/toggle alert rules
  | 'manageDevices' // device CRUD, settings, firmware targets
  | 'manageOrg' // org settings, users/invites/roles, audit log
  | 'importData'; // import CSV, revoke others' share links

const MATRIX: Record<Role, Capability[]> = {
  viewer: ['viewData', 'exportData'],
  operator: ['viewData', 'exportData', 'editContent', 'manageAlerts'],
  admin: [
    'viewData',
    'exportData',
    'editContent',
    'manageAlerts',
    'manageDevices',
    'manageOrg',
    'importData',
  ],
};

export function can(role: Role | undefined | null, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(capability) ?? false;
}

export function capabilitiesFor(role: Role): readonly Capability[] {
  return MATRIX[role] ?? [];
}
