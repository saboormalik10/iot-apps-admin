#!/usr/bin/env node
/**
 * Hardware-free device simulator (plan §7 / PR6).
 *
 * Drives the REAL backend sync endpoints with the mobile API key, so the backend
 * runs its true ingest → evaluate → notify pipeline and emits real socket.io
 * events — no backend change, no hardware. For local dev, the CI E2E job, and demos.
 *
 *   POST  /v1/sync/upload           → met:latest / nep:sample / nep:session:created
 *   PATCH /v1/sync/device-status    → device:status / device:connected
 *
 * It deliberately pushes a NEP turbidity reading ABOVE the seeded alert rule's
 * threshold (turbidity gt 1000 NTU) so the pipeline fires alert:triggered +
 * notification:new, and heartbeats a device so device:status/device:connected fire.
 *
 * Env:
 *   BACKEND_URL      backend origin incl. /v1  (default http://localhost:3000/v1)
 *   MOBILE_API_KEY   obs_mob_…  (required)
 *   MOBILE_ORG_ID    org ObjectId (used by the backend; the key resolves the org)
 *   MET_DEVICE_ID / NEP_DEVICE_ID  optional; auto-created if absent
 *   INTERVAL_MS      tick interval (default 5000)
 *   TICKS            number of ticks before exit (default Infinity; CI sets e.g. 8)
 */

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:3000/v1').replace(/\/$/, '');
const API_KEY = process.env.MOBILE_API_KEY;
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 5000);
const MAX_TICKS = Number(process.env.TICKS ?? Infinity);

if (!API_KEY) {
  console.error('✗ MOBILE_API_KEY is required (obs_mob_…). See admin-web/.env.example.');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

/** Format epoch ms as the backend's "YYYY-MM-DD HH:mm:ss" local string. */
function fmt(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function api(method, path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function ensureDevice(type, bleId, name) {
  const created = await api('POST', '/devices', { bleId, name, type, firmwareVersion: '2.0.0' });
  const id = created?.data?._id ?? created?.data?.id ?? created?._id;
  if (!id) throw new Error(`could not resolve device id from ${JSON.stringify(created)}`);
  return id;
}

async function uploadMetMeasure(deviceId) {
  const now = Date.now();
  const wind = (2 + Math.random() * 8).toFixed(2); // m/s
  const temp = (15 + Math.random() * 10).toFixed(1); // °C
  await api('POST', '/sync/upload', {
    type: 'met_record',
    deviceId,
    dateStart: fmt(now),
    measures: [
      { dataSentence: `${wind},m/s,Wind speed,true,${temp},°C,Temperature`, timeStamp: fmt(now) },
    ],
  });
  console.log(`  ↑ MET measure  wind=${wind} m/s temp=${temp}°C`);
}

async function uploadNepSample(deviceId, turbidity) {
  const now = Date.now();
  await api('POST', '/sync/upload', {
    type: 'nep_session',
    sessionId: uuid(),
    deviceId,
    startTimestamp: now,
    turbidityEnabled: true,
    temperatureEnabled: true,
    samples: [
      {
        timestamp: now,
        turbidityValue: turbidity,
        temperatureValue: Number((16 + Math.random() * 6).toFixed(1)),
        probeRange: turbidity > 1000 ? 'R3' : 'R1',
      },
    ],
  });
  console.log(`  ↑ NEP sample   turbidity=${turbidity} NTU${turbidity > 1000 ? '  ⚠ crosses alert threshold' : ''}`);
}

async function heartbeat(deviceId, appType, online) {
  await api('PATCH', '/sync/device-status', {
    deviceId,
    batteryPct: 60 + Math.floor(Math.random() * 40),
    firmwareVersion: '2.0.0',
    appType,
    isOnline: online,
  });
  console.log(`  ↕ device-status ${appType} online=${online}`);
}

async function main() {
  console.log(`▶ Simulator → ${BACKEND_URL}  (interval ${INTERVAL_MS}ms)`);

  const metId = process.env.MET_DEVICE_ID ?? (await ensureDevice('MET-LINK', 'MET-SIM-00:00:00:00:00:01', 'MET-SIM-001'));
  const nepId = process.env.NEP_DEVICE_ID ?? (await ensureDevice('NEP-LINK', 'NEP-SIM-00:00:00:00:00:02', 'NEP-SIM-001'));
  console.log(`  devices: MET=${metId}  NEP=${nepId}`);

  let tick = 0;
  const run = async () => {
    tick += 1;
    console.log(`\n— tick ${tick} —`);
    try {
      await uploadMetMeasure(metId);
      // On tick 2, cross the alert threshold once (rule has a 60-min cooldown).
      await uploadNepSample(nepId, tick === 2 ? 1200 : Math.floor(Math.random() * 400));
      // Toggle online/offline to exercise device:status / device:connected.
      await heartbeat(metId, 'MET-LINK', tick % 4 !== 0);
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
    }
    if (tick >= MAX_TICKS) {
      console.log('\n✓ Simulator finished.');
      process.exit(0);
    }
  };

  await run();
  const timer = setInterval(run, INTERVAL_MS);
  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\n✓ Simulator stopped.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`✗ Simulator failed: ${err.message}`);
  process.exit(1);
});
