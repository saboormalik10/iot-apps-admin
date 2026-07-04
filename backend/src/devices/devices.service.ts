import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { Device, IDevice } from '../models/Device';
import { AuditLog } from '../models/AuditLog';
import { NepSession } from '../models/NepSession';
import { DeviceSettings } from '../models/DeviceSettings';
import { FirmwareHistory } from '../models/FirmwareHistory';
import { FirmwareTarget } from '../models/FirmwareTarget';
import { compareVersions, isOutdated } from '../utils/semver.util';

type DeviceType = 'MET-LINK' | 'NEP-LINK';

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

// Fields a client is allowed to patch on DeviceSettings (whitelist).
const SETTINGS_FIELDS = [
  'qqEnabled', 'qqGpsHeight', 'qfeHeightM', 'qnhHeightM', 'dewPointEnabled',
  'windRoseUnit', 'windRosePeriod', 'windRoseOrient', 'graphicalType', 'graphItem',
  'colorScheme', 'pageLayout', 'unitWindSpeed', 'unitPressure', 'unitTemperature',
  'unitAltitude', 'sensorShowPrefs', 'sensorLogPrefs',
] as const;

function computeIsOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < ONLINE_THRESHOLD_MS;
}

export interface ListDevicesOptions {
  organizationId: string;
  type?: 'MET-LINK' | 'NEP-LINK';
  page?: number;
  limit?: number;
}

export interface ListDevicesResult {
  data: Record<string, unknown>[];
  meta: { page: number; limit: number; total: number; pages: number };
}

@Injectable()
export class DevicesService {
  async listDevices(opts: ListDevicesOptions): Promise<ListDevicesResult> {
    const { organizationId, type, page = 1, limit = 20 } = opts;
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      deletedAt: null,
    };
    if (type) query.type = type;

    const [items, total] = await Promise.all([
      Device.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Device.countDocuments(query),
    ]);

    const data = items.map((d) => ({ ...d, isOnline: computeIsOnline(d.lastSeenAt) }));
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async createDevice(
    organizationId: string,
    body: {
      bleId: string;
      name: string;
      type: 'MET-LINK' | 'NEP-LINK';
      serialNo?: string;
      firmwareVersion?: string;
      customName?: string;
    },
    actor: { userId: string; email: string },
  ): Promise<IDevice> {
    const existing = await Device.findOne({
      organizationId: new Types.ObjectId(organizationId),
      bleId: body.bleId,
      deletedAt: null,
    });
    if (existing) {
      throw Object.assign(new Error('A device with this BLE ID already exists in your organization'), {
        statusCode: 409,
        code: 'DEVICE_ALREADY_EXISTS',
      });
    }

    const device = await Device.create({
      organizationId: new Types.ObjectId(organizationId),
      bleId: body.bleId,
      name: body.name,
      type: body.type,
      serialNo: body.serialNo ?? null,
      firmwareVersion: body.firmwareVersion ?? null,
      customName: body.customName ?? null,
    });

    AuditLog.create({
      organizationId: device.organizationId,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'create',
      resourceType: 'device',
      resourceId: (device._id as unknown as string).toString(),
      resourceName: device.name,
      changes: null,
    }).catch(() => void 0);

    return device;
  }

  async getDevice(organizationId: string, deviceId: string): Promise<IDevice> {
    const device = await Device.findOne({
      _id: new Types.ObjectId(deviceId),
      organizationId: new Types.ObjectId(organizationId),
      deletedAt: null,
    });
    if (!device) {
      throw Object.assign(new Error('Device not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    return device;
  }

  async updateDevice(
    organizationId: string,
    deviceId: string,
    body: { name?: string; customName?: string; serialNo?: string; firmwareVersion?: string },
    actor: { userId: string; email: string },
  ): Promise<IDevice> {
    const device = await this.getDevice(organizationId, deviceId);

    const before = {
      name: device.name,
      customName: device.customName,
      serialNo: device.serialNo,
      firmwareVersion: device.firmwareVersion,
    };

    if (body.name !== undefined) device.name = body.name;
    if (body.customName !== undefined) device.customName = body.customName;
    if (body.serialNo !== undefined) device.serialNo = body.serialNo;
    if (body.firmwareVersion !== undefined) device.firmwareVersion = body.firmwareVersion;

    await device.save();

    AuditLog.create({
      organizationId: device.organizationId,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'update',
      resourceType: 'device',
      resourceId: (device._id as unknown as string).toString(),
      resourceName: device.name,
      changes: { before, after: body },
    }).catch(() => void 0);

    return device;
  }

  async deleteDevice(
    organizationId: string,
    deviceId: string,
    actor: { userId: string; email: string },
  ): Promise<void> {
    const device = await this.getDevice(organizationId, deviceId);
    device.deletedAt = new Date();
    await device.save();

    AuditLog.create({
      organizationId: device.organizationId,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'delete',
      resourceType: 'device',
      resourceId: (device._id as unknown as string).toString(),
      resourceName: device.name,
      changes: null,
    }).catch(() => void 0);
  }

  async getDeviceStats(organizationId: string, deviceId: string) {
    await this.getDevice(organizationId, deviceId);

    const [sessionCount, lastSession] = await Promise.all([
      NepSession.countDocuments({ deviceId: new Types.ObjectId(deviceId), deletedAt: null }),
      NepSession.findOne({ deviceId: new Types.ObjectId(deviceId), deletedAt: null })
        .sort({ startTimestamp: -1 })
        .select('startTimestamp deviceName')
        .lean(),
    ]);

    return {
      sessionCount,
      lastActivityAt: lastSession ? new Date(lastSession.startTimestamp) : null,
    };
  }

  // ── GET /devices/:id/health ───────────────────────────────────────────────

  async getDeviceHealth(organizationId: string, deviceId: string) {
    const device = await this.getDevice(organizationId, deviceId);
    const now = Date.now();

    const latestFw = await FirmwareHistory.findOne({ deviceId: device._id })
      .sort({ detectedAt: -1 })
      .select('detectedAt')
      .lean();

    const lastSeenMs = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : null;

    return {
      deviceId,
      isOnline: lastSeenMs ? now - lastSeenMs < ONLINE_THRESHOLD_MS : false,
      lastSeenAt: device.lastSeenAt,
      batteryPct: device.lastBatteryPct,
      batteryVoltage: device.lastBatteryVoltage,
      batteryCharging: device.lastBatteryCharging,
      firmwareVersion: device.firmwareVersion,
      firmwareAgeDays: latestFw ? Math.round(((now - new Date(latestFw.detectedAt).getTime()) / 86_400_000) * 10) / 10 : null,
      lastSyncAt: device.lastSeenAt,
      lastSyncLagSeconds: lastSeenMs ? Math.round((now - lastSeenMs) / 1000) : null,
      alertCount24h: 0, // populated once alert evaluation ships (Month 6)
    };
  }

  // ── Firmware version tracking (Month 6) ───────────────────────────────────

  async setFirmwareTarget(
    organizationId: string,
    body: { deviceType: DeviceType; version: string },
    actor: { userId: string; email: string },
  ) {
    const target = await FirmwareTarget.findOneAndUpdate(
      { organizationId: new Types.ObjectId(organizationId), deviceType: body.deviceType },
      { $set: { version: body.version, updatedBy: new Types.ObjectId(actor.userId) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'update',
      resourceType: 'settings',
      resourceId: (target._id as unknown as string).toString(),
      resourceName: `firmware target ${body.deviceType}`,
      changes: { after: { deviceType: body.deviceType, version: body.version } },
    }).catch(() => void 0);

    return target;
  }

  async listFirmwareTargets(organizationId: string) {
    return FirmwareTarget.find({ organizationId: new Types.ObjectId(organizationId) })
      .select('deviceType version updatedAt')
      .lean();
  }

  /** Per-device firmware status: configured target (else max-seen) + `outdated` flag. */
  async getFirmwareStatus(organizationId: string, type?: DeviceType) {
    const orgId = new Types.ObjectId(organizationId);
    const deviceFilter: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
    if (type) deviceFilter.type = type;

    const [devices, targets] = await Promise.all([
      Device.find(deviceFilter).select('name customName type firmwareVersion lastSeenAt').lean(),
      FirmwareTarget.find({ organizationId: orgId }).lean(),
    ]);

    const targetByType = new Map<string, string>();
    for (const t of targets) targetByType.set(t.deviceType, t.version);

    // Fallback per type: max firmware seen across the org's devices of that type.
    const maxByType = new Map<string, string>();
    for (const d of devices) {
      const v = d.firmwareVersion;
      if (!v) continue;
      const cur = maxByType.get(d.type);
      if (!cur || compareVersions(v, cur) > 0) maxByType.set(d.type, v);
    }

    const items = devices.map((d) => {
      const target = targetByType.get(d.type) ?? maxByType.get(d.type) ?? null;
      return {
        deviceId: (d._id as unknown as string).toString(),
        name: d.customName ?? d.name,
        type: d.type,
        firmwareVersion: d.firmwareVersion ?? null,
        target,
        targetSource: targetByType.has(d.type) ? 'configured' : 'max-seen',
        outdated: isOutdated(d.firmwareVersion, target),
      };
    });

    return { data: items, meta: { total: items.length, outdated: items.filter((i) => i.outdated).length } };
  }

  // ── GET /devices/:id/firmware-history ─────────────────────────────────────

  async getFirmwareHistory(organizationId: string, deviceId: string) {
    const device = await this.getDevice(organizationId, deviceId);
    const history = await FirmwareHistory.find({ deviceId: device._id })
      .sort({ detectedAt: -1 })
      .lean();
    return { deviceId, history };
  }

  // ── GET /devices/:id/settings ─────────────────────────────────────────────

  async getDeviceSettings(organizationId: string, deviceId: string) {
    const device = await this.getDevice(organizationId, deviceId);
    let settings = await DeviceSettings.findOne({ deviceId: device._id });
    if (!settings) {
      settings = await DeviceSettings.create({
        deviceId: device._id,
        organizationId: device.organizationId,
      });
    }
    return settings;
  }

  // ── PATCH /devices/:id/settings ───────────────────────────────────────────

  async updateDeviceSettings(
    organizationId: string,
    deviceId: string,
    body: Record<string, unknown>,
    actor: { userId: string; email: string },
  ) {
    const device = await this.getDevice(organizationId, deviceId);
    const update: Record<string, unknown> = {};
    for (const f of SETTINGS_FIELDS) {
      if (body[f] !== undefined) update[f] = body[f];
    }

    const settings = await DeviceSettings.findOneAndUpdate(
      { deviceId: device._id },
      { $set: update, $setOnInsert: { deviceId: device._id, organizationId: device.organizationId } },
      { upsert: true, new: true },
    );

    AuditLog.create({
      organizationId: device.organizationId,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'update',
      resourceType: 'settings',
      resourceId: (device._id as unknown as string).toString(),
      resourceName: device.name + ' settings',
      changes: { after: update },
    }).catch(() => void 0);

    return settings;
  }
}
