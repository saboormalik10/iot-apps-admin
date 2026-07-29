import { Types } from 'mongoose';
import { Device } from '../models/Device';
import { fromCache, toCache } from './cache.util';

/**
 * Demo data is defined by the DEVICE, not by a per-row flag.
 *
 * A device whose `bleId` starts with `demo` is a demo device, and everything
 * recorded against it — sessions, samples, records, measures, files, rollups —
 * is demo data. Both mobile apps register the same `bleId: 'demo'` on first demo
 * sync; uniqueness is (organizationId, bleId, type), so MET-LINK and NEP-LINK
 * each get their own demo row separated by device family.
 *
 * Scoping is a MODE, not an "include":
 *   demoOnly = false → real devices only   (the default everywhere)
 *   demoOnly = true  → demo devices only
 *
 * Rows still carry `isDemoMode` (the apps send it and the lists badge from it),
 * but the device is the authority: it covers every related collection uniformly,
 * including ones that have no `isDemoMode` field of their own.
 */

/** Any bleId starting with this marks the device — and all its data — as demo. */
export const DEMO_BLE_ID_PREFIX = 'demo';

/** Matches `demo` and any `demo*` variant, anchored and case-insensitive. */
export const DEMO_BLE_ID_REGEX = new RegExp(`^${DEMO_BLE_ID_PREFIX}`, 'i');

/** Device lists change rarely; this is read on nearly every query. */
const DEMO_IDS_TTL_MS = 60_000;

/**
 * The org's demo device ids. Cached briefly because almost every scoped query
 * needs it — a newly registered demo device becomes visible within a minute.
 */
export async function demoDeviceIds(organizationId: string | Types.ObjectId): Promise<Types.ObjectId[]> {
  const orgId = organizationId.toString();
  const key = `demo:ids:${orgId}`;
  const cached = fromCache<string[]>(key);
  if (cached) return cached.map((id) => new Types.ObjectId(id));

  const devices = await Device.find({
    organizationId: new Types.ObjectId(orgId),
    bleId: DEMO_BLE_ID_REGEX,
    deletedAt: null,
  })
    .select('_id')
    .lean();

  const ids = devices.map((d) => (d._id as Types.ObjectId).toString());
  toCache(key, ids, DEMO_IDS_TTL_MS);
  return ids.map((id) => new Types.ObjectId(id));
}

/**
 * Mongo filter fragment for a `deviceId` field, honouring the demo mode.
 *
 * Spread into any query that is scoped to devices:
 *   { organizationId, ...(await demoDeviceFilter(orgId, demoOnly)) }
 *
 * With no demo device registered yet, `demoOnly: true` yields `$in: []` — an
 * empty result rather than the whole fleet, which is the honest answer.
 */
export async function demoDeviceFilter(
  organizationId: string | Types.ObjectId,
  demoOnly: boolean,
  field = 'deviceId',
): Promise<Record<string, unknown>> {
  const ids = await demoDeviceIds(organizationId);
  // Nothing to exclude when the org has no demo device — skip the clause entirely
  // so the existing indexes are used unchanged on the common path.
  if (!demoOnly && ids.length === 0) return {};
  return { [field]: demoOnly ? { $in: ids } : { $nin: ids } };
}

/**
 * Same decision for a device document itself (the Devices list and fleet views),
 * where the id field is `_id` rather than `deviceId`.
 */
export async function demoDeviceSelfFilter(
  organizationId: string | Types.ObjectId,
  demoOnly: boolean,
): Promise<Record<string, unknown>> {
  return demoDeviceFilter(organizationId, demoOnly, '_id');
}

/**
 * Narrows an explicitly requested deviceId to the current mode.
 * Returns `null` when the requested device is excluded by the mode, so callers
 * can short-circuit to an empty result instead of leaking the other mode's data.
 */
export async function isDeviceInScope(
  organizationId: string | Types.ObjectId,
  deviceId: string | Types.ObjectId,
  demoOnly: boolean,
): Promise<boolean> {
  const ids = await demoDeviceIds(organizationId);
  const isDemo = ids.some((id) => id.toString() === deviceId.toString());
  return demoOnly ? isDemo : !isDemo;
}

/** Parses the `demoOnly` query param. Anything but "true"/"1" means real data. */
export function parseDemoOnly(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}
