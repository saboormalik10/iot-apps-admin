'use client';

import { io, type Socket } from 'socket.io-client';
import { logger } from '@/lib/logger';

/**
 * One shared socket.io client (plan §3.2). The browser connects to THIS page's own
 * address, path `/v1/ws`; the portal's web server (server.mjs) hands the socket to
 * the API on the same PC. So it works from any PC on the site network, with no
 * address baked in at build time. Because a WS ticket lives only ~60s, the `auth`
 * callback fetches a FRESH ticket from the BFF before EVERY connect and reconnect —
 * a reconnect after a long drop must not reuse a stale one.
 */
async function fetchFreshTicket(): Promise<string> {
  const res = await fetch('/api/ws-ticket', {
    method: 'POST',
    headers: { 'x-requested-with': 'fetch' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`ws-ticket ${res.status}`);
  const body = (await res.json()) as { data: { ticket: string } };
  return body.data.ticket;
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io({
    path: '/v1/ws',
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
    // Called on every (re)connection attempt → always a fresh, short-lived ticket.
    auth: (cb: (data: Record<string, unknown>) => void) => {
      fetchFreshTicket()
        .then((ticket) => cb({ token: ticket }))
        .catch((err) => {
          logger.warn('Failed to fetch WS ticket for handshake', { error: String(err) });
          cb({ token: '' }); // gateway will reject → triggers backoff/reconnect
        });
    },
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
