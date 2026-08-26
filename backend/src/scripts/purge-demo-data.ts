import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { Device } from '../models/Device';
import { DeviceSettings } from '../models/DeviceSettings';
import { FirmwareHistory } from '../models/FirmwareHistory';
import { AlertRule } from '../models/AlertRule';
import { DashboardLayout } from '../models/DashboardLayout';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { MetMeasureDownsampled } from '../models/MetMeasureDownsampled';
import { MetPicture } from '../models/MetPicture';
import { MetDailySummary } from '../models/MetDailySummary';
import { NepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';
import { NepSampleDownsampled } from '../models/NepSampleDownsampled';
import { NepFile } from '../models/NepFile';
import { NepDailySummary } from '../models/NepDailySummary';
import { KnownDevice } from '../models/KnownDevice';
import { ShareToken } from '../models/ShareToken';
import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { PasswordResetToken } from '../models/PasswordResetToken';
import { InviteToken } from '../models/InviteToken';
import { Notification } from '../models/Notification';
import { NotificationToken } from '../models/NotificationToken';
import { AuditLog } from '../models/AuditLog';
import { FirmwareTarget } from '../models/FirmwareTarget';
import { Organization } from '../models/Organization';

/**
 * Month 13 · W1 — purge demo and seeded data before SFTP ingestion goes live.
 *
 * WHAT COUNTS AS DEMO
 * Demo data was defined by the DEVICE: a device whose `bleId` starts with `demo`,
 * and everything recorded against it. Purging by a per-row flag would have left
 * sessions, samples, files and rollups behind, because several of those
 * collections never had such a field.
 *
 * NOTE: the whole demo feature — the `isDemoMode` field, `demoOnly` query params
 * and `demo-scope.util.ts` — was removed in M15 W1. This script is kept because
 * it is the cascade map for a device and its data, which is still the correct way
 * to remove a decommissioned station.
 *
 * SAFETY
 * Dry-run by default: it prints what it WOULD delete and writes nothing. Deletion
 * requires `--apply`. User accounts are never touched without `--purge-users`,
 * because they are real logins.
 *
 *   npm run purge:demo                      # dry run — report only
 *   npm run purge:demo -- --apply           # delete demo devices + cascade
 *   npm run purge:demo -- --users a@b.com   # report those users
 *   npm run purge:demo -- --apply --users a@b.com --purge-users
 *   npm run purge:demo -- --all             # dry run of the FULL wipe
 *   npm run purge:demo -- --all --apply     # wipe everything below Organization
 *
 * Idempotent: safe to re-run. A second run reports zero.
 * Re-seed logins afterwards with `npm run seed:accounts`.
 */

const APPLY = process.argv.includes('--apply');
const PURGE_USERS = process.argv.includes('--purge-users');
/**
 * `--all` widens the target from "demo devices" to "every device and every user".
 * Used once, at the M13 W1 clean slate: the database held only seeded, dummy and
 * test fixtures — no station had ever ingested — so everything below the
 * Organization was disposable. Organizations are NEVER deleted by this script.
 */
const ALL = process.argv.includes('--all');

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/** The demo-device marker. `demo-scope.util.ts` was removed in M15 W1. */
const DEMO_BLE_ID_REGEX = /^demo/i;

/** In `--all` mode every device matches; otherwise only demo-prefixed ones. */
const deviceSelector = () => (ALL ? {} : { bleId: DEMO_BLE_ID_REGEX });

type Counts = Record<string, number>;

const fmt = (n: number) => n.toLocaleString('en-US');

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log(`• Connected to ${mongoose.connection.name}`);
  console.log(APPLY ? '\n⚠️  APPLY MODE — data will be deleted\n' : '\n• DRY RUN — nothing will be written\n');

  // ── 1. Identify target devices ─────────────────────────────────────────────
  const demoDevices = await Device.find(deviceSelector()).select('_id bleId name type organizationId').lean();
  const demoIds = demoDevices.map((d) => d._id as Types.ObjectId);

  console.log(ALL ? '── ALL devices (--all) ───────────────────────────────────────' : '── Demo devices ──────────────────────────────────────────────');
  if (demoDevices.length === 0) {
    console.log('  (none)');
  } else {
    for (const d of demoDevices) {
      console.log(`  ${String(d._id)}  ${d.type.padEnd(9)} bleId=${d.bleId.padEnd(12)} ${d.name}`);
    }
  }
  console.log(`  total: ${demoDevices.length}\n`);

  // ── 2. Walk the cascade ────────────────────────────────────────────────────
  // MetRecord → MetMeasure / MetPicture; NepSession → NepSample / NepFile.
  // Children are collected by parent id, because only the parent carries deviceId.
  const metRecordIds = demoIds.length
    ? (await MetRecord.find({ deviceId: { $in: demoIds } }).select('_id').lean()).map((r) => r._id as Types.ObjectId)
    : [];
  // NEP children join on the app's UUID (`NepSession.id`), NOT on `_id`:
  // `NepSample.sessionId` / `NepFile.sessionId` are plain Strings holding that
  // UUID. Matching them against `_id` silently returns zero and orphans every
  // sample — verified against the live database before this was corrected.
  const nepSessions = demoIds.length
    ? await NepSession.find({ deviceId: { $in: demoIds } }).select('_id id').lean()
    : [];
  const nepSessionIds = nepSessions.map((s) => s._id as Types.ObjectId);
  const nepSessionUuids = nepSessions.map((s) => s.id as string).filter(Boolean);

  const byDevice = { deviceId: { $in: demoIds } };
  const byRecord = { recordId: { $in: metRecordIds } };
  const bySession = { sessionId: { $in: nepSessionUuids } };

  const counts: Counts = {};
  const skip = demoIds.length === 0;

  counts['MetMeasure'] = skip || !metRecordIds.length ? 0 : await MetMeasure.countDocuments(byRecord);
  counts['MetPicture'] = skip || !metRecordIds.length ? 0 : await MetPicture.countDocuments(byRecord);
  counts['MetRecord'] = metRecordIds.length;
  counts['MetMeasureDownsampled'] = skip ? 0 : await MetMeasureDownsampled.countDocuments(byDevice);
  counts['MetDailySummary'] = skip ? 0 : await MetDailySummary.countDocuments(byDevice);
  counts['NepSample'] = skip || !nepSessionUuids.length ? 0 : await NepSample.countDocuments(bySession);
  counts['NepFile'] = skip || !nepSessionUuids.length ? 0 : await NepFile.countDocuments(bySession);
  counts['NepSampleDownsampled'] = skip || !nepSessionUuids.length ? 0 : await NepSampleDownsampled.countDocuments(bySession);
  counts['NepSession'] = nepSessionIds.length;
  counts['NepDailySummary'] = skip ? 0 : await NepDailySummary.countDocuments(byDevice);
  counts['DeviceSettings'] = skip ? 0 : await DeviceSettings.countDocuments(byDevice);
  counts['FirmwareHistory'] = skip ? 0 : await FirmwareHistory.countDocuments(byDevice);
  counts['AlertRule'] = skip ? 0 : await AlertRule.countDocuments(byDevice);
  counts['DashboardLayout'] = skip ? 0 : await DashboardLayout.countDocuments(byDevice);
  counts['Device'] = demoDevices.length;

  // ShareToken points at a resource by string id, not by ObjectId ref.
  const shareResourceIds = [...metRecordIds.map(String), ...nepSessionIds.map(String), ...nepSessionUuids];
  counts['ShareToken'] = shareResourceIds.length
    ? await ShareToken.countDocuments({ resourceId: { $in: shareResourceIds } })
    : 0;

  // KnownDevice is keyed by bleId, not deviceId.
  counts['KnownDevice'] = await KnownDevice.countDocuments(ALL ? {} : { bleId: DEMO_BLE_ID_REGEX });

  // In --all mode the account layer goes too. Organizations are never touched.
  if (ALL) {
    counts['User'] = await User.countDocuments({});
    counts['RefreshToken'] = await RefreshToken.countDocuments({});
    counts['PasswordResetToken'] = await PasswordResetToken.countDocuments({});
    counts['InviteToken'] = await InviteToken.countDocuments({});
    counts['Notification'] = await Notification.countDocuments({});
    counts['NotificationToken'] = await NotificationToken.countDocuments({});
    counts['AuditLog'] = await AuditLog.countDocuments({});
    counts['FirmwareTarget'] = await FirmwareTarget.countDocuments({});
    counts['ShareToken'] = await ShareToken.countDocuments({});
  }

  console.log('── Cascade (rows that would be deleted) ──────────────────────');
  let total = 0;
  for (const [name, n] of Object.entries(counts)) {
    total += n;
    console.log(`  ${name.padEnd(24)} ${fmt(n).padStart(10)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(24)} ${fmt(total).padStart(10)}\n`);

  // ── 3. Users ───────────────────────────────────────────────────────────────
  const emailsArg = argValue('--users');
  const emails = emailsArg ? emailsArg.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) : [];
  if (emails.length) {
    const users = await User.find({ email: { $in: emails } }).select('_id email role organizationId isActive').lean();
    console.log('── Users named on --users ────────────────────────────────────');
    for (const e of emails) {
      const u = users.find((x) => x.email === e);
      console.log(u ? `  ${u.email.padEnd(32)} role=${u.role} active=${u.isActive}` : `  ${e.padEnd(32)} (not found)`);
    }
    console.log(`  matched: ${users.length}${PURGE_USERS ? '' : '  — pass --purge-users to delete'}\n`);
  }

  if (!APPLY) {
    console.log('• Dry run complete. Re-run with --apply to delete.');
    await mongoose.disconnect();
    return;
  }

  // ── 4. Delete, children before parents ─────────────────────────────────────
  console.log('── Deleting ──────────────────────────────────────────────────');
  const del = async (label: string, fn: () => Promise<{ deletedCount?: number }>) => {
    const r = await fn();
    console.log(`  ${label.padEnd(24)} ${fmt(r.deletedCount ?? 0).padStart(10)}`);
  };

  if (metRecordIds.length) {
    await del('MetMeasure', () => MetMeasure.deleteMany(byRecord));
    await del('MetPicture', () => MetPicture.deleteMany(byRecord));
  }
  if (nepSessionUuids.length) {
    await del('NepSample', () => NepSample.deleteMany(bySession));
    await del('NepFile', () => NepFile.deleteMany(bySession));
    await del('NepSampleDownsampled', () => NepSampleDownsampled.deleteMany(bySession));
  }
  if (shareResourceIds.length) {
    await del('ShareToken', () => ShareToken.deleteMany({ resourceId: { $in: shareResourceIds } }));
  }
  if (demoIds.length) {
    await del('MetRecord', () => MetRecord.deleteMany(byDevice));
    await del('NepSession', () => NepSession.deleteMany(byDevice));
    await del('MetMeasureDownsampled', () => MetMeasureDownsampled.deleteMany(byDevice));
    await del('MetDailySummary', () => MetDailySummary.deleteMany(byDevice));
    await del('NepDailySummary', () => NepDailySummary.deleteMany(byDevice));
    await del('DeviceSettings', () => DeviceSettings.deleteMany(byDevice));
    await del('FirmwareHistory', () => FirmwareHistory.deleteMany(byDevice));
    await del('AlertRule', () => AlertRule.deleteMany(byDevice));
    await del('DashboardLayout', () => DashboardLayout.deleteMany(byDevice));
    await del('Device', () => Device.deleteMany({ _id: { $in: demoIds } }));
  }
  await del('KnownDevice', () => KnownDevice.deleteMany(ALL ? {} : { bleId: DEMO_BLE_ID_REGEX }));

  if (ALL) {
    // Orphan sweep. Some rows reference devices that were deleted long ago, so the
    // device-driven cascade above never reaches them (28 sessions / ~554 samples
    // on the live database). In --all mode nothing below the Organization is
    // being kept, so anything still standing is by definition an orphan.
    await del('MetMeasure (orphan)', () => MetMeasure.deleteMany({}));
    await del('MetPicture (orphan)', () => MetPicture.deleteMany({}));
    await del('MetRecord (orphan)', () => MetRecord.deleteMany({}));
    await del('MetMeasureDownsampled*', () => MetMeasureDownsampled.deleteMany({}));
    await del('MetDailySummary (orphan)', () => MetDailySummary.deleteMany({}));
    await del('NepSample (orphan)', () => NepSample.deleteMany({}));
    await del('NepFile (orphan)', () => NepFile.deleteMany({}));
    await del('NepSampleDownsampled*', () => NepSampleDownsampled.deleteMany({}));
    await del('NepSession (orphan)', () => NepSession.deleteMany({}));
    await del('NepDailySummary (orphan)', () => NepDailySummary.deleteMany({}));
    await del('DeviceSettings (orphan)', () => DeviceSettings.deleteMany({}));
    await del('FirmwareHistory (orphan)', () => FirmwareHistory.deleteMany({}));
    await del('AlertRule (orphan)', () => AlertRule.deleteMany({}));
    await del('DashboardLayout (orphan)', () => DashboardLayout.deleteMany({}));
    await del('Device (orphan)', () => Device.deleteMany({}));

    // Account layer. Organizations survive — they are the tenant, not the data.
    await del('User', () => User.deleteMany({}));
    await del('RefreshToken', () => RefreshToken.deleteMany({}));
    await del('PasswordResetToken', () => PasswordResetToken.deleteMany({}));
    await del('InviteToken', () => InviteToken.deleteMany({}));
    await del('Notification', () => Notification.deleteMany({}));
    await del('NotificationToken', () => NotificationToken.deleteMany({}));
    await del('AuditLog', () => AuditLog.deleteMany({}));
    await del('FirmwareTarget', () => FirmwareTarget.deleteMany({}));
    await del('ShareToken', () => ShareToken.deleteMany({}));
  } else if (emails.length && PURGE_USERS) {
    await del('User', () => User.deleteMany({ email: { $in: emails } }));
  }

  // ── 5. Verify ──────────────────────────────────────────────────────────────
  console.log('\n── Verification ──────────────────────────────────────────────');
  const remaining = await Device.countDocuments(deviceSelector());
  const orgsLeft = await Organization.countDocuments({});
  let bad = remaining !== 0 || orgsLeft === 0;

  console.log(`  ${remaining === 0 ? '✅' : '❌'} target devices remaining: ${remaining}`);
  console.log(`  ${orgsLeft > 0 ? '✅' : '❌'} organizations preserved:   ${orgsLeft}`);

  if (ALL) {
    const checks: [string, number][] = [
      ['MetMeasure', await MetMeasure.countDocuments({})],
      ['MetRecord', await MetRecord.countDocuments({})],
      ['NepSample', await NepSample.countDocuments({})],
      ['NepSession', await NepSession.countDocuments({})],
      ['Device', await Device.countDocuments({})],
      ['User', await User.countDocuments({})],
    ];
    for (const [name, n] of checks) {
      console.log(`  ${n === 0 ? '✅' : '❌'} ${name.padEnd(24)} ${n}`);
      if (n !== 0) bad = true;
    }
    console.log('\n  ⚠️  No logins exist. Run `npm run seed:accounts` before signing in.');
  }
  if (bad) process.exitCode = 1;

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
