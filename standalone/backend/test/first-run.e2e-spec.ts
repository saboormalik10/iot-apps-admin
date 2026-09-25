import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { FirstRunService } from '../src/setup/first-run.service';
import { SEEDED_ROLES } from '../src/common/permissions';
import { Role } from '../src/models/Role';
import { Organization } from '../src/models/Organization';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetRecord } from '../src/models/MetRecord';

/**
 * First-run setup, against a genuinely EMPTY database — the state a new
 * standalone PC is actually in.
 *
 * Its own throwaway database, dropped before and after, so it can neither
 * depend on nor disturb the development data.
 */
jest.setTimeout(60_000);

const DB = `observator_firstrun_${process.pid}`;
const ENV_KEYS = ['STANDALONE_ADMIN_EMAIL', 'STANDALONE_ADMIN_PASSWORD', 'STANDALONE_SITE_NAME', 'STANDALONE_TIMEZONE', 'STANDALONE_STATION_NAME'];
const saved: Record<string, string | undefined> = {};

describe('first-run setup (e2e)', () => {
  const setup = new FirstRunService();

  beforeAll(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    await mongoose.connect(process.env.MONGO_URI as string, { dbName: DB, serverSelectionTimeoutMS: 30_000 });
    await mongoose.connection.dropDatabase();
    await Promise.all([Role.syncIndexes(), Organization.syncIndexes(), Device.syncIndexes(), User.syncIndexes()]);
  });

  afterAll(async () => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    await Promise.all([Role.deleteMany({}), Organization.deleteMany({}), Device.deleteMany({}), User.deleteMany({})]);
  });

  it('creates the built-in roles on an empty database', async () => {
    // Without these every user has no permissions at all — the failure a fresh
    // copy of the cloud database showed on day one.
    await setup.onApplicationBootstrap();
    const roles = await Role.find({ organizationId: null, isSystem: true }).lean();
    expect(roles.map((r) => r.key).sort()).toEqual(['admin', 'operator', 'viewer']);
  });

  it('creates one organisation, in the PC’s own timezone', async () => {
    await setup.onApplicationBootstrap();
    const orgs = await Organization.find({}).lean();
    expect(orgs).toHaveLength(1);
    expect(orgs[0].timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('takes the site name and timezone from the installer when given', async () => {
    process.env.STANDALONE_SITE_NAME = 'Port Kembla';
    process.env.STANDALONE_TIMEZONE = 'Australia/Sydney';
    await setup.onApplicationBootstrap();
    const org = await Organization.findOne({}).lean();
    expect(org!.name).toBe('Port Kembla');
    expect(org!.timezone).toBe('Australia/Sydney');
  });

  it('creates the station the stream writes to', async () => {
    await setup.onApplicationBootstrap();
    const org = await Organization.findOne({}).lean();
    const stations = await Device.find({ organizationId: org!._id, type: 'MET-LINK' }).lean();
    expect(stations).toHaveLength(1);
    expect(stations[0].name).toBe('GMX551 Station');
  });

  it('creates the administrator from the installer, with a real password hash', async () => {
    process.env.STANDALONE_ADMIN_EMAIL = 'Site.Admin@Example.com';
    process.env.STANDALONE_ADMIN_PASSWORD = 'Correct-Horse-9';
    await setup.onApplicationBootstrap();

    const admin = await User.findOne({ email: 'site.admin@example.com' }).lean();
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe('admin');
    expect(admin!.passwordHash).not.toBe('Correct-Horse-9');
    expect(await bcrypt.compare('Correct-Horse-9', admin!.passwordHash)).toBe(true);

    // Linked to the built-in admin role, so its permissions come from the code.
    const adminRole = await Role.findOne({ organizationId: null, key: 'admin' }).lean();
    expect(String(admin!.roleId)).toBe(String(adminRole!._id));
  });

  it('never invents an administrator with a default password', async () => {
    /**
     * A built-in `admin / admin` would be identical on every site, on a PC the
     * whole network can reach. With no credentials the service still starts and
     * says what is missing — it just does not create an account.
     */
    await setup.onApplicationBootstrap();
    expect(await User.countDocuments({})).toBe(0);
  });

  it('refuses a password under 8 characters', async () => {
    process.env.STANDALONE_ADMIN_EMAIL = 'short@example.com';
    process.env.STANDALONE_ADMIN_PASSWORD = 'abc123';
    await setup.onApplicationBootstrap();
    expect(await User.countDocuments({})).toBe(0);
  });

  it('is idempotent — running it again creates nothing new', async () => {
    process.env.STANDALONE_ADMIN_EMAIL = 'site.admin@example.com';
    process.env.STANDALONE_ADMIN_PASSWORD = 'Correct-Horse-9';
    await setup.onApplicationBootstrap();
    await setup.onApplicationBootstrap();
    await setup.onApplicationBootstrap();

    expect(await Organization.countDocuments({})).toBe(1);
    expect(await Device.countDocuments({})).toBe(1);
    expect(await User.countDocuments({})).toBe(1);
    expect(await Role.countDocuments({ isSystem: true })).toBe(SEEDED_ROLES.length);
  });

  it('never changes an organisation the admin has since edited', async () => {
    // Once the install is running the name and timezone are the admin's to set;
    // a restart must not quietly put the installer's values back.
    process.env.STANDALONE_SITE_NAME = 'Installer Name';
    await setup.onApplicationBootstrap();
    await Organization.updateOne({}, { $set: { name: 'Renamed By Admin', timezone: 'Asia/Karachi' } });

    await setup.onApplicationBootstrap();
    const org = await Organization.findOne({}).lean();
    expect(org!.name).toBe('Renamed By Admin');
    expect(org!.timezone).toBe('Asia/Karachi');
  });

  it('re-syncs a built-in role to the code after an upgrade', async () => {
    /**
     * The one thing it deliberately overwrites. When a release changes what a
     * built-in role may do, existing installs must follow without a migration
     * for someone to forget — so drift in the database is corrected on start.
     */
    await setup.onApplicationBootstrap();
    await Role.updateOne({ organizationId: null, key: 'viewer' }, { $set: { permissions: ['data:read', 'role:delete'] } });

    await setup.onApplicationBootstrap();
    const viewer = await Role.findOne({ organizationId: null, key: 'viewer' }).lean();
    const expected = [...SEEDED_ROLES.find((r) => r.key === 'viewer')!.permissions].sort();
    expect([...viewer!.permissions].sort()).toEqual(expected);
    expect(viewer!.permissions).not.toContain('role:delete');
  });

  it('does not add a second administrator once one exists', async () => {
    process.env.STANDALONE_ADMIN_EMAIL = 'first@example.com';
    process.env.STANDALONE_ADMIN_PASSWORD = 'Correct-Horse-9';
    await setup.onApplicationBootstrap();

    // The installer value changes later — e.g. a reinstall over existing data.
    process.env.STANDALONE_ADMIN_EMAIL = 'second@example.com';
    await setup.onApplicationBootstrap();
    expect(await User.countDocuments({ role: 'admin' })).toBe(1);
    expect(await User.exists({ email: 'second@example.com' })).toBeNull();
  });

  // ── Indexes and retention (22 Sep: data is kept indefinitely) ──────────────

  it('builds the indexes a fresh database lacks — including the minute-row unique key', async () => {
    await MetMeasure.collection.drop().catch(() => undefined);
    await setup.onApplicationBootstrap();
    const names = (await MetMeasure.collection.indexes()).map((i) => i.name);
    // Without it, two writes for the same minute would both insert.
    expect(names).toContain('minute_record_unique');
  });

  it('drops a weather-data expiry index an earlier build created', async () => {
    // What a database created by the cloud-derived build carries.
    await MetMeasure.collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 63_072_000, partialFilterExpression: { source: 'sftp' }, name: 'sftp_ttl_createdAt' },
    );
    await MetRecord.collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 63_504_000, partialFilterExpression: { source: 'sftp' }, name: 'sftp_ttl_createdAt' },
    );

    await setup.onApplicationBootstrap();

    for (const model of [MetMeasure, MetRecord]) {
      const ttl = (await model.collection.indexes()).filter((i) => i.expireAfterSeconds !== undefined);
      expect(ttl).toEqual([]);
    }
  });

  it('declares no expiry on the weather data', () => {
    for (const model of [MetMeasure, MetRecord]) {
      const ttl = model.schema.indexes().filter(([, opts]) => opts?.expireAfterSeconds !== undefined);
      expect(ttl).toEqual([]);
    }
  });
});
