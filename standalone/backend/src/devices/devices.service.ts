import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { Device, IDevice } from '../models/Device';
import { AuditLog } from '../models/AuditLog';
import { clearDashboardCache } from '../dashboard/dashboard.service';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { roundBearing } from '../common/bearing';

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

function computeIsOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < ONLINE_THRESHOLD_MS;
}

export interface ListDevicesOptions {
  organizationId: string;
  type?: 'MET-LINK' | 'NEP-LINK';
  bleId?: string;
  page?: number;
  limit?: number;
  /** true → demo devices ONLY; false/undefined → real devices only. */
}

export interface ListDevicesResult {
  data: Record<string, unknown>[];
  meta: { page: number; limit: number; total: number; pages: number };
}

@Injectable()
export class DevicesService {

  async listDevices(opts: ListDevicesOptions): Promise<ListDevicesResult> {
    const { organizationId, type, bleId, page = 1, limit = 20 } = opts;
    const orgId = new Types.ObjectId(organizationId);
    const query: Record<string, unknown> = {
      organizationId: orgId,
      deletedAt: null,
      // A demo device is a device — the list has to honour the mode too, or the
      // toggle would be visible but inert on /devices.
    };
    if (type) query.type = type;
    if (bleId) query.bleId = bleId;

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

  async getDevice(organizationId: string, deviceId: string): Promise<IDevice> {
    // A malformed id is simply a device that does not exist. Left to reach
    // `new Types.ObjectId`, it threw and answered 500.
    if (!Types.ObjectId.isValid(deviceId)) {
      throw Object.assign(new Error('Device not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
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
    body: {
      name?: string;
      customName?: string;
      serialNo?: string | null;
      firmwareVersion?: string | null;
      storeRawSamples?: boolean;
      rainDayStartHour?: number;
      headingOffsetDeg?: number;
    },
    actor: { userId: string; email: string; ipAddress?: string | null },
  ): Promise<IDevice> {
    const device = await this.getDevice(organizationId, deviceId);
    if (
      body.rainDayStartHour !== undefined &&
      !(Number.isInteger(body.rainDayStartHour) && body.rainDayStartHour >= 0 && body.rainDayStartHour <= 23)
    ) {
      throw Object.assign(new Error('rainDayStartHour must be a whole hour from 0 to 23'), {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const before = {
      name: device.name,
      customName: device.customName,
      serialNo: device.serialNo,
      firmwareVersion: device.firmwareVersion,
      storeRawSamples: device.storeRawSamples,
      rainDayStartHour: device.rainDayStartHour,
      headingOffsetDeg: device.headingOffsetDeg,
    };

    if (body.name !== undefined) device.name = body.name;
    if (body.customName !== undefined) device.customName = body.customName;
    if (body.serialNo !== undefined) device.serialNo = body.serialNo;
    if (body.firmwareVersion !== undefined) device.firmwareVersion = body.firmwareVersion;
    if (body.storeRawSamples !== undefined) device.storeRawSamples = body.storeRawSamples;
    if (body.rainDayStartHour !== undefined) device.rainDayStartHour = body.rainDayStartHour;
    if (body.headingOffsetDeg !== undefined) {
      if (typeof body.headingOffsetDeg !== 'number' || !Number.isFinite(body.headingOffsetDeg) || Math.abs(body.headingOffsetDeg) > 360) {
        throw Object.assign(new Error('headingOffsetDeg must be a number of degrees from -360 to 360'), {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }
      // One spelling per direction: 0–359.9. The stream picks it up within a minute.
      device.headingOffsetDeg = roundBearing(body.headingOffsetDeg, 1);
    }

    await device.save();
    clearDashboardCache(String(device.organizationId));

    AuditLog.create({
      organizationId: device.organizationId,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      ipAddress: actor.ipAddress ?? null,
      action: 'update',
      resourceType: 'device',
      resourceId: (device._id as unknown as string).toString(),
      resourceName: device.name,
      changes: { before, after: body },
    }).catch(() => void 0);

    return device;
  }

  /**
   * Health facts the ingestion pipeline actually produces (M25).
   *
   * Dropped from this response: `batteryPct`, `batteryCharging`, `firmwareVersion`,
   * `firmwareAgeDays` and the placeholder `alertCount24h`. The first four are
   * written ONLY by the mobile BLE heartbeat (`PATCH /sync/device-status`) and by
   * the FirmwareHistory rows that same heartbeat creates — nothing in the SFTP/CSV
   * ingestion path touches any of them, so for an ingest-fed station they were
   * null forever and the detail page rendered a wall of "–". `alertCount24h` was a
   * hardcoded 0 waiting on work that landed elsewhere. Serving a null is not
   * neutral: the UI cannot tell "not measured" from "measured as nothing", so the
   * honest answer is to not carry the field.
   */
  async getDeviceHealth(organizationId: string, deviceId: string) {
    const device = await this.getDevice(organizationId, deviceId);
    const now = Date.now();

    const lastSeenMs = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : null;

    return {
      deviceId,
      isOnline: lastSeenMs ? now - lastSeenMs < ONLINE_THRESHOLD_MS : false,
      lastSeenAt: device.lastSeenAt,
      batteryVoltage: await this.latestBatteryVoltage(device),
      lastSyncAt: device.lastSeenAt,
      lastSyncLagSeconds: lastSeenMs ? Math.round((now - lastSeenMs) / 1000) : null,
    };
  }

  /**
   * Battery voltage as ingestion reports it.
   *
   * `Device.lastBatteryVoltage` comes from the BLE heartbeat and stays null on an
   * SFTP station. The reading is in the CSV, though — it lands on
   * `MetMeasure.batteryVoltageV`, which the dashboard live tile already reads. So
   * for MET-LINK take the most recent row that carries one, and fall back to the
   * heartbeat field for BLE devices.
   *
   * Filtering on `$ne: null` rather than reading the single newest row matters:
   * battery voltage is an optional column, so the latest row often has none while
   * a row minutes earlier does. Both queries ride existing indexes
   * (`{deviceId, dateStartMs}` and `{recordId, rowType, timestampMs}`).
   */
  private async latestBatteryVoltage(device: IDevice): Promise<number | null> {
    if (device.type !== 'MET-LINK') return device.lastBatteryVoltage;

    const latestRecord = await MetRecord.findOne({ deviceId: device._id, deletedAt: null })
      .sort({ dateStartMs: -1 })
      .select('_id')
      .lean();
    if (!latestRecord) return device.lastBatteryVoltage;

    const latestMeasure = await MetMeasure.findOne({
      recordId: latestRecord._id,
      rowType: 'data',
      batteryVoltageV: { $ne: null },
    })
      .sort({ timestampMs: -1 })
      .select('batteryVoltageV')
      .lean();

    return latestMeasure?.batteryVoltageV ?? device.lastBatteryVoltage;
  }
}
