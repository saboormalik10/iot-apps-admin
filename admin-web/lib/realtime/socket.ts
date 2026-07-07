'use client';

import { io, type Socket } from 'socket.io-client';
import { publicEnv } from '@/lib/config/public-env';
import { logger } from '@/lib/logger';

/**
 * One shared socket.io client (plan §3.2). The browser connects DIRECTLY to the
 * backend gateway at `${NEXT_PUBLIC_BACKEND_WS_URL}` + path `/v1/ws` (the gateway
 * is `cors:{origin:'*'}`, so no CORS change needed). Because a WS ticket lives
 * only ~60s, the `auth` callback fetches a FRESH ticket from the BFF before EVERY
 * connect and reconnect — a reconnect after a long drop must not reuse a stale one.
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
  socket = io(publicEnv.wsUrl, {
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
