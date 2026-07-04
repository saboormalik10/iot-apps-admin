import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ShareToken, IShareToken } from '../models/ShareToken';
import { NepSession } from '../models/NepSession';
import { NepSampleDownsampled } from '../models/NepSampleDownsampled';
import { NepFile } from '../models/NepFile';
import { MetRecord } from '../models/MetRecord';
import { MetPicture } from '../models/MetPicture';

const NOT_FOUND = () =>
  Object.assign(new Error('Share link not found or expired'), { statusCode: 404, code: 'NOT_FOUND' });

/**
 * Builds the unauthenticated read-only snapshot for a share token. Queries
 * models directly (DashboardModule does not export its service) and reuses the
 * pre-computed session summary + downsampled buckets.
 */
@Injectable()
export class PublicService {
  async getByToken(token: string) {
    const share = await ShareToken.findOne({ token });
    const now = new Date();
    if (!share || share.revokedAt || (share.expiresAt && share.expiresAt < now)) {
      throw NOT_FOUND();
    }
    // Best-effort view counter (never blocks the response).
    ShareToken.updateOne({ _id: share._id }, { $inc: { viewCount: 1 } }).catch(() => void 0);

    return share.resourceType === 'nepSession'
      ? this.nepSnapshot(share)
      : this.metSnapshot(share);
  }

  private async nepSnapshot(share: IShareToken) {
    const session = await NepSession.findOne({
      id: share.resourceId,
      organizationId: share.organizationId,
      deletedAt: null,
    }).lean();
    if (!session) throw NOT_FOUND();

    const [buckets, photos] = await Promise.all([
      NepSampleDownsampled.find({ sessionId: share.resourceId })
        .sort({ bucketStart: 1 })
        .limit(500)
        .lean(),
      NepFile.find({
        sessionId: share.resourceId,
        organizationId: share.organizationId,
        fileType: { $in: ['photo', 'map'] },
      })
        .select('url filename fileType capturedAt')
        .lean(),
    ]);

    return {
      resourceType: 'nepSession',
      sharedAt: share.createdAt,
      expiresAt: share.expiresAt,
      session: {
        id: session.id,
        deviceName: session.deviceName,
        startTimestamp: session.startTimestamp,
        endTimestamp: session.endTimestamp,
        probeRange: session.probeRange,
        sampleCount: session.sampleCount,
        turbidityAvg: session.turbidityAvg,
        turbidityMin: session.turbidityMin,
        turbidityMax: session.turbidityMax,
        temperatureAvg: session.temperatureAvg,
        comment: session.comment,
      },
      trend: buckets.map((b) => ({ t: b.bucketStart, turbidity: b.turbidityAvg, temperature: b.temperatureAvg })),
      photos: photos.filter((p) => p.url).map((p) => ({ url: p.url, filename: p.filename, type: p.fileType })),
    };
  }

  private async metSnapshot(share: IShareToken) {
    if (!Types.ObjectId.isValid(share.resourceId)) throw NOT_FOUND();
    const record = await MetRecord.findOne({
      _id: new Types.ObjectId(share.resourceId),
      organizationId: share.organizationId,
      deletedAt: null,
    }).lean();
    if (!record) throw NOT_FOUND();

    const photos = await MetPicture.find({ recordId: record._id }).select('url filename takenAt').lean();

    return {
      resourceType: 'metRecord',
      sharedAt: share.createdAt,
      expiresAt: share.expiresAt,
      record: {
        id: record._id,
        deviceName: record.deviceName,
        dateStart: record.dateStart,
        dateEnd: record.dateEnd,
        measureCount: record.measureCount,
        comment: record.comment,
      },
      photos: photos.filter((p) => p.url).map((p) => ({ url: p.url, filename: p.filename })),
    };
  }
}
