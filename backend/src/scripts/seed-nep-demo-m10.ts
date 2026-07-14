/**
 * Month-10 NEP demo-data generator (ADDITIVE, isolated to one dedicated device).
 *
 * Creates a `NEP-LINK-M10-DEMO` device in the admin's organisation and fills it
 * with ~30 days of realistic NEP sessions + samples so every Month-10 chart has
 * something to show: turbidity-distribution, water-quality, probe-range breakdown,
 * turbidity↔temperature correlation, session-comparison, cross-session trend,
 * session events (spikes), GPS density/trails, daily-summary, and fleet-health.
 *
 * SAFE: only ever touches the ONE dedicated demo device — re-runs delete just that
 * device's sessions/samples/daily-summaries and regenerate. Nothing else is read
 * destructively. To remove it entirely, run with `--remove`.
 *
 * Run:    npx ts-node src/scripts/seed-nep-demo-m10.ts
 * Remove: npx ts-node src/scripts/seed-nep-demo-m10.ts --remove
 */
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { DeviceSettings } from '../models/DeviceSettings';
import { NepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';
import { NepDailySummary } from '../models/NepDailySummary';

const ADMIN_EMAIL = 'admin@observator.com';
const DEVICE_BLE_ID = 'NEP-M10-DEMO-01';
const DEVICE_NAME = 'NEP-LINK-M10-DEMO';

// Brisbane river-ish base coordinates; each day samples a slightly different reach.
const BASE_LAT = -27.4705;
const BASE_LNG = 153.026;
const DAY_MS = 86_400_000;

const round2 = (n: number | null): number | null => (n == null ? null : Math.round(n * 100) / 100);
const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;
const avg = (a: number[]): number | null => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const deriveProbe = (t: number): 'R1' | 'R2' | 'R3' => (t < 10 ? 'R1' : t <= 1000 ? 'R2' : 'R3');

const COMMENTS = [
  'Morning transect',
  'Post-rain sampling',
  'Routine weekly monitoring',
  'Upstream intake check',
  'Storm-event follow-up',
  'Downstream outfall survey',
  'Turbidity spot-check',
];

/**
 * Base turbidity for a given day offset (0 = 29 days ago … 29 = today). Models a
 * clear start, a mid-month storm spike (R3), then a slow recovery through R2 → R1
 * — so the trend/probe/calendar/distribution charts all show real structure.
 */
function baseTurbidityForDay(day: number): number {
  if (day < 8) return 4 + day * 0.6; // clear, R1
  if (day < 13) return 60 + (day - 8) * 90; // rising into the storm, R2
  if (day < 17) return 1400 + Math.sin((day - 13) * 1.3) * 700; // storm peak, R3
  if (day < 24) return 700 - (day - 17) * 90; // receding, R2
  return Math.max(5, 120 - (day - 24) * 18); // back toward R1
}

async function connect(): Promise<void> {
  const uri = process.env.MONGO_URI ?? '';
  if (!uri) throw new Error('MONGO_URI not set in .env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  console.log('✅ Connected to MongoDB');
}

async function findOrgAndDevice() {
  const admin = await User.findOne({ email: ADMIN_EMAIL });
  if (!admin) throw new Error(`Admin ${ADMIN_EMAIL} not found — run the base seed first (npm run seed).`);
  const org = await Organization.findById(admin.organizationId);
  if (!org) throw new Error('Admin organisation not found.');

  let device = await Device.findOne({ organizationId: org._id, bleId: DEVICE_BLE_ID });
  if (!device) {
    device = await Device.create({
      organizationId: org._id,
      bleId: DEVICE_BLE_ID,
      name: DEVICE_NAME,
      type: 'NEP-LINK',
      serialNo: 'SN-NEP-M10-DEMO',
      firmwareVersion: '1.3.2',
      isOnline: true,
      lastSeenAt: new Date(),
      lastBatteryPct: 78,
      lastBatteryCharging: false,
    });
    await DeviceSettings.create({ deviceId: device._id, organizationId: org._id });
    console.log(`✅ Demo device created: ${device.name} (${device._id})`);
  } else {
    device.isOnline = true;
    device.lastSeenAt = new Date();
    device.lastBatteryPct = 78;
    await device.save();
    console.log(`⏭️  Reusing demo device: ${device.name} (${device._id})`);
  }
  return { org, device };
}

async function purgeDeviceData(deviceId: Types.ObjectId): Promise<void> {
  const sessions = await NepSession.find({ deviceId }).select('id').lean();
  const ids = sessions.map((s) => s.id);
  if (ids.length) await NepSample.deleteMany({ sessionId: { $in: ids } });
  await NepSession.deleteMany({ deviceId });
  await NepDailySummary.deleteMany({ deviceId });
  if (ids.length) console.log(`🧹 Cleared ${ids.length} existing demo sessions (+ samples + daily summaries) for this device.`);
}

async function generate(): Promise<void> {
  await connect();
  const remove = process.argv.includes('--remove');
  const { org, device } = await findOrgAndDevice();
  const orgId = org._id as Types.ObjectId;
  const deviceId = device._id as Types.ObjectId;

  // Always start clean for THIS device only (idempotent, isolated).
  await purgeDeviceData(deviceId);

  if (remove) {
    await Device.deleteOne({ _id: deviceId });
    await DeviceSettings.deleteMany({ deviceId });
    console.log(`🗑️  Removed demo device ${DEVICE_NAME} entirely.`);
    await mongoose.disconnect();
    return;
  }

  const DAYS = 30;
  const stepMs = 10_000; // 10s cadence
  let totalSessions = 0;
  let totalSamples = 0;

  for (let day = 0; day < DAYS; day++) {
    // A couple of gap days so the completeness/activity calendar shows holes.
    if (day === 5 || day === 21) continue;
    // Most days one session; a few busy days get two.
    const sessionsToday = day === 3 || day === 15 || day === 26 ? 2 : 1;

    for (let s = 0; s < sessionsToday; s++) {
      const base = Math.max(2, baseTurbidityForDay(day) * (0.85 + Math.random() * 0.3));
      const durationMin = 30 + Math.floor(Math.random() * 45); // 30–75 min
      const sampleCount = Math.floor((durationMin * 60 * 1000) / stepMs);
      // Anchor to local morning/afternoon of that day.
      const dayStart = Date.now() - (DAYS - 1 - day) * DAY_MS;
      // The very last session of the run ends "now" so the live NEP tile + the
      // default 24h Scope-Bar window always have a current reading (like the MET
      // seed's today-record). Other sessions sit in that day's morning/afternoon.
      const isLatest = day === DAYS - 1 && s === sessionsToday - 1;
      const start = isLatest
        ? Date.now() - sampleCount * stepMs
        : dayStart - (s === 0 ? 6 : 2) * 3600 * 1000 + Math.floor(Math.random() * 1800_000);

      // 1–2 turbidity spikes within the session → session-events detects them.
      const spikeWindows: Array<[number, number, number]> = [];
      const spikes = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < spikes; k++) {
        const st = Math.floor(Math.random() * (sampleCount - 30));
        spikeWindows.push([st, st + 15 + Math.floor(Math.random() * 25), 1.8 + Math.random() * 1.4]);
      }

      // Distinct reach per session for spatial spread on the density map.
      const reachLat = BASE_LAT + (Math.random() - 0.5) * 0.02;
      const reachLng = BASE_LNG + (Math.random() - 0.5) * 0.02;

      const turbVals: number[] = [];
      const tempVals: number[] = [];
      const docs: Record<string, unknown>[] = [];
      const sessionId = uuidv4();

      for (let i = 0; i < sampleCount; i++) {
        const ts = start + i * stepMs;
        let turbidity = Math.max(0.5, base * (1 + 0.28 * Math.sin(i / 22)) + (Math.random() - 0.5) * base * 0.25);
        for (const [a, b, mult] of spikeWindows) if (i >= a && i <= b) turbidity *= mult;
        // Temperature positively correlated with turbidity (+ diurnal + noise) → clear Pearson r.
        const temperature = round2(15.5 + 0.0026 * turbidity + 1.5 * Math.sin(i / 90) + (Math.random() - 0.5) * 1.4);

        turbVals.push(turbidity);
        if (temperature != null) tempVals.push(temperature);
        docs.push({
          sessionId,
          organizationId: orgId,
          timestamp: ts,
          turbidityValue: round2(turbidity),
          temperatureValue: temperature,
          probeRange: deriveProbe(turbidity),
          locationLat: round6(reachLat + i * 0.00003 + (Math.random() - 0.5) * 0.00002),
          locationLng: round6(reachLng + i * 0.00002 + (Math.random() - 0.5) * 0.00002),
          batteryLevel: Math.max(35, Math.round(95 - i * 0.06)),
          batteryRawVoltage: Math.max(3300, 3850 - i),
          batteryCharging: false,
          demoModeEnabled: false,
        });
      }

      const tAvg = round2(avg(turbVals))!;
      await NepSession.create({
        id: sessionId,
        organizationId: orgId,
        deviceId,
        deviceName: DEVICE_NAME,
        startTimestamp: start,
        endTimestamp: start + sampleCount * stepMs,
        timezoneName: 'Australia/Brisbane',
        timezoneOffset: 10,
        probeRange: deriveProbe(tAvg),
        turbidityEnabled: true,
        temperatureEnabled: true,
        locationEnabled: true,
        comment: COMMENTS[(day + s) % COMMENTS.length],
        sampleCount,
        turbidityAvg: tAvg,
        turbidityMin: round2(Math.min(...turbVals)),
        turbidityMax: round2(Math.max(...turbVals)),
        temperatureAvg: round2(avg(tempVals)),
        temperatureMin: round2(Math.min(...tempVals)),
        temperatureMax: round2(Math.max(...tempVals)),
        hasTempData: true,
        hasGpsData: true,
        isDemoMode: false,
        syncedAt: new Date(),
      });
      await NepSample.insertMany(docs, { ordered: false });
      totalSessions++;
      totalSamples += docs.length;
    }
  }

  console.log(`✅ Generated ${totalSessions} sessions / ${totalSamples.toLocaleString()} samples on ${DEVICE_NAME}.`);
  console.log('\n📋 Summary');
  console.log('─────────────────────────────────────────────');
  console.log(`Organization:  ${org.name} (${orgId})`);
  console.log(`Demo device:   ${DEVICE_NAME} (${deviceId})`);
  console.log(`Login:         ${ADMIN_EMAIL} / Admin@1234`);
  console.log('Next:          npm run backfill:daily-summary   (populates the NEP daily-summary charts)');
  console.log('Remove later:  npx ts-node src/scripts/seed-nep-demo-m10.ts --remove');
  console.log('─────────────────────────────────────────────');

  await mongoose.disconnect();
}

generate().catch((err) => {
  console.error('❌ Demo generation failed:', err);
  process.exit(1);
});
