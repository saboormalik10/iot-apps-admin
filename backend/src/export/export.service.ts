import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Response } from 'express';
import archiver from 'archiver';
import { Device } from '../models/Device';
import { brandedFilename, exportLabel } from '../utils/export-branding.util';
import { NepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';
import { NepFile } from '../models/NepFile';
import { AuditLog } from '../models/AuditLog';

// Same header as analytics.service exportNepBulk so export↔import round-trips.
const CSV_HEADER = 'SessionId,Timestamp,Turbidity_NTU,Temperature_C,ProbeRange,Lat,Lng,Battery_%';

@Injectable()
export class ExportService {
  async streamSessionsZip(
    organizationId: string,
    deviceId: string,
    from: string | undefined,
    to: string | undefined,
    res: Response,
    actor: { userId: string; email: string },
  ): Promise<void> {
    if (!deviceId || !Types.ObjectId.isValid(deviceId)) {
      throw Object.assign(new Error('A valid deviceId is required'), { statusCode: 400, code: 'VALIDATION_ERROR' });
    }
    const orgId = new Types.ObjectId(organizationId);
    const device = await Device.findOne({ _id: new Types.ObjectId(deviceId), organizationId: orgId, deletedAt: null }).lean();
    if (!device) throw Object.assign(new Error('Device not found'), { statusCode: 404, code: 'NOT_FOUND' });

    const sessQuery: Record<string, unknown> = { deviceId: new Types.ObjectId(deviceId), organizationId: orgId, deletedAt: null };
    const range: Record<string, number> = {};
    if (from) range.$gte = Number(from);
    if (to) range.$lte = Number(to);
    if (Object.keys(range).length) sessQuery.startTimestamp = range;

    const sessions = await NepSession.find(sessQuery).sort({ startTimestamp: 1 }).lean();

    res.setHeader('Content-Type', 'application/zip');
    const label = await exportLabel(String(device.organizationId));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${brandedFilename(label, `sessions-${device.name}-${Date.now()}`, 'zip')}"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => res.destroy(err));
    archive.pipe(res);

    const manifest: Array<Record<string, unknown>> = [];
    for (const s of sessions) {
      const samples = await NepSample.find({ sessionId: s.id }).sort({ timestamp: 1 }).lean();
      const lines = [CSV_HEADER];
      for (const smp of samples) {
        lines.push(
          [
            s.id,
            smp.timestamp,
            smp.turbidityValue ?? '',
            smp.temperatureValue ?? '',
            smp.probeRange ?? '',
            smp.locationLat ?? '',
            smp.locationLng ?? '',
            smp.batteryLevel ?? '',
          ].join(','),
        );
      }
      archive.append(lines.join('\n'), { name: `sessions/${s.id}.csv` });

      const photos = await NepFile.find({
        sessionId: s.id,
        organizationId: orgId,
        fileType: { $in: ['photo', 'map'] },
      })
        .select('url filename fileType')
        .lean();

      manifest.push({
        sessionId: s.id,
        deviceName: s.deviceName,
        startTimestamp: s.startTimestamp,
        endTimestamp: s.endTimestamp,
        sampleCount: s.sampleCount,
        photos: photos.filter((p) => p.url).map((p) => ({ url: p.url, filename: p.filename, type: p.fileType })),
      });
    }

    archive.append(
      JSON.stringify(
        {
          device: { id: deviceId, name: device.name, type: device.type },
          exportedAt: new Date().toISOString(),
          sessionCount: sessions.length,
          sessions: manifest,
        },
        null,
        2,
      ),
      { name: 'manifest.json' },
    );

    AuditLog.create({
      organizationId: orgId,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'export',
      resourceType: 'session',
      resourceId: deviceId,
      resourceName: `ZIP export (${sessions.length} session(s))`,
      changes: null,
    }).catch(() => void 0);

    await archive.finalize();
  }
}
