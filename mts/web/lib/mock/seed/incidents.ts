import type { LocationId } from '@/lib/api/types';
import { STORM_DAY, sydneyAt } from '../clock';
import { THRESHOLDS } from './thresholds';

/**
 * The equipment faults of the storm day, as one timeline.
 *
 * Campsie's radar failure is told on six screens — the reading card goes blank,
 * the alert log raises a fault, the health findings list it, the availability
 * strip shows the gap, maintenance mode switches on when the technician arrives,
 * and the work order tracks it against the §11.2 response obligations. Each read
 * its own times once, and they drifted: the health finding said "since 13:29"
 * while the radar had been silent since 10:58. Now there is one record.
 */

const at = (d: number, h: number, m: number) => sydneyAt(STORM_DAY, d, h, m);

export const CAMPSIE_RADAR = {
  /** The radar stops answering. */
  failedAt: at(0, 10, 58),
  /** Comms timeout → fault alert, fallback to the float switch (§7.4). */
  alertAt: at(0, 11, 4),
  acknowledgedAt: at(0, 11, 13),
  /** T. Reilly on site; Campsie into maintenance mode. */
  onSiteAt: at(0, 11, 41),
  /** Cause found: RS-485 cable cut at the cabinet gland. */
  diagnosedAt: at(0, 12, 26),
  /** Cable replaced in the morning possession; radar reading again. */
  repairedAt: at(1, 7, 40),
  /** Verified against the staff gauge; maintenance mode off. */
  closedAt: at(1, 7, 52),
};

/**
 * Lady Game Drive's down-tunnel panel: soiled, so the charge controller has been
 * flagging PV under-yield, and the battery bottomed out before first light on
 * the storm day. Cleaned in the overnight possession (WO-0409).
 */
export const LGD_PANEL = { soiledYield: 0.41, underYieldFrom: at(-3, 10, 0), cleanedAt: at(1, 1, 50) };

/** Windsor Road's logger silent through a cellular handover (§9 "unresponsive"). */
export const WINDSOR_HANDOVER = { from: at(0, 13, 51), minutes: 15, raisedAt: at(0, 14, 6) };

export function campsieRadarOut(t: number): boolean {
  return t >= CAMPSIE_RADAR.failedAt && t < CAMPSIE_RADAR.repairedAt;
}

/** §11.2, the contractual clocks a work order runs against, from when it is raised. */
export const RESPONSE_OBLIGATIONS = {
  /** Corrective maintenance to rectify a terminal system fault. */
  responseH: 6,
  /** On-site investigation and proposed remediation of a system failure. */
  investigationH: 12,
  /** On-site repair, including fault remediation. */
  repairH: 24,
  /** System inoperable: maximum time to repair, from the start of remediation. */
  maxRepairH: 24,
};

/**
 * Blue2Care work orders, one per equipment fault the alert log records, with
 * the same people and times. A leading indicator (a low battery) gets a work
 * order too but no §11.2 clock — nothing has failed yet.
 */
export const WORK_ORDERS: WorkOrderSeed[] = [
  {
    id: 'WO-0412',
    locationId: 'campsie',
    loggerId: 'CAM-01',
    title: 'Radar level sensor not reporting',
    kind: 'fault',
    raisedAt: CAMPSIE_RADAR.alertAt,
    assignee: 'T. Reilly',
    eventId: 'evt-campsie-fault',
    steps: [
      { key: 'response', doneAt: CAMPSIE_RADAR.onSiteAt, note: 'On site. Campsie in maintenance mode; float switch live, flood alerting continues from it.' },
      { key: 'investigation', doneAt: CAMPSIE_RADAR.diagnosedAt, note: 'RS-485 cable cut at the cabinet gland — vandalism. Repair deferred: unsafe in the storm, no possession until 06:00.' },
      { key: 'repair', doneAt: CAMPSIE_RADAR.repairedAt, note: 'Cable replaced and re-glanded in the 06:00 possession; radar verified against the staff gauge.' },
    ],
    closedAt: CAMPSIE_RADAR.closedAt,
  },
  {
    id: 'WO-0409',
    locationId: 'lady-game-drive',
    loggerId: 'LGD-DN-01',
    title: `Down-tunnel battery below ${THRESHOLDS.power.lowBatteryPct}% overnight`,
    kind: 'leading-indicator',
    raisedAt: at(0, 6, 12),
    assignee: 'S. O’Brien',
    eventId: 'evt-lgd-battery',
    steps: [
      { key: 'response', doneAt: at(0, 6, 40), note: `Remote check: controller flagging PV under-yield — ${Math.round(LGD_PANEL.soiledYield * 100)}% of expected for three days. Battery and controller otherwise healthy.` },
      { key: 'investigation', doneAt: at(1, 1, 25), note: 'Site visit in the overnight possession: panel heavily soiled.' },
      { key: 'repair', doneAt: LGD_PANEL.cleanedAt, note: 'Panel cleaned; under-yield flag cleared at first light.' },
    ],
    closedAt: at(1, 8, 0),
  },
  {
    id: 'WO-0398',
    locationId: 'lady-game-drive',
    loggerId: 'LGD-UP-01',
    title: 'Up-tunnel logger unresponsive',
    kind: 'fault',
    raisedAt: at(-5, 2, 29),
    assignee: 'S. O’Brien',
    eventId: 'evt-h6',
    steps: [
      { key: 'response', doneAt: at(-5, 2, 33), note: 'Acknowledged; carrier status page showed an outage on the tunnel cell.' },
      { key: 'investigation', doneAt: at(-5, 8, 45), note: 'Carrier confirmed the outage, 02:10–03:00. No fault on site; the logger buffered and backfilled the gap.' },
      { key: 'repair', doneAt: at(-5, 8, 45), note: 'No repair needed — restored without intervention.' },
    ],
    closedAt: at(-5, 8, 50),
  },
  {
    id: 'WO-0391',
    locationId: 'marrickville-dulwich-hill',
    loggerId: 'MDH-01',
    title: 'Float switch failed its self-test',
    kind: 'fault',
    raisedAt: at(-11, 14, 40),
    assignee: 'T. Reilly',
    eventId: 'evt-h10',
    steps: [
      { key: 'response', doneAt: at(-11, 15, 20), note: 'Self-test retried remotely — failed again. Radar remains the primary level source.' },
      { key: 'investigation', doneAt: at(-11, 19, 5), note: 'On site: float arm seized by debris; housing cracked.' },
      { key: 'repair', doneAt: at(-10, 9, 30), note: 'Replaced under warranty; self-test passed, float exercised by hand.' },
    ],
    closedAt: at(-10, 9, 40),
  },
];

export interface WorkOrderSeed {
  id: string;
  locationId: LocationId;
  loggerId: string;
  title: string;
  kind: 'fault' | 'leading-indicator';
  raisedAt: number;
  assignee: string;
  eventId?: string;
  steps: { key: 'response' | 'investigation' | 'repair'; doneAt: number; note: string }[];
  closedAt: number;
}
