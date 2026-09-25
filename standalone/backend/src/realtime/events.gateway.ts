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
import { Types } from 'mongoose';
import { Device } from '../models/Device';
import { User } from '../models/User';
import {
  DomainEvent,
  ClientEvent,
  roomForOrg,
  roomForDevice,
  roomForUser,
  MetMeasuresEvent,
  MetLiveEvent,
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
/** How long a device -> organisation mapping is trusted. Ownership never changes. */
const EVENTS_OWNER_CACHE_TTL_MS = 5 * 60_000;

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
      // …and then, without holding up the connection (an async handler here would
      // let the client's first messages race the room joins), check the account is
      // still there and active. A socket outlives the 60-second ticket that opened
      // it, so a suspended or removed user's open page went on receiving readings.
      void this.disconnectIfAccountGone(client, payload);
    } catch {
      client.emit('unauthorized', { code: 4001, message: 'Invalid or expired access token' });
      client.disconnect(true);
    }
  }

  /** Close a socket whose account has been suspended or removed since it opened. */
  private async disconnectIfAccountGone(client: Socket, payload: JWTPayload): Promise<void> {
    try {
      const account = Types.ObjectId.isValid(payload.userId)
        ? await User.findById(payload.userId).select('isActive deletedAt').lean()
        : null;
      if (account && !account.deletedAt && account.isActive) return;
      client.emit('unauthorized', { code: 4003, message: 'This account is no longer active' });
      client.disconnect(true);
    } catch {
      // A database hiccup must not drop a working connection.
    }
  }

  /**
   * Join a device's room, but ONLY if the caller's organisation owns it.
   *
   * Without this check any authenticated socket could join any device room by
   * id and receive that device's live `met:latest` and wind-rose
   * pushes — a cross-tenant leak, since a device id is not a secret (it appears
   * in URLs and in exported files).
   *
   * The organisation match alone is the whole rule, super admins included: a
   * platform administrator who has switched carries the CUSTOMER's id in
   * `organizationId` (see JWTPayload), so they match exactly the customer they
   * are acting as and nothing else. That is the same rule every REST filter
   * applies, which is why there is no super-admin exemption here — an exemption
   * would make the socket MORE permissive than the API it mirrors.
   */
  @SubscribeMessage('subscribe:device')
  async onSubscribeDevice(
    @MessageBody() body: { deviceId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<{ subscribed: string | null; error?: string }> {
    const user = client.data.user as JWTPayload | undefined;
    const deviceId = body?.deviceId;
    if (!user?.organizationId || !deviceId) return { subscribed: null, error: 'FORBIDDEN' };

    const ownerOrgId = await this.ownerOrgOf(deviceId);
    if (ownerOrgId !== user.organizationId) return { subscribed: null, error: 'FORBIDDEN' };

    client.join(roomForDevice(deviceId));
    return { subscribed: deviceId };
  }

  /**
   * Device id -> owning organisation id, memoised.
   *
   * A device never changes owner, so this is safe to cache; the TTL exists only
   * to bound the map for a long-lived process. Without it a client could turn a
   * loop of `subscribe:device` calls into a database query storm, since the
   * handler is reachable by anyone who is merely authenticated.
   */
  private readonly ownerOrgCache = new Map<string, { orgId: string | null; expiresAt: number }>();

  private async ownerOrgOf(deviceId: string): Promise<string | null> {
    const now = Date.now();
    const hit = this.ownerOrgCache.get(deviceId);
    if (hit && hit.expiresAt > now) return hit.orgId;

    // An id that is not a valid ObjectId would throw a CastError; a rejected
    // promise here would surface as an unhandled rejection, not a refusal.
    const device = await Device.findById(deviceId)
      .select('organizationId')
      .lean()
      .catch(() => null);
    const orgId = device ? String(device.organizationId) : null;

    this.ownerOrgCache.set(deviceId, { orgId, expiresAt: now + EVENTS_OWNER_CACHE_TTL_MS });
    return orgId;
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

  /**
   * One reading a second, for the wind dial — only to browsers watching THIS
   * station. The room check comes first so a PC with nobody looking at the
   * dashboard does no work at all per reading.
   */
  @OnEvent(DomainEvent.MET_LIVE)
  onMetLive(e: MetLiveEvent): void {
    const room = roomForDevice(e.deviceId);
    if (!this.server?.sockets.adapter.rooms.get(room)?.size) return;
    this.server.to(room).emit(ClientEvent.MET_LIVE, e.sample);
  }

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
