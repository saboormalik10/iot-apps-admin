/**
 * DEVELOPMENT AND TEST SEED ONLY.
 *
 * Creates an organization, an admin and two other users with KNOWN passwords, one
 * station and three hours of demo readings — the fixture the e2e suites log in with.
 *
 * Never run this on a site PC. A real install gets its organization, station and
 * first admin from `setup/first-run.service.ts`, which takes the admin password
 * from the installer and never invents one.
 *
 * Run: npx ts-node src/scripts/seed.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { AuditLog } from '../models/AuditLog';
import { AlertRule } from '../models/AlertRule';
import { FirstRunService } from '../setup/first-run.service';
import { resolveRoleId } from '../common/resolve-role';

const ADMIN_EMAIL = 'admin@observator.com';
const ADMIN_PASSWORD = 'Admin@1234';
import { BCRYPT_COST } from '../common/bcrypt';

// Extra org members so the admin Users page + audit log have realistic data on staging.
const EXTRA_USERS: Array<{ email: string; password: string; firstName: string; lastName: string; role: 'operator' | 'viewer' }> = [
  { email: 'operator@observator.com', password: 'Operator@1234', firstName: 'Olivia', lastName: 'Park', role: 'operator' },
  { email: 'viewer@observator.com', password: 'Viewer@1234', firstName: 'Victor', lastName: 'Reed', role: 'viewer' },
];

// Brisbane-ish base coordinates for the demo GPS tracks
const BASE_LAT = -27.4698;
const BASE_LNG = 153.0251;

async function seed(): Promise<void> {
  const uri = process.env.MONGO_URI ?? '';
  if (!uri) throw new Error('MONGO_URI not set in .env');

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  // The same indexes and built-in roles a real install gets on its first start,
  // so the seeded users can be given a real role rather than a bare role name.
  const setup = new FirstRunService();
  await setup.ensureIndexes();
  await setup.ensureSystemRoles();

  // ── Admin User + Organization ─────────────────────────────────────────────
  // Anchor everything to the admin user's organisation so the seeded demo data
  // is always visible to the account you log in with. If the admin exists, reuse
  // its org; otherwise create the org + admin together.
  let adminUser = await User.findOne({ email: ADMIN_EMAIL });
  let org = adminUser ? await Organization.findById(adminUser.organizationId) : null;

  if (!org) {
    org =
      (await Organization.findOne({ slug: 'observator-au' })) ??
      (await Organization.create({
        name: 'Observator Instruments AU',
        slug: 'observator-au',
        contactEmail: 'dana@observator.com',
        country: 'AU',
        timezone: 'Australia/Melbourne',
      }));
    console.log(`✅ Organization ready: ${org.name} (${org._id})`);
  } else {
    console.log(`⏭️  Using admin's organization: ${org.name} (${org._id})`);
  }

  if (!adminUser) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_COST);
    adminUser = await User.create({
      organizationId: org._id,
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: 'Dana',
      lastName: 'Galbraith',
      role: 'admin',
      roleId: await resolveRoleId('admin', org._id as mongoose.Types.ObjectId),
      isActive: true,
    });
    console.log(`✅ Admin user created: ${adminUser.email} (${adminUser._id})`);
    console.log(`   → Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } else {
    console.log(`⏭️  Admin user already exists: ${adminUser.email}`);
  }

  // ── Extra org members (operator + viewer) ─────────────────────────────────
  for (const u of EXTRA_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (!existing) {
      const passwordHash = await bcrypt.hash(u.password, BCRYPT_COST);
      const created = await User.create({
        organizationId: org._id,
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        roleId: await resolveRoleId(u.role, org._id as mongoose.Types.ObjectId),
        isActive: true,
        invitedAt: new Date(),
        invitedBy: adminUser._id,
      });
      console.log(`✅ ${u.role} user created: ${created.email} / ${u.password}`);
    } else {
      console.log(`⏭️  ${u.role} user already exists: ${u.email}`);
    }
  }

  // ── MET-LINK Device ───────────────────────────────────────────────────────
  let metDevice = await Device.findOne({ organizationId: org._id, bleId: 'MET-00:11:22:33:44:55' });
  if (!metDevice) {
    metDevice = await Device.create({
      organizationId: org._id,
      bleId: 'MET-00:11:22:33:44:55',
      name: 'MET-LINK-001',
      type: 'MET-LINK',
      serialNo: 'SN-MET-001',
      firmwareVersion: '2.1.4',
      isOnline: false,
    });
    console.log(`✅ MET-LINK device created: ${metDevice.name} (${metDevice._id})`);
  } else {
    console.log(`⏭️  MET-LINK device already exists: ${metDevice.name}`);
  }

  // ── Demo time-series (Month 3 analytics) ──────────────────────────────────
  // Idempotent: only generate if this MET device has no records yet.
  const existingMet = await MetRecord.countDocuments({ deviceId: metDevice._id });
  if (existingMet === 0) {
    await seedMetSeries(org._id as mongoose.Types.ObjectId, metDevice._id as mongoose.Types.ObjectId, metDevice.name);
    console.log('✅ Demo MET-LINK record + measures generated');
  } else {
    console.log('⏭️  MET-LINK demo measures already exist — skipping');
  }

  // ── Demo audit-log entries ────────────────────────────────────────────────
  // Idempotent: only seed if this org has no audit history yet.
  const existingAudit = await AuditLog.countDocuments({ organizationId: org._id });
  if (existingAudit === 0) {
    await AuditLog.insertMany([
      {
        organizationId: org._id, userId: adminUser._id, userEmail: adminUser.email,
        action: 'login', resourceType: 'user',
        resourceId: (adminUser._id as mongoose.Types.ObjectId).toString(), resourceName: adminUser.email,
        ipAddress: '203.0.113.10', userAgent: 'seed-script',
      },
      {
        organizationId: org._id, userId: adminUser._id, userEmail: adminUser.email,
        action: 'create', resourceType: 'device',
        resourceId: (metDevice._id as mongoose.Types.ObjectId).toString(), resourceName: metDevice.name,
        changes: { type: 'MET-LINK' },
      },
      {
        organizationId: org._id, userId: adminUser._id, userEmail: adminUser.email,
        action: 'invite', resourceType: 'user',
        resourceId: null, resourceName: 'operator@observator.com', changes: { role: 'operator' },
      },
    ]);
    console.log('✅ Demo audit-log entries created');
  } else {
    console.log('⏭️  Audit-log entries already exist — skipping');
  }

  // ── Demo alert rule ─────────────────────────────────────────────────────────
  if ((await AlertRule.countDocuments({ organizationId: org._id })) === 0) {
    await AlertRule.create({
      organizationId: org._id,
      deviceId: metDevice._id,
      createdBy: adminUser._id,
      name: 'Strong wind',
      appType: 'MET',
      sensor: 'wind_speed',
      condition: 'gt',
      threshold: 60,
      unit: 'km/h',
      isActive: true,
      notifyUserIds: [adminUser._id],
      cooldownMinutes: 60,
    });
    console.log('✅ Demo alert rule created');
  } else {
    console.log('⏭️  Alert rules already exist — skipping');
  }

  console.log('\n📋 Seed Summary');
  console.log('─────────────────────────────────────────────');
  console.log(`Organization: ${org.name}`);
  console.log(`Organization ID: ${org._id}`);
  console.log(`Admin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  EXTRA_USERS.forEach((u) => console.log(`${u.role.padEnd(9)} ${u.email} / ${u.password}`));
  console.log(`MET-LINK Device ID: ${metDevice._id}`);
  console.log('─────────────────────────────────────────────');
  console.log('✅ Seed completed successfully');

  await mongoose.disconnect();
}

/**
 * Generate one MET-LINK record with ~3 hours of 10-second measures.
 * Sensor fields are written directly (the parser is exercised by the API path).
 */
async function seedMetSeries(
  orgId: mongoose.Types.ObjectId,
  deviceId: mongoose.Types.ObjectId,
  deviceName: string,
): Promise<void> {
  const stepMs = 10_000;
  const count = (3 * 3600 * 1000) / stepMs; // 3 hours @ 10s = 1080 rows
  const start = Date.now() - 3 * 3600 * 1000;
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

  const record = await MetRecord.create({
    organizationId: orgId,
    deviceId,
    deviceName,
    dateStart: fmt(start),
    dateEnd: fmt(start + count * stepMs),
    dateStartMs: start,
    dateEndMs: start + count * stepMs,
    comment: 'Seed demo record',
    measureCount: count,
    hasHeaderRow: true,
    syncedAt: new Date(),
  });

  const docs: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const ts = start + i * stepMs;
    const tod = (ts % 86_400_000) / 86_400_000; // 0..1 across the day
    const temp = 18 + 6 * Math.sin(tod * 2 * Math.PI) + (Math.random() - 0.5);
    const windMs = Math.max(0, 4 + 3 * Math.sin(i / 40) + (Math.random() - 0.5) * 2);
    const windDir = (180 + 60 * Math.sin(i / 60) + Math.random() * 20) % 360;
    const pressure = 1013 + 4 * Math.sin(i / 200) + (Math.random() - 0.5);
    const humidity = 55 + 15 * Math.sin(tod * 2 * Math.PI + 1) + (Math.random() - 0.5) * 4;
    const dewPoint = temp - (100 - humidity) / 5;
    docs.push({
      recordId: record._id,
      organizationId: orgId,
      rowType: 'data',
      dataSentence: `${windMs.toFixed(2)},m/s,Wind speed,true,${temp.toFixed(1)},°C,Temperature`,
      timeStamp: fmt(ts),
      timestampMs: ts,
      windSpeedMs: round2(windMs),
      windSpeedKmh: round2(windMs * 3.6),
      windSpeedKnots: round2(windMs / 0.514444),
      windSpeedTrueMs: round2(windMs),
      windDirTrueDeg: round2(windDir),
      windDirRelDeg: round2(windDir),
      tempC: round2(temp),
      humidityPct: round2(Math.max(0, Math.min(100, humidity))),
      pressureHpa: round2(pressure),
      dewPointC: round2(dewPoint),
      solarWm2: round2(Math.max(0, 600 * Math.sin(tod * Math.PI))),
      precipMm: 0,
      precipRateMmHr: 0,
      voltageV: round2(12 + Math.random()),
      gpsLat: round6(BASE_LAT + (Math.random() - 0.5) * 0.0005),
      gpsLng: round6(BASE_LNG + (Math.random() - 0.5) * 0.0005),
      gpsAltM: round2(40 + Math.random() * 2),
    });
  }
  await MetMeasure.insertMany(docs, { ordered: false });
}

function round2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
