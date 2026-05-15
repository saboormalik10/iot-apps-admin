import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { Device, IDevice } from '../models/Device';
import { AuditLog } from '../models/AuditLog';
import { NepSession } from '../models/NepSession';

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

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
}
