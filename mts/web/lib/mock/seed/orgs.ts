import type { Organization, OrgRight } from '@/lib/api/types';
import { STORM_DAY, sydneyAt } from '../clock';

/**
 * The organisations in the system (client requirement, 3 Oct 2026).
 *
 * A new organisation starts with all three rights OFF — its Administrator can
 * add no users, stations or sensors until the Super User grants each one. MTS is
 * shown part-way: the Super User has granted users and sensors, but stations
 * are still added only by the Super User. The trial organisation shows the
 * starting state, everything off.
 */
const off = { on: false } as const;
const grantedBy = 'Platform Super User';

export const RIGHT_LABELS: Record<OrgRight, { label: string; detail: string }> = {
  addUsers: { label: 'Add users', detail: 'Invite and manage the people in their organisation' },
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
    rights: {
      addUsers: { on: true, by: grantedBy, at: sydneyAt(STORM_DAY, -24, 9, 30) },
      addStations: off,
      addSensors: { on: true, by: grantedBy, at: sydneyAt(STORM_DAY, -24, 9, 31) },
    },
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
