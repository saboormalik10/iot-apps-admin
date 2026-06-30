import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { NepFile } from '../models/NepFile';
import { MetPicture } from '../models/MetPicture';
import { NepSession } from '../models/NepSession';
import { MetRecord } from '../models/MetRecord';
import { uploadFile, deleteFile, getFileUrl, UploadedFile } from '../utils/storage.util';

// ─── NEP Session Files ────────────────────────────────────────────────────────

@Injectable()
export class FilesService {
  async uploadSessionFile(
    organizationId: string,
    sessionId: string,
    file: Express.Multer.File,
    fileType: 'map' | 'photo' | 'thumbnail',
    capturedAt?: string,
  ) {
    const session = await NepSession.findOne({
      id: sessionId,
      organizationId: new Types.ObjectId(organizationId),
      deletedAt: null,
    }).lean();
    if (!session) {
      throw Object.assign(new Error('Session not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }

    const subDir = `nep-files/${organizationId}/${sessionId}/${fileType}`;
    const saved: UploadedFile = await uploadFile(subDir, file.originalname, file.buffer, file.mimetype);

    const doc = await NepFile.create({
      sessionId,
      organizationId: new Types.ObjectId(organizationId),
      fileType,
      storageKey: saved.storageKey,
      url: saved.url,
      resourceType: saved.resourceType,
      filename: saved.filename,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      capturedAt: capturedAt ? new Date(capturedAt) : null,
    });

    return { ...doc.toObject(), url: saved.url };
  }

  async listSessionFiles(organizationId: string, sessionId: string): Promise<Array<Record<string, unknown>>> {
    const session = await NepSession.findOne({
      id: sessionId,
      organizationId: new Types.ObjectId(organizationId),
      deletedAt: null,
    }).lean();
    if (!session) {
      throw Object.assign(new Error('Session not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }

    const files = await NepFile.find({
      sessionId,
      organizationId: new Types.ObjectId(organizationId),
    }).lean();

    return files.map((f) => ({ ...f, url: f.url ?? getFileUrl(f.storageKey) }));
  }

  async deleteSessionFile(organizationId: string, sessionId: string, fileId: string): Promise<void> {
    const file = await NepFile.findOne({
      _id: new Types.ObjectId(fileId),
      sessionId,
      organizationId: new Types.ObjectId(organizationId),
    }).lean();
    if (!file) {
      throw Object.assign(new Error('File not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }

    await deleteFile(file.storageKey, file.resourceType ?? undefined);
    await NepFile.deleteOne({ _id: new Types.ObjectId(fileId) });
  }

  // ─── MET Record Pictures ────────────────────────────────────────────────────

  async uploadRecordPicture(
    organizationId: string,
    recordId: string,
    file: Express.Multer.File,
    takenAt?: string,
  ) {
    const record = await MetRecord.findOne({
      _id: new Types.ObjectId(recordId),
      organizationId: new Types.ObjectId(organizationId),
      deletedAt: null,
    }).lean();
    if (!record) {
      throw Object.assign(new Error('Record not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }

    const subDir = `met-pictures/${organizationId}/${recordId}`;
    const saved: UploadedFile = await uploadFile(subDir, file.originalname, file.buffer, file.mimetype);

    const doc = await MetPicture.create({
      recordId: new Types.ObjectId(recordId),
      organizationId: new Types.ObjectId(organizationId),
      storageKey: saved.storageKey,
      url: saved.url,
      resourceType: saved.resourceType,
      filename: saved.filename,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      takenAt: takenAt ? new Date(takenAt) : null,
    });

    return { ...doc.toObject(), url: saved.url };
  }

  async listRecordPictures(organizationId: string, recordId: string): Promise<Array<Record<string, unknown>>> {
    const record = await MetRecord.findOne({
      _id: new Types.ObjectId(recordId),
      organizationId: new Types.ObjectId(organizationId),
      deletedAt: null,
    }).lean();
    if (!record) {
      throw Object.assign(new Error('Record not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }

    const pictures = await MetPicture.find({
      recordId: new Types.ObjectId(recordId),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();

    return pictures.map((p) => ({ ...p, url: p.url ?? getFileUrl(p.storageKey) }));
  }

  async deleteRecordPicture(organizationId: string, recordId: string, pictureId: string): Promise<void> {
    const picture = await MetPicture.findOne({
      _id: new Types.ObjectId(pictureId),
      recordId: new Types.ObjectId(recordId),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();
    if (!picture) {
      throw Object.assign(new Error('Picture not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }

    await deleteFile(picture.storageKey, picture.resourceType ?? undefined);
    await MetPicture.deleteOne({ _id: new Types.ObjectId(pictureId) });
  }
}
