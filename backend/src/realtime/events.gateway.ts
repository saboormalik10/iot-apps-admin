import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken, JWTPayload } from '../utils/jwt';
import {
  DomainEvent,
  ClientEvent,
  roomForOrg,
  roomForDevice,
  roomForUser,
  MetMeasuresEvent,
  NepSampleEvent,
  NepSessionCreatedEvent,
  DeviceStatusEvent,
  NotificationEvent,
} from './realtime.events';

/**
 * Real-time gateway.
 *
 * Path: `/v1/ws`. Authenticate by passing the JWT access token as a connection
 * query param or auth field: `io(host, { path: '/v1/ws', query: { token } })`.
 * An invalid/expired token is rejected and the socket disconnected.
 *
 * Clients auto-join their org room (org-wide device:status events) and can
 * `subscribe:device` to receive per-device sensor pushes.
 */
@WebSocketGateway({ path: '/v1/ws', cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket): void {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.query?.token as string | undefined);
    if (!token) {
      client.emit('unauthorized', { code: 4001, message: 'Missing access token' });
      client.disconnect(true);
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      client.data.user = payload;
      client.join(roomForOrg(payload.organizationId));
      // Per-user room so targeted notifications (AlertRule.notifyUserIds) reach the right people.
      if (payload.userId) client.join(roomForUser(payload.userId));
    } catch {
      client.emit('unauthorized', { code: 4001, message: 'Invalid or expired access token' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe:device')
  onSubscribeDevice(@MessageBody() body: { deviceId: string }, @ConnectedSocket() client: Socket): { subscribed: string } {
    client.join(roomForDevice(body.deviceId));
    return { subscribed: body.deviceId };
  }

  @SubscribeMessage('unsubscribe:device')
  onUnsubscribeDevice(@MessageBody() body: { deviceId: string }, @ConnectedSocket() client: Socket): { unsubscribed: string } {
    client.leave(roomForDevice(body.deviceId));
    return { unsubscribed: body.deviceId };
  }

  @SubscribeMessage('ping')
  onPing(): { pong: number } {
    return { pong: Date.now() };
  }

  // ── Domain-event listeners → broadcast to rooms ───────────────────────────

  @OnEvent(DomainEvent.MET_MEASURES)
  onMetMeasures(e: MetMeasuresEvent): void {
    // A backfill carries real data but stale timestamps. Broadcasting it as
    // `met:latest` would make the live gauge jump backwards to a reading from
    // hours ago. The wind rose still refreshes, because the distribution over
    // the window genuinely did change.
    if (!e.isBackfill) {
      this.server.to(roomForDevice(e.deviceId)).emit(ClientEvent.MET_LATEST, e.latest);
    }
    this.server.to(roomForDevice(e.deviceId)).emit(ClientEvent.MET_WINDROSE, { recordId: e.recordId, refresh: true });
  }

  @OnEvent(DomainEvent.NEP_SAMPLE)
  onNepSample(e: NepSampleEvent): void {
    this.server.to(roomForDevice(e.deviceId)).emit(ClientEvent.NEP_SAMPLE, { sessionId: e.sessionId, ...e.sample });
  }

  @OnEvent(DomainEvent.NEP_SESSION_CREATED)
  onNepSessionCreated(e: NepSessionCreatedEvent): void {
    this.server
      .to(roomForDevice(e.deviceId))
      .emit(ClientEvent.NEP_SESSION_CREATED, { id: e.sessionId, deviceId: e.deviceId, startTimestamp: e.startTimestamp, probeRange: e.probeRange });
  }

  @OnEvent(DomainEvent.DEVICE_STATUS)
  onDeviceStatus(e: DeviceStatusEvent): void {
    const payload = {
      deviceId: e.deviceId,
      deviceName: e.deviceName,
      isOnline: e.isOnline,
      lastSeenAt: e.lastSeenAt,
      batteryPct: e.batteryPct,
    };
    this.server.to(roomForOrg(e.organizationId)).emit(ClientEvent.DEVICE_STATUS, payload);
    if (e.justConnected) {
      this.server.to(roomForOrg(e.organizationId)).emit(ClientEvent.DEVICE_CONNECTED, { deviceId: e.deviceId, deviceName: e.deviceName });
    }
  }

  // ── Month 6: notification feed push (alerts / session-complete / firmware) ──

  @OnEvent(DomainEvent.NOTIFICATION)
  onNotification(e: NotificationEvent): void {
    const rooms = e.userIds.length
      ? e.userIds.map((uid) => roomForUser(uid))
      : [roomForOrg(e.organizationId)];
    for (const room of rooms) {
      this.server.to(room).emit(ClientEvent.NOTIFICATION, e.notification);
      // Alerts also get the dedicated legacy channel for existing dashboard listeners.
      if (e.notification.type === 'alert') {
        this.server.to(room).emit(ClientEvent.ALERT_TRIGGERED, e.notification.data);
      }
    }
  }
}

// Re-export so other modules can reference the typed payload without a cycle.
export type { JWTPayload };
