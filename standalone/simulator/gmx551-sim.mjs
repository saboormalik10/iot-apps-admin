#!/usr/bin/env node
/**
 * GMX551 simulator — plays the sensor + serial converter over TCP.
 *
 * The client has no sensor yet (22 Sep 2026), so this is how the standalone
 * software is exercised end to end. It connects to the stream port the way the
 * PoE converter will, and sends what Gill's MaxiMet manual describes: a header
 * and units line at "power-up", then one framed reading a second —
 *
 *   <STX>Q,DIR,SPEED,CDIR,CSPEED,TEMP,RH,PRESS,PRECIPT,PRECIPI,STATUS,<ETX>checksum
 *
 * No dependencies: plain Node 18+.
 *
 *   node gmx551-sim.mjs                          normal weather to localhost:4000
 *   node gmx551-sim.mjs --scenario all           every awkward case at once
 *   node gmx551-sim.mjs --host 192.168.1.20 --port 4000 --scenario gust,rain
 *
 * Scenarios (comma-separated):
 *   normal    steady breeze with noise, a daily temperature cycle
 *   gust      a 3–5 second burst to 15–20 m/s every few minutes
 *   north     wind swinging either side of north (350° ↔ 10°)
 *   rain      showers: rain from the start for --shower seconds (600), then as long dry
 *   reset     the rain counter resets to zero every --reset-every seconds (600)
 *   badsum    every 30th reading has a wrong checksum
 *   split     every reading is sent in two or three pieces
 *   drop      the connection drops every three minutes and comes back
 *   noheader  no header on connect (the reader must use its default order)
 *   interval  rain reported per reading instead of as a running total
 *   all       everything above except noheader and interval
 */
import net from 'node:net';

// ── Arguments ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);
if (args.help) {
  console.log('usage: node gmx551-sim.mjs [--host 127.0.0.1] [--port 4000] [--interval 1000] [--scenario normal] [--count N]');
  process.exit(0);
}
const HOST = args.host ?? '127.0.0.1';
const PORT = Number(args.port ?? 4000);
const INTERVAL_MS = Number(args.interval ?? 1000);
const COUNT = args.count ? Number(args.count) : Infinity;
const SHOWER_MS = Number(args.shower ?? 600) * 1000;
const RESET_EVERY_MS = Number(args['reset-every'] ?? 600) * 1000;
const START_MS = Date.now();
const ALL = ['gust', 'north', 'rain', 'reset', 'badsum', 'split', 'drop'];
const scenarios = new Set(
  String(args.scenario ?? 'normal')
    .split(',')
    .flatMap((s) => (s.trim() === 'all' ? ALL : [s.trim()])),
);
const on = (s) => scenarios.has(s);

// ── The wire format ───────────────────────────────────────────────────────────
const STX = '\x02';
const ETX = '\x03';
const HEADER = 'NODE,DIR,SPEED,CDIR,CSPEED,TEMP,RH,PRESS,PRECIPT,PRECIPI,STATUS,CHECK';
const UNITS = '-,DEG,MS,DEG,MS,C,%,HPA,MM,MM/H,-,-';

/** XOR of every byte between STX and ETX, as two hex digits (Gill's checksum). */
function checksum(payload) {
  let x = 0;
  for (let i = 0; i < payload.length; i++) x ^= payload.charCodeAt(i) & 0xff;
  return x.toString(16).toUpperCase().padStart(2, '0');
}

const pad = (n, width, dp, sign = false) => {
  const s = Math.abs(n).toFixed(dp).padStart(width, '0');
  return sign ? (n < 0 ? '-' : '+') + s : s;
};

// ── The weather ───────────────────────────────────────────────────────────────
const state = {
  speed: 4,
  dir: 220,
  pressure: 1012,
  rainTotal: 812.4, // the gauge's counter holds history from before we connect
  gustLeft: 0,
  sent: 0,
  resets: 0,
};
const noise = (amp) => (Math.random() - 0.5) * 2 * amp;

function reading(nowMs) {
  const t = new Date(nowMs);
  const minuteOfDay = t.getHours() * 60 + t.getMinutes();

  // Wind: a random walk around a breeze.
  state.speed = Math.max(0, Math.min(14, state.speed + noise(0.4) + (5 - state.speed) * 0.02));
  if (on('gust') && state.gustLeft === 0 && Math.random() < 1 / 180) state.gustLeft = 3 + Math.floor(Math.random() * 3);
  let speed = state.speed;
  if (state.gustLeft > 0) {
    speed = 15 + Math.random() * 5;
    state.gustLeft -= 1;
  }
  if (on('north')) state.dir = (360 + (Math.random() < 0.5 ? 350 : 10) + noise(5)) % 360;
  else state.dir = (state.dir + noise(8) + 360) % 360;

  // Temperature and humidity follow the time of day; pressure drifts.
  const diurnal = Math.sin(((minuteOfDay - 9 * 60) / 1440) * 2 * Math.PI);
  const temp = 18 + 6 * diurnal + noise(0.1);
  const rh = Math.max(15, Math.min(100, 65 - 20 * diurnal + noise(0.5)));
  state.pressure += noise(0.02) + (1012 - state.pressure) * 0.001;

  // Rain: a shower from the start, then as long dry, and so on; 0.2 mm tips.
  const elapsed = nowMs - START_MS;
  const raining = on('rain') && Math.floor(elapsed / SHOWER_MS) % 2 === 0;
  // A tip every ~50 s on average: ~14 mm/h, heavy but real rain. (0.15 a second
  // was over 100 mm/h — a rate no dashboard should ever be demonstrated with.)
  let tip = 0;
  if (raining && Math.random() < 0.02) tip = 0.2;
  state.rainTotal += tip;
  if (on('reset') && Math.floor(elapsed / RESET_EVERY_MS) > state.resets) {
    state.resets += 1;
    state.rainTotal = tip;
    log(`rain counter RESET (now ${tip.toFixed(1)} mm)`);
  }
  const rainField = on('interval') ? tip : state.rainTotal;
  const intensity = raining ? 12 : 0;

  const dir = Math.round(state.dir) % 360;
  const payload = [
    'Q',
    pad(dir, 3, 0),
    pad(speed, 6, 2),
    pad(dir, 3, 0),
    pad(speed, 6, 2),
    pad(temp, 5, 1, true),
    pad(rh, 3, 0),
    pad(state.pressure, 6, 1),
    pad(rainField, 9, 3),
    pad(intensity, 7, 3),
    '0000',
    '',
  ].join(',');

  state.sent += 1;
  const cs = on('badsum') && state.sent % 30 === 0 ? '00' : checksum(payload);
  return `${STX}${payload}${ETX}${cs}\r\n`;
}

// ── The connection ────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`${new Date().toISOString()}  ${msg}`);
}

let socket = null;
let timer = null;
let connectedAt = 0;

function send(line) {
  if (!socket || socket.destroyed) return;
  if (!on('split')) {
    socket.write(line);
    return;
  }
  // Two or three pieces, with a gap — what a slow link or a busy converter does.
  const cut1 = 1 + Math.floor(Math.random() * (line.length - 2));
  const cut2 = Math.random() < 0.5 ? cut1 : cut1 + Math.floor(Math.random() * (line.length - cut1 - 1));
  const pieces = [line.slice(0, cut1), line.slice(cut1, cut2), line.slice(cut2)].filter(Boolean);
  pieces.forEach((p, i) => setTimeout(() => socket && !socket.destroyed && socket.write(p), i * 30));
}

function connect() {
  log(`connecting to ${HOST}:${PORT} — scenarios: ${[...scenarios].join(', ')}`);
  socket = net.connect({ host: HOST, port: PORT });
  socket.setNoDelay(true);

  socket.on('connect', () => {
    connectedAt = Date.now();
    log('connected');
    if (!on('noheader')) {
      socket.write(`${HEADER}\r\n`);
      socket.write(`${UNITS}\r\n`);
    }
    timer = setInterval(() => {
      if (state.sent >= COUNT) {
        log(`sent ${COUNT} readings — done`);
        socket.end();
        clearInterval(timer);
        process.exit(0);
      }
      send(reading(Date.now()));
      if (state.sent % 60 === 0) log(`${state.sent} readings sent (rain counter ${state.rainTotal.toFixed(1)} mm)`);
      if (on('drop') && Date.now() - connectedAt > 180_000) {
        log('dropping the connection for 10 s');
        socket.destroy();
      }
    }, INTERVAL_MS);
  });

  socket.on('error', (err) => log(`connection error: ${err.message}`));
  socket.on('close', () => {
    clearInterval(timer);
    const wait = on('drop') ? 10_000 : 3_000;
    log(`disconnected — retrying in ${wait / 1000} s`);
    setTimeout(connect, wait);
  });
}

process.on('SIGINT', () => {
  log('stopped');
  process.exit(0);
});

connect();
