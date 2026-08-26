import 'dotenv/config';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import mongoose, { Types } from 'mongoose';

import { SuperAdminGuard } from '../src/common/guards/super-admin.guard';
import { PlatformService } from '../src/platform/platform.service';
import { Organization } from '../src/models/Organization';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';
import { MetRecord } from '../src/models/MetRecord';

/**
 * Cross-customer reporting (M19 W3).
 *
 * These are the ONLY queries in the codebase that read across tenants, so the
 * guard in front of them matters more than the figures behind it.
 */

jest.setTimeout(60_000);

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('SuperAdminGuard', () => {
  const guard = new SuperAdminGuard();
  const made: Types.ObjectId[] = [];
  let orgId: Types.ObjectId;
  let superId: string;
  let plainId: string;
  let inactiveId: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const org = await Organization.create({
      name: `Guard Org ${Date.now()}`, slug: `guard-${Date.now()}`,
      contactEmail: 'g@test.invalid', country: 'AU', timezone: 'UTC',
    });
    orgId = org._id as Types.ObjectId;

    const mk = async (over: Record<string, unknown>) => {
      const u = await User.create({
        organizationId: orgId, email: `guard-${Math.random().toString(36).slice(2)}@test.invalid`,
        passwordHash: 'x'.repeat(60), firstName: 'G', lastName: 'U', role: 'admin', ...over,
      });
      made.push(u._id as Types.ObjectId);
      return String(u._id);
    };
    superId = await mk({ isSuperAdmin: true, isActive: true });
    plainId = await mk({ isSuperAdmin: false, isActive: true });
    inactiveId = await mk({ isSuperAdmin: true, isActive: false });
  });

  afterAll(async () => {
    await User.deleteMany({ _id: { $in: made } });
    await Organization.deleteOne({ _id: orgId });
    await mongoose.disconnect();
  });

  it('admits a platform administrator', async () => {
    await expect(guard.canActivate(contextFor({ user: { userId: superId } }))).resolves.toBe(true);
  });

  it('REFUSES an ordinary admin, whatever their token says', async () => {
    // `sup: true` on the token must not be enough — the claim is a 15-minute
    // cache and a demotion has to bite immediately.
    await expect(
      guard.canActivate(contextFor({ user: { userId: plainId, sup: true } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a deactivated administrator', async () => {
    await expect(
      guard.canActivate(contextFor({ user: { userId: inactiveId } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a user who no longer exists', async () => {
    await expect(
      guard.canActivate(contextFor({ user: { userId: '000000000000000000000000' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('REJECTS a machine credential outright', async () => {
    // The ingest agent holds no role; a cross-tenant route is the last place it
    // should be able to reach.
    await expect(
      guard.canActivate(contextFor({ serviceCredential: { credentialId: 'c1', kind: 'ingest' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unauthenticated request', async () => {
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('PlatformService.overview', () => {
  const service = new PlatformService();
  const orgs: Types.ObjectId[] = [];
  const devices: Types.ObjectId[] = [];
  const records: Types.ObjectId[] = [];
  let orgA: Types.ObjectId;
  let orgB: Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });

    const mkOrg = async (name: string) => {
      const o = await Organization.create({
        name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`,
        contactEmail: 'p@test.invalid', country: 'AU', timezone: 'Australia/Sydney',
      });
      orgs.push(o._id as Types.ObjectId);
      return o._id as Types.ObjectId;
    };
    orgA = await mkOrg('Plat Alpha');
    orgB = await mkOrg('Plat Beta');

    // Alpha: one station seen a minute ago, 100 readings today.
    const d = await Device.create({
      organizationId: orgA, name: 'Plat Station', type: 'MET-LINK',
      bleId: `plat-${Date.now()}`, lastSeenAt: new Date(Date.now() - 60_000),
    });
    devices.push(d._id as Types.ObjectId);
    const r = await MetRecord.create({
      organizationId: orgA, deviceId: d._id, deviceName: 'Plat Station',
      dateStart: new Date(Date.now() - 3_600_000).toISOString(),
      dateStartMs: Date.now() - 3_600_000, dateEndMs: Date.now() - 60_000,
      measureCount: 100, source: 'sftp',
    });
    records.push(r._id as Types.ObjectId);
  });

  afterAll(async () => {
    await MetRecord.deleteMany({ _id: { $in: records } });
    await Device.deleteMany({ _id: { $in: devices } });
    await Organization.deleteMany({ _id: { $in: orgs } });
    await mongoose.disconnect();
  });

  const rowFor = async (id: Types.ObjectId) =>
    (await service.overview()).rows.find((r) => r.organizationId === String(id))!;

  it('includes EVERY customer, which is the whole point', async () => {
    const o = await service.overview();
    const ids = o.rows.map((r) => r.organizationId);
    expect(ids).toContain(String(orgA));
    expect(ids).toContain(String(orgB));
  });

  it('counts stations and how many are online', async () => {
    const row = await rowFor(orgA);
    expect(row.stations).toBe(1);
    expect(row.online).toBe(1);
  });

  it('recomputes online from lastSeenAt, not the stored flag', async () => {
    // Nothing clears `isOnline` when a station simply goes quiet, so trusting it
    // would report a dead fleet as healthy.
    await Device.updateOne({ _id: devices[0] }, { $set: { isOnline: true, lastSeenAt: new Date(Date.now() - 3_600_000) } });
    try {
      const row = await rowFor(orgA);
      expect(row.stations).toBe(1);
      expect(row.online).toBe(0);
    } finally {
      await Device.updateOne({ _id: devices[0] }, { $set: { lastSeenAt: new Date(Date.now() - 60_000) } });
    }
  });

  it('sums readings from the day records, not by scanning measures', async () => {
    const row = await rowFor(orgA);
    expect(row.readings24h).toBe(100);
  });

  it('reports zero for a customer with nothing, rather than omitting it', async () => {
    const row = await rowFor(orgB);
    expect(row).toMatchObject({ stations: 0, online: 0, readings24h: 0, users: 0 });
  });

  it('flags a customer that has stations but has gone silent', async () => {
    await MetRecord.updateOne({ _id: records[0] }, { $set: { dateEndMs: Date.now() - 48 * 3_600_000 } });
    try {
      const o = await service.overview();
      expect((await rowFor(orgA)).readings24h).toBe(0);
      expect(o.silent).toBeGreaterThanOrEqual(1);
    } finally {
      await MetRecord.updateOne({ _id: records[0] }, { $set: { dateEndMs: Date.now() - 60_000 } });
    }
  });

  it('does not count a customer with no stations as silent', async () => {
    // Otherwise every newly created customer would look like an outage.
    const o = await service.overview();
    const beta = o.rows.find((r) => r.organizationId === String(orgB))!;
    expect(beta.stations).toBe(0);
    expect(beta.readings24h).toBe(0);
  });

  it('totals match the sum of the rows', async () => {
    const o = await service.overview();
    expect(o.customers).toBe(o.rows.length);
    expect(o.stations).toBe(o.rows.reduce((n, r) => n + r.stations, 0));
    expect(o.readings24h).toBe(o.rows.reduce((n, r) => n + r.readings24h, 0));
  });

  it('excludes a soft-deleted organisation', async () => {
    await Organization.updateOne({ _id: orgB }, { $set: { deletedAt: new Date() } });
    try {
      const o = await service.overview();
      expect(o.rows.map((r) => r.organizationId)).not.toContain(String(orgB));
    } finally {
      await Organization.updateOne({ _id: orgB }, { $set: { deletedAt: null } });
    }
  });
});
