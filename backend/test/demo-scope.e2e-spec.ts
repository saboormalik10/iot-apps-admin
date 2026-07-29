import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { Device } from '../src/models/Device';
import { NepSession } from '../src/models/NepSession';
import { MetRecord } from '../src/models/MetRecord';
import { SessionsService } from '../src/sessions/sessions.service';
import { RecordsService } from '../src/records/records.service';
import { DevicesService } from '../src/devices/devices.service';
import { demoDeviceIds, isDeviceInScope, parseDemoOnly } from '../src/utils/demo-scope.util';

/**
 * Demo scoping — "Show demo devices" is a MODE, not an include.
 *
 * off → real-device data only;  on → demo-device data only. The two are never
 * mixed. Demo-ness comes from the device (`bleId` starting `demo`), so one rule
 * covers sessions, records and the device list alike.
 */
describe('Demo scoping (e2e)', () => {
  const orgId = new Types.ObjectId();
  const realDevice = new Types.ObjectId();
  const demoDevice = new Types.ObjectId();

  const sessions = new SessionsService({ emit: () => true } as never);
  const records = new RecordsService({ emit: () => true } as never);
  const devices = new DevicesService();

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });

    await Device.insertMany([
      { _id: realDevice, organizationId: orgId, bleId: 'NEP-REAL-001', name: 'River Probe', type: 'NEP-LINK' },
      { _id: demoDevice, organizationId: orgId, bleId: 'demo', name: 'DEMO', type: 'NEP-LINK' },
    ]);
    await NepSession.insertMany([
      { id: `real-${Date.now()}`, organizationId: orgId, deviceId: realDevice, deviceName: 'River Probe', startTimestamp: Date.now(), timezoneName: 'UTC', timezoneOffset: 0, isDemoMode: false },
      { id: `demo-${Date.now()}`, organizationId: orgId, deviceId: demoDevice, deviceName: 'DEMO', startTimestamp: Date.now(), timezoneName: 'UTC', timezoneOffset: 0, isDemoMode: true },
    ]);
    await MetRecord.insertMany([
      { organizationId: orgId, deviceId: realDevice, deviceName: 'Roof', dateStart: new Date().toISOString(), dateStartMs: Date.now(), isDemoMode: false },
      { organizationId: orgId, deviceId: demoDevice, deviceName: 'DEMO', dateStart: new Date().toISOString(), dateStartMs: Date.now(), isDemoMode: true },
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      Device.deleteMany({ organizationId: orgId }),
      NepSession.deleteMany({ organizationId: orgId }),
      MetRecord.deleteMany({ organizationId: orgId }),
    ]);
    await mongoose.disconnect();
  });

  it('identifies demo devices by the bleId prefix', async () => {
    const ids = (await demoDeviceIds(orgId)).map((i) => i.toString());
    expect(ids).toEqual([demoDevice.toString()]);
    expect(ids).not.toContain(realDevice.toString());
  });

  it('sessions: off → real only, on → demo only (never both)', async () => {
    const off = await sessions.listSessions({ organizationId: orgId.toString() });
    expect(off.data).toHaveLength(1);
    expect(off.data[0].deviceId.toString()).toBe(realDevice.toString());

    const on = await sessions.listSessions({ organizationId: orgId.toString(), demoOnly: true });
    expect(on.data).toHaveLength(1);
    expect(on.data[0].deviceId.toString()).toBe(demoDevice.toString());
  });

  it('records: off → real only, on → demo only', async () => {
    const off = await records.listRecords({ organizationId: orgId.toString() });
    expect(off.data.map((r) => r.deviceId.toString())).toEqual([realDevice.toString()]);

    const on = await records.listRecords({ organizationId: orgId.toString(), demoOnly: true });
    expect(on.data.map((r) => r.deviceId.toString())).toEqual([demoDevice.toString()]);
  });

  it('devices: the demo device is itself scoped out of the real list', async () => {
    const off = await devices.listDevices({ organizationId: orgId.toString() });
    expect(off.data.map((d) => d.bleId)).toEqual(['NEP-REAL-001']);

    const on = await devices.listDevices({ organizationId: orgId.toString(), demoOnly: true });
    expect(on.data.map((d) => d.bleId)).toEqual(['demo']);
  });

  it('lets BOTH apps register the same bleId "demo", separated by type', async () => {
    // The whole point of the (organizationId, bleId, type) unique key: MET-LINK
    // must get its own demo row rather than being handed the NEP-LINK one.
    const actor = { userId: new Types.ObjectId().toString(), email: 'ci@observator.com' };
    const met = await devices.createDevice(orgId.toString(), { bleId: 'demo', name: 'DEMO', type: 'MET-LINK' }, actor);
    expect(met.created).toBe(true);
    expect(met.device._id!.toString()).not.toBe(demoDevice.toString());
    expect(met.device.type).toBe('MET-LINK');

    // …and it stays idempotent per family.
    const again = await devices.createDevice(orgId.toString(), { bleId: 'demo', name: 'DEMO', type: 'MET-LINK' }, actor);
    expect(again.created).toBe(false);
    expect(again.device._id!.toString()).toBe(met.device._id!.toString());

    const nep = await devices.createDevice(orgId.toString(), { bleId: 'demo', name: 'DEMO', type: 'NEP-LINK' }, actor);
    expect(nep.created).toBe(false);
    expect(nep.device._id!.toString()).toBe(demoDevice.toString());
  });

  it('refuses a device the current mode excludes', async () => {
    expect(await isDeviceInScope(orgId, realDevice, false)).toBe(true);
    expect(await isDeviceInScope(orgId, realDevice, true)).toBe(false);
    expect(await isDeviceInScope(orgId, demoDevice, true)).toBe(true);
    // The guard analytics relies on: real mode must not read demo-device data.
    expect(await isDeviceInScope(orgId, demoDevice, false)).toBe(false);
  });

  it('defaults to real data for every param value but true/1', () => {
    expect(parseDemoOnly('true')).toBe(true);
    expect(parseDemoOnly('1')).toBe(true);
    expect(parseDemoOnly('false')).toBe(false);
    expect(parseDemoOnly(undefined)).toBe(false);
    expect(parseDemoOnly('yes')).toBe(false);
  });
});
