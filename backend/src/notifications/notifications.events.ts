import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { FirmwareTarget } from '../models/FirmwareTarget';
import { Device } from '../models/Device';
import { Notification } from '../models/Notification';
import {
  DomainEvent,
  NepSessionCompletedEvent,
  DeviceFirmwareReportedEvent,
} from '../realtime/realtime.events';
import { isOutdated, compareVersions } from '../utils/semver.util';
import { NotificationsService } from './notifications.service';

const FIRMWARE_DEDUP_MS = 24 * 60 * 60 * 1000;

/**
 * Turns ingest-side domain events (emitted by sync.service, decoupled) into
 * notifications via the central NotificationsService seam.
 */
@Injectable()
export class NotificationsEventsService {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(DomainEvent.NEP_SESSION_COMPLETED)
  async onSessionCompleted(e: NepSessionCompletedEvent): Promise<void> {
    await this.notifications.notify(e.organizationId, null, {
      type: 'session_complete',
      title: 'Logging session complete',
      body: `${e.deviceName} finished a session with ${e.sampleCount} sample(s).`,
      data: { sessionId: e.sessionId, deviceId: e.deviceId, sampleCount: e.sampleCount },
    });
  }

  @OnEvent(DomainEvent.DEVICE_FIRMWARE_REPORTED)
  async onFirmwareReported(e: DeviceFirmwareReportedEvent): Promise<void> {
    const target = await this.resolveTarget(e.organizationId, e.deviceType);
    if (!target || !isOutdated(e.firmwareVersion, target)) return;

    // Dedup: heartbeats fire ~every 60s — don't re-notify the same device+version within 24h.
    const recent = await Notification.findOne({
      organizationId: new Types.ObjectId(e.organizationId),
      type: 'firmware',
      'data.deviceId': e.deviceId,
      'data.current': e.firmwareVersion,
      createdAt: { $gte: new Date(Date.now() - FIRMWARE_DEDUP_MS) },
    }).lean();
    if (recent) return;

    await this.notifications.notify(e.organizationId, null, {
      type: 'firmware',
      title: 'Device firmware out of date',
      body: `${e.deviceName} is on ${e.firmwareVersion}; latest is ${target}.`,
      data: { deviceId: e.deviceId, current: e.firmwareVersion, target },
    });
  }

  /** Configured per-org target, else the max version seen across org devices of that type. */
  private async resolveTarget(
    organizationId: string,
    deviceType: 'MET-LINK' | 'NEP-LINK',
  ): Promise<string | null> {
    const configured = await FirmwareTarget.findOne({
      organizationId: new Types.ObjectId(organizationId),
      deviceType,
    }).lean();
    if (configured?.version) return configured.version;

    const devices = await Device.find({
      organizationId: new Types.ObjectId(organizationId),
      type: deviceType,
      deletedAt: null,
    })
      .select('firmwareVersion')
      .lean();
    let max: string | null = null;
    for (const d of devices) {
      const v = (d as { firmwareVersion?: string | null }).firmwareVersion;
      if (v && (max === null || compareVersions(v, max) > 0)) max = v;
    }
    return max;
  }
}
