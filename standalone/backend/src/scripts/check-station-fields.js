/**
 * READ-ONLY audit — which station fields actually carry data?
 *
 *   cd backend && node src/scripts/check-station-fields.js
 *
 * Uses mongoose + dotenv, both already in backend/package.json. Reads MONGO_URI
 * from backend/.env itself, so nothing goes on the command line. Writes nothing.
 *
 * The deciding question is section 4: the station-detail page now reads
 * MetMeasure.batteryVoltageV, but the MET column spec has no alias that routes a
 * CSV column there — only `voltageV`. This prints both so the right fix is
 * obvious rather than guessed.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const URI = process.env.MONGO_URI;
if (!URI) {
  console.error('MONGO_URI not found. Run this from the backend/ directory (it reads backend/.env).');
  process.exit(1);
}

const pad = (s, n) => String(s).padEnd(n);
const pct = (n, d) => (d === 0 ? '   n/a' : `${((100 * n) / d).toFixed(1).padStart(5)}%`);

(async () => {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log(`\nconnected to "${db.databaseName}"\n${'='.repeat(72)}`);

  const C = {
    devices: db.collection('devices'),
    fw: db.collection('firmwarehistories'),
    nep: db.collection('nepsessions'),
    settings: db.collection('devicesettings'),
    records: db.collection('metrecords'),
    measures: db.collection('metmeasures'),
  };

  // 1 ── Device-level fields the detail page used to render
  console.log('\n1. DEVICE FIELDS, BY TYPE');
  for (const type of ['MET-LINK', 'NEP-LINK']) {
    const base = { type, deletedAt: null };
    const total = await C.devices.countDocuments(base);
    if (!total) { console.log(`\n  ${type}: none`); continue; }
    console.log(`\n  ${type} — ${total} device(s)`);
    const fields = [
      'lastSeenAt', 'lastBatteryPct', 'lastBatteryVoltage',
      'lastBatteryCharging', 'firmwareVersion',
    ];
    for (const f of fields) {
      const n = await C.devices.countDocuments({ ...base, [f]: { $ne: null } });
      console.log(`    ${pad(f, 22)} ${String(n).padStart(4)}/${total}  ${pct(n, total)}`);
    }
    const sens = await C.devices.countDocuments({ ...base, availableSensors: { $ne: [] } });
    console.log(`    ${pad('availableSensors', 22)} ${String(sens).padStart(4)}/${total}  ${pct(sens, total)}`);
  }

  // 2 ── Collections that fed the removed widgets
  console.log('\n2. FIRMWARE HISTORY / SESSIONS');
  console.log(`    FirmwareHistory rows : ${await C.fw.countDocuments({})}`);
  console.log(`    NepSession rows      : ${await C.nep.countDocuments({ deletedAt: null })}`);

  // 3 ── Settings page sensor prefs
  const ds = await C.settings.countDocuments({});
  console.log('\n3. DEVICE SETTINGS');
  console.log(`    documents            : ${ds}`);
  console.log(`    sensorShowPrefs set  : ${await C.settings.countDocuments({ sensorShowPrefs: { $ne: null } })}/${ds}`);
  console.log(`    sensorLogPrefs  set  : ${await C.settings.countDocuments({ sensorLogPrefs: { $ne: null } })}/${ds}`);

  // 4 ── THE DECIDING QUESTION
  console.log('\n4. POWER COLUMNS IN MetMeasure  <<< decides the battery fix');
  const mets = await C.devices.find({ type: 'MET-LINK', deletedAt: null }).toArray();
  for (const d of mets) {
    console.log(`\n  ${d.customName || d.name}  [${d.bleId}]`);
    const rec = await C.records.find({ deviceId: d._id, deletedAt: null })
      .sort({ dateStartMs: -1 }).limit(1).next();
    if (!rec) { console.log('    no MetRecord — nothing ingested'); continue; }

    // Newest record only (what the shipped helper actually queries)
    const base = { recordId: rec._id, rowType: 'data' };
    const rows = await C.measures.countDocuments(base);
    const b1 = await C.measures.countDocuments({ ...base, batteryVoltageV: { $ne: null } });
    const v1 = await C.measures.countDocuments({ ...base, voltageV: { $ne: null } });
    console.log(`    newest record: ${rows} rows`);
    console.log(`      batteryVoltageV set : ${b1}   <- what the shipped code reads`);
    console.log(`      voltageV        set : ${v1}   <- what CSV ingest can write`);

    // Across ALL of this device's records — the check the API route cannot do
    const ids = (await C.records.find({ deviceId: d._id, deletedAt: null })
      .project({ _id: 1 }).toArray()).map((r) => r._id);
    const bAll = await C.measures.countDocuments({ recordId: { $in: ids }, batteryVoltageV: { $ne: null } });
    const vAll = await C.measures.countDocuments({ recordId: { $in: ids }, voltageV: { $ne: null } });
    console.log(`    ALL ${ids.length} record(s):  batteryVoltageV=${bAll}   voltageV=${vAll}`);

    const sample = await C.measures.find(base).sort({ timestampMs: -1 }).limit(1).next();
    if (sample) {
      const skip = ['_id', 'recordId', 'organizationId', 'rowType', 'source', 'createdAt', 'expiresAt'];
      const live = Object.keys(sample).filter((k) => !skip.includes(k) && sample[k] != null);
      console.log(`    newest row carries  : ${live.join(', ')}`);
    }
    console.log(`    availableSensors    : ${(d.availableSensors || []).join(', ') || '(none)'}`);
  }

  console.log(`\n${'='.repeat(72)}\ndone — nothing was modified\n`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('\nFAILED:', e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
