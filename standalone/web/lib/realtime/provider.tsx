'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from './socket';
import { logger } from '@/lib/logger';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

interface SocketValue {
  socket: Socket | null;
  status: ConnectionStatus;
}

const SocketContext = createContext<SocketValue>({ socket: null, status: 'offline' });

/**
 * Mounted only inside the authenticated (dash) shell — never on the auth pages,
 * so we never open a socket without a session. Tracks connection status for the
 * LiveIndicator and exposes the shared socket via context.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('reconnecting');
    const onReconnectAttempt = () => setStatus('reconnecting');
    const onConnectError = () => setStatus('reconnecting');
    const onReconnectFailed = () => {
      setStatus('offline');
      logger.warn('Socket reconnection failed');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_failed', onReconnectFailed);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_failed', onReconnectFailed);
      disconnectSocket();
    };
  }, []);

  const value = useMemo<SocketValue>(() => ({ socket: socketRef.current, status }), [status]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): Socket | null {
  return useContext(SocketContext).socket;
}

export function useConnectionStatus(): ConnectionStatus {
  return useContext(SocketContext).status;
}
