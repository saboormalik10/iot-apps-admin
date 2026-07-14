/**
 * Month-10 MET demo-data generator (ADDITIVE, isolated to one dedicated device).
 *
 * Creates a `MET-LINK-M10-DEMO` device in the admin's organisation and fills it
 * with ~30 days of realistic MET records + 1-minute measures across ALL 15 MET
 * sensors, so every MET chart has something to show:
 *   • Dashboard "Live" instruments — gauges (wind/humidity/pressure/solar), the
 *     thermometers (temp/dew point), the battery (voltage), the compass (wind dir),
 *     precip total + intensity tiles.
 *   • Dashboard "Graphs" stack + the wind rose.
 *   • MET analytics — multi-sensor, statistics, comfort indices, fog risk,
 *     pressure tendency, wind gust, and the device-comparison overlay (fleet).
 *
 * Every sensor the analytics pickers list is populated (temp, humidity, pressure,
 * wind speed/dir, solar, precip + precip-rate, dew point, voltage, battery voltage,
 * current, qnh, qfe, gps altitude) — the base seed left several at 0/null.
 *
 * SAFE: only ever touches the ONE dedicated demo device — re-runs delete just that
 * device's records/measures and regenerate. Nothing else is read destructively.
 * To remove it entirely, run with `--remove`.
 *
 * Run:    npx ts-node src/scripts/seed-met-demo-m10.ts
 * Remove: npx ts-node src/scripts/seed-met-demo-m10.ts --remove
 */
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { DeviceSettings } from '../models/DeviceSettings';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';

const ADMIN_EMAIL = 'admin@observator.com';
const DEVICE_BLE_ID = 'MET-M10-DEMO-01';
const DEVICE_NAME = 'MET-LINK-M10-DEMO';

// Brisbane-ish base coordinates; the station drifts a few metres around a fixed mast.
const BASE_LAT = -27.4698;
const BASE_LNG = 153.0251;
const BASE_ALT = 42;
const DAY_MS = 86_400_000;

const round2 = (n: number | null): number | null => (n == null ? null : Math.round(n * 100) / 100);
const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;
const fmtTs = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/**
 * A daily "weather regime" so the 30-day charts show real structure: a calm clear
 * spell, a windy front mid-month with a pressure drop + rain, then recovery. Drives
 * the pressure-tendency, fog-risk, wind-gust and comfort widgets, not just noise.
 */
function regimeForDay(day: number): { windBase: number; pressureBase: number; rainy: boolean; humidityBase: number } {
  if (day < 8) return { windBase: 3, pressureBase: 1018, rainy: false, humidityBase: 50 }; // calm & clear
  if (day < 12) return { windBase: 7, pressureBase: 1010, rainy: false, humidityBase: 62 }; // freshening
  if (day < 16) return { windBase: 12, pressureBase: 998, rainy: true, humidityBase: 85 }; // front + rain
  if (day < 22) return { windBase: 8, pressureBase: 1006, rainy: false, humidityBase: 70 }; // clearing
  return { windBase: 4, pressureBase: 1016, rainy: false, humidityBase: 55 }; // settled again
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
      type: 'MET-LINK',
      serialNo: 'SN-MET-M10-DEMO',
      firmwareVersion: '2.1.4',
      isOnline: true,
      lastSeenAt: new Date(),
    });
    await DeviceSettings.create({ deviceId: device._id, organizationId: org._id });
    console.log(`✅ Demo device created: ${device.name} (${device._id})`);
  } else {
    device.isOnline = true;
    device.lastSeenAt = new Date();
    await device.save();
    console.log(`⏭️  Reusing demo device: ${device.name} (${device._id})`);
  }
  return { org, device };
}

async function purgeDeviceData(deviceId: Types.ObjectId): Promise<void> {
  const records = await MetRecord.find({ deviceId }).select('_id').lean();
  const ids = records.map((r) => r._id);
  if (ids.length) await MetMeasure.deleteMany({ recordId: { $in: ids } });
  await MetRecord.deleteMany({ deviceId });
  if (ids.length) console.log(`🧹 Cleared ${ids.length} existing demo records (+ measures) for this device.`);
}

/** Build one day's worth of 1-minute measures for a record, returning the docs. */
function buildDayMeasures(
  recordId: Types.ObjectId,
  orgId: Types.ObjectId,
  dayStartMs: number,
  endMs: number,
): Record<string, unknown>[] {
  const stepMs = 60_000; // 1-min cadence
  const day = Math.round((Date.now() - dayStartMs) / DAY_MS);
  const regime = regimeForDay(29 - day);
  const docs: Record<string, unknown>[] = [];

  for (let ts = dayStartMs; ts < endMs; ts += stepMs) {
    const i = (ts - dayStartMs) / stepMs;
    const tod = (ts % DAY_MS) / DAY_MS; // 0..1 across the day
    const solarCurve = Math.sin(clamp((tod - 0.25) / 0.5, 0, 1) * Math.PI); // daylight bump ~06:00–18:00

    const temp = 14 + 9 * solarCurve + 2 * Math.sin(i / 90) + (Math.random() - 0.5);
    const windMs = Math.max(0, regime.windBase + 3 * Math.sin(i / 25) + (Math.random() - 0.5) * 2.2);
    const gust = windMs + Math.max(0, (Math.random() - 0.6) * 4); // occasional gusts > mean
    const windDir = (200 + 70 * Math.sin(i / 45) + (Math.random() - 0.5) * 25 + 360) % 360;
    const pressure = regime.pressureBase + 3 * Math.sin(i / 200) + (Math.random() - 0.5) * 0.6;
    const humidity = clamp(regime.humidityBase + 12 * Math.sin(tod * 2 * Math.PI + 1) - 8 * solarCurve + (Math.random() - 0.5) * 4, 5, 100);
    const dewPoint = temp - (100 - humidity) / 5;
    const solar = Math.max(0, 950 * solarCurve + (Math.random() - 0.5) * 30);
    // Rain only on rainy-regime days, and mostly in an afternoon burst.
    const raining = regime.rainy && tod > 0.45 && tod < 0.7;
    const precipRate = raining ? Math.max(0, 6 + 8 * Math.sin((tod - 0.45) / 0.25 * Math.PI) + (Math.random() - 0.5) * 3) : 0;
    const voltage = 12.4 + 0.5 * solarCurve + (Math.random() - 0.5) * 0.2; // charges in sun
    const battV = voltage - 0.15 + (Math.random() - 0.5) * 0.1;
    const current = round2(0.8 + 0.6 * solarCurve + (Math.random() - 0.5) * 0.2);

    docs.push({
      recordId,
      organizationId: orgId,
      rowType: 'data',
      dataSentence: `${round2(windMs)},m/s,Wind,${round2(temp)},C,Temp,${round2(pressure)},hPa,Press`,
      timeStamp: fmtTs(ts),
      timestampMs: ts,
      windSpeedMs: round2(gust),
      windSpeedKmh: round2(gust * 3.6),
      windSpeedKnots: round2(gust / 0.514444),
      windSpeedTrueMs: round2(gust),
      windSpeedRelMs: round2(gust),
      windDirTrueDeg: round2(windDir),
      windDirRelDeg: round2((windDir + 15) % 360),
      tempC: round2(temp),
      humidityPct: round2(humidity),
      pressureHpa: round2(pressure),
      dewPointC: round2(dewPoint),
      solarWm2: round2(solar),
      precipRateMmHr: round2(precipRate),
      precipMm: 0, // set to a running total below
      qnhHpa: round2(pressure + 0.3),
      qfeHpa: round2(pressure - 1.1),
      voltageV: round2(voltage),
      batteryVoltageV: round2(battV),
      currentA: current,
      gpsLat: round6(BASE_LAT + (Math.random() - 0.5) * 0.0004),
      gpsLng: round6(BASE_LNG + (Math.random() - 0.5) * 0.0004),
      gpsAltM: round2(BASE_ALT + (Math.random() - 0.5) * 2),
      gpsSatellites: 8 + Math.floor(Math.random() * 4),
      isDemoMode: false,
    });
  }

  // Turn per-minute precip rate (mm/hr) into a cumulative precip total (mm) for the day.
  let cumulative = 0;
  for (const d of docs) {
    cumulative += ((d.precipRateMmHr as number) ?? 0) / 60; // mm this minute
    d.precipMm = round2(cumulative);
  }
  return docs;
}

async function generate(): Promise<void> {
  await connect();
  const remove = process.argv.includes('--remove');
  const { org, device } = await findOrgAndDevice();
  const orgId = org._id as Types.ObjectId;
  const deviceId = device._id as Types.ObjectId;

  await purgeDeviceData(deviceId);

  if (remove) {
    await Device.deleteOne({ _id: deviceId });
    await DeviceSettings.deleteMany({ deviceId });
    console.log(`🗑️  Removed demo device ${DEVICE_NAME} entirely.`);
    await mongoose.disconnect();
    return;
  }

  const DAYS = 30;
  let totalRecords = 0;
  let totalMeasures = 0;

  for (let d = 0; d < DAYS; d++) {
    // A couple of gap days so completeness/activity views show holes.
    if (d === 6 || d === 20) continue;

    const dayIndexFromNow = DAYS - 1 - d; // 0 = today
    const midnight = Date.now() - dayIndexFromNow * DAY_MS;
    const dayStart = midnight - (midnight % DAY_MS); // align to UTC midnight
    // Today's record ends "now"; past days run a full 24h.
    const isToday = dayIndexFromNow === 0;
    const dayEnd = isToday ? Date.now() : dayStart + DAY_MS;

    const record = await MetRecord.create({
      organizationId: orgId,
      deviceId,
      deviceName: DEVICE_NAME,
      // Unique per record: the (organizationId, localRecordId) index is unique and
      // treats explicit null as a value, so every demo record needs a distinct id.
      // High base avoids colliding with any real device-assigned localRecordIds.
      localRecordId: 9_100_000 + d,
      dateStart: fmtTs(dayStart),
      dateEnd: fmtTs(dayEnd),
      dateStartMs: dayStart,
      dateEndMs: dayEnd,
      comment: `Demo station log — ${new Date(dayStart).toISOString().slice(0, 10)}`,
      measureCount: 0,
      hasHeaderRow: true,
      isDemoMode: false,
      syncedAt: new Date(),
    });

    const docs = buildDayMeasures(record._id as Types.ObjectId, orgId, dayStart, dayEnd);
    if (docs.length) {
      await MetMeasure.insertMany(docs, { ordered: false });
      record.measureCount = docs.length;
      await record.save();
    }
    totalRecords++;
    totalMeasures += docs.length;
  }

  console.log(`✅ Generated ${totalRecords} records / ${totalMeasures.toLocaleString()} measures on ${DEVICE_NAME}.`);
  console.log('\n📋 Summary');
  console.log('─────────────────────────────────────────────');
  console.log(`Organization:  ${org.name} (${orgId})`);
  console.log(`Demo device:   ${DEVICE_NAME} (${deviceId})`);
  console.log(`Login:         ${ADMIN_EMAIL} / Admin@1234`);
  console.log('Remove later:  npx ts-node src/scripts/seed-met-demo-m10.ts --remove');
  console.log('─────────────────────────────────────────────');

  await mongoose.disconnect();
}

generate().catch((err) => {
  console.error('❌ Demo generation failed:', err);
  process.exit(1);
});
