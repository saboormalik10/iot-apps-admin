'use client';

import { useEffect, useRef } from 'react';
import { useSocket } from './provider';
import type { ClientEventName } from './events';

/**
 * Subscribe to a socket event with a ref-stable handler so re-renders don't churn
 * listeners. Re-binds only when the socket or event name changes.
 */
export function useSocketEvent<T = unknown>(event: ClientEventName, handler: (payload: T) => void): void {
  const socket = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener as (...args: unknown[]) => void);
    return () => {
      socket.off(event, listener as (...args: unknown[]) => void);
    };
  }, [socket, event]);
}

/**
 * subscribe:device / unsubscribe:device with automatic re-subscribe on reconnect
 * (rooms are lost across a socket reconnect).
 */
export function useDeviceSubscription(deviceId?: string): void {
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !deviceId) return;
    const subscribe = () => socket.emit('subscribe:device', { deviceId });
    if (socket.connected) subscribe();
    socket.on('connect', subscribe);
    return () => {
      socket.off('connect', subscribe);
      if (socket.connected) socket.emit('unsubscribe:device', { deviceId });
    };
  }, [socket, deviceId]);
}

/** Fires `onReconnect` after a drop → the "refetch is truth" rule (plan §3.2). */
export function useOnReconnect(onReconnect: () => void): void {
  const socket = useSocket();
  const cbRef = useRef(onReconnect);
  cbRef.current = onReconnect;

  useEffect(() => {
    if (!socket) return;
    const handler = () => cbRef.current();
    socket.io.on('reconnect', handler);
    return () => {
      socket.io.off('reconnect', handler);
    };
  }, [socket]);
}
