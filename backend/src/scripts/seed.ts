/**
 * Seed Script — Week 1
 * Creates: 1 organization + 1 admin user + 1 MET-LINK device + 1 NEP-LINK device
 *
 * Run: npx ts-node src/scripts/seed.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { DeviceSettings } from '../models/DeviceSettings';

const ADMIN_EMAIL = 'admin@observator.com';
const ADMIN_PASSWORD = 'Admin@1234';
const BCRYPT_COST = 12;

async function seed(): Promise<void> {
  const uri = process.env.MONGO_URI ?? '';
  if (!uri) throw new Error('MONGO_URI not set in .env');

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  // ── Organization ─────────────────────────────────────────────────────────
  let org = await Organization.findOne({ slug: 'observator-au' });
  if (!org) {
    org = await Organization.create({
      name: 'Observator Instruments AU',
      slug: 'observator-au',
      contactEmail: 'dana@observator.com',
      country: 'AU',
      timezone: 'Australia/Melbourne',
    });
    console.log(`✅ Organization created: ${org.name} (${org._id})`);
  } else {
    console.log(`⏭️  Organization already exists: ${org.name} (${org._id})`);
  }

  // ── Admin User ────────────────────────────────────────────────────────────
  let adminUser = await User.findOne({ email: ADMIN_EMAIL });
  if (!adminUser) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_COST);
    adminUser = await User.create({
      organizationId: org._id,
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: 'Dana',
      lastName: 'Galbraith',
      role: 'admin',
      isActive: true,
    });
    console.log(`✅ Admin user created: ${adminUser.email} (${adminUser._id})`);
    console.log(`   → Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } else {
    console.log(`⏭️  Admin user already exists: ${adminUser.email}`);
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
    // Create default device settings
    await DeviceSettings.create({
      deviceId: metDevice._id,
      organizationId: org._id,
    });
    console.log(`✅ MET-LINK device created: ${metDevice.name} (${metDevice._id})`);
  } else {
    console.log(`⏭️  MET-LINK device already exists: ${metDevice.name}`);
  }

  // ── NEP-LINK Device ───────────────────────────────────────────────────────
  let nepDevice = await Device.findOne({ organizationId: org._id, bleId: 'NEP-00:11:22:33:44:66' });
  if (!nepDevice) {
    nepDevice = await Device.create({
      organizationId: org._id,
      bleId: 'NEP-00:11:22:33:44:66',
      name: 'NEP-LINK-001',
      type: 'NEP-LINK',
      serialNo: 'SN-NEP-001',
      firmwareVersion: '1.3.2',
      isOnline: false,
    });
    await DeviceSettings.create({
      deviceId: nepDevice._id,
      organizationId: org._id,
    });
    console.log(`✅ NEP-LINK device created: ${nepDevice.name} (${nepDevice._id})`);
  } else {
    console.log(`⏭️  NEP-LINK device already exists: ${nepDevice.name}`);
  }

  console.log('\n📋 Seed Summary');
  console.log('─────────────────────────────────────────────');
  console.log(`Organization: ${org.name}`);
  console.log(`Organization ID: ${org._id}`);
  console.log(`Admin Email:  ${ADMIN_EMAIL}`);
  console.log(`Admin Password: ${ADMIN_PASSWORD}`);
  console.log(`MET-LINK Device ID: ${metDevice._id}`);
  console.log(`NEP-LINK Device ID: ${nepDevice._id}`);
  console.log('─────────────────────────────────────────────');
  console.log('✅ Seed completed successfully');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
