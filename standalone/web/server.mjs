#!/usr/bin/env node
/**
 * The portal's web server: Next.js, plus the live-update socket on the SAME address.
 *
 * WHY NOT `next start`
 * The browser's live socket (the wind dial, alerts, the one-minute refresh) is
 * served by the API, not by Next. Pointed straight at the API, the browser needs
 * the API's own address — and a build-time `ws://localhost:3200` only works in a
 * browser ON the site PC: from anyone else's PC "localhost" is their own machine.
 * The alternative, opening the API itself to the whole site network, is worse.
 *
 * So this server takes the socket's upgrade on `/v1/ws` and passes it to the API
 * on this PC. People on the network use ONE address — http://<pc>:3201 — for
 * everything, and the API stays reachable from this PC only.
 *
 *   node server.mjs          production (after `next build`)
 *   node server.mjs --dev    development, with hot reload
 *
 * Settings, from .env.local / the environment — or, on an installed site PC, from
 * the ONE settings file the API also reads (OBSERVATOR_CONFIG=<path>):
 *   WEB_PORT     web port, default 3201 (PORT too, outside the shared file — there
 *                PORT is the API's)
 *   WEB_HOST     address to listen on, default 0.0.0.0 (the whole site network).
 *                Not HOSTNAME: shells set that to the machine's own name.
 *   BACKEND_URL  the API, e.g. http://127.0.0.1:3200/v1 — the socket goes to its origin
 *   WEB_TLS_CERT, WEB_TLS_KEY   optional: serve https:// instead of http://
 *
 * HTTPS is optional because a site network usually has no certificate authority,
 * and a self-signed certificate warns every visitor. Without it the sign-in cookie
 * crosses the site network in the clear — acceptable on a private wired network,
 * not on a shared or wireless one. Where the site HAS a certificate (its own CA,
 * or one issued for the PC's name), point these two at the certificate and its
 * private key and set SESSION_COOKIE_SECURE=true.
 */
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import nextEnv from '@next/env';

/**
 * The site PC's settings file (installer: <data>\config\observator.env), shared
 * with the API so a technician edits one file. KEY=VALUE lines; # comments; an
 * optional pair of surrounding quotes. The service's own environment wins.
 */
function loadSharedConfig(path) {
  if (!path) return false;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
  return true;
}

const shared = loadSharedConfig(process.env.OBSERVATOR_CONFIG);
const dev = process.argv.includes('--dev');
process.env.NODE_ENV ??= dev ? 'development' : 'production';
nextEnv.loadEnvConfig(process.cwd(), dev);

// In the shared file PORT is the API's; the portal's is WEB_PORT.
const PORT = Number(process.env.WEB_PORT || (shared ? '' : process.env.PORT)) || 3201;
const HOSTNAME = process.env.WEB_HOST || '0.0.0.0';
const api = new URL(process.env.BACKEND_URL || 'http://127.0.0.1:3200/v1');
const API_HOST = api.hostname;
const API_PORT = Number(api.port) || (api.protocol === 'https:' ? 443 : 80);
const SOCKET_PATH = '/v1/ws';

// Imported after NODE_ENV is settled: Next reads it at load.
const { default: next } = await import('next');
const app = next({ dev, hostname: HOSTNAME, port: PORT });
const handle = app.getRequestHandler();
await app.prepare();
const nextUpgrade = app.getUpgradeHandler();

/**
 * Hand a WebSocket upgrade to the API, byte for byte.
 *
 * The request line and headers are replayed to the API as received; after the
 * API answers `101 Switching Protocols` both sides are just a pipe. The API
 * authenticates the socket itself — with the short-lived ticket the browser gets
 * from this app — so nothing here needs to understand the traffic.
 */
function proxySocket(req, client, head) {
  const upstream = net.connect(API_PORT, API_HOST, () => {
    let request = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      // The browser's own X-Forwarded-For is never passed on — see stampClientIp.
      if (req.rawHeaders[i].toLowerCase() === 'x-forwarded-for') continue;
      request += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    request += `X-Forwarded-For: ${clientIp(req)}\r\n`;
    upstream.write(`${request}\r\n`);
    if (head?.length) upstream.write(head);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  const close = () => {
    upstream.destroy();
    client.destroy();
  };
  upstream.on('error', close);
  client.on('error', close);
  upstream.on('close', () => client.destroy());
  client.on('close', () => upstream.destroy());
}

/** The address of the PC that sent the request, IPv4 written plainly. */
function clientIp(req) {
  return (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
}

/**
 * Say who is asking. The API sees every request come from this app, on this PC,
 * so without this every user on the site shared one sign-in rate limit (10 a
 * minute — any PC on the network could lock everyone out) and the audit log
 * recorded 127.0.0.1 for everybody. Set here, OVERWRITING whatever the browser
 * sent, so it cannot be forged; the portal's API calls pass it on, and the API
 * trusts exactly one hop (TRUST_PROXY).
 */
function stampClientIp(req) {
  req.headers['x-forwarded-for'] = clientIp(req);
}

const tlsCert = process.env.WEB_TLS_CERT;
const tlsKey = process.env.WEB_TLS_KEY;
const onRequest = (req, res) => {
  stampClientIp(req);
  handle(req, res);
};
const server = tlsCert && tlsKey
  ? createSecureServer({ cert: readFileSync(tlsCert), key: readFileSync(tlsKey) }, onRequest)
  : createServer(onRequest);
server.on('upgrade', (req, socket, head) => {
  if (req.url === SOCKET_PATH || req.url?.startsWith(`${SOCKET_PATH}/`) || req.url?.startsWith(`${SOCKET_PATH}?`)) {
    proxySocket(req, socket, head);
  } else {
    // Next's own upgrades — hot reload in development.
    nextUpgrade(req, socket, head);
  }
});
server.listen(PORT, HOSTNAME, () => {
  const scheme = tlsCert && tlsKey ? 'https' : 'http';
  console.log(`portal on ${scheme}://${HOSTNAME}:${PORT} (${dev ? 'development' : 'production'}); live socket → ${API_HOST}:${API_PORT}`);
});
