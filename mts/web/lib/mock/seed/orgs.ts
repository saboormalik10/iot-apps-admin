import type { Organization, OrgRight } from '@/lib/api/types';
import { STORM_DAY, sydneyAt } from '../clock';

/**
 * The organisations in the system (client requirement, 3 Oct 2026).
 *
 * Every organisation starts with all three rights OFF — its Administrator can
 * add no users, stations or sensors until the Super User grants each one on
 * Admin → Organisations.
 */
const off = { on: false } as const;
const grantedBy = 'Platform Super User';

export const RIGHT_LABELS: Record<OrgRight, { label: string; detail: string }> = {
  addUsers: { label: 'Add users', detail: 'Invite, edit, suspend and remove the people in their organisation' },
  addStations: { label: 'Add stations', detail: 'Register new monitoring stations' },
  addSensors: { label: 'Add sensors', detail: 'Add, replace and decommission instruments' },
};

export const ORGANISATIONS: Organization[] = [
  {
    id: 'mts',
    name: 'Metro Trains Sydney',
    code: 'MTS',
    region: 'Sydney',
    createdAt: sydneyAt(STORM_DAY, -45, 10, 0),
    createdBy: grantedBy,
    // Client, 3 Oct: the organisation's Admin cannot add anything until the Super User grants it.
    rights: { addUsers: off, addStations: off, addSensors: off },
  },
  {
    id: 'trial',
    name: 'Trial Organisation',
    code: 'TRIAL',
    region: 'Melbourne',
    createdAt: sydneyAt(STORM_DAY, -3, 14, 5),
    createdBy: grantedBy,
    rights: { addUsers: off, addStations: off, addSensors: off },
  },
];
