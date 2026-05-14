import { Types } from 'mongoose';
import { NepFile } from '../models/NepFile';
import { MetPicture } from '../models/MetPicture';
import { NepSession } from '../models/NepSession';
import { MetRecord } from '../models/MetRecord';
import { saveFileToDisk, deleteFileFromDisk, getFileUrl, SavedFile } from '../utils/storage.util';

// ─── NEP Session Files ────────────────────────────────────────────────────────

export async function uploadSessionFile(
  organizationId: string,
  sessionId: string,
  file: Express.Multer.File,
  fileType: 'map' | 'photo' | 'thumbnail',
  capturedAt?: string,
) {
  // Validate session belongs to org
  const session = await NepSession.findOne({
    id: sessionId,
    organizationId: new Types.ObjectId(organizationId),
    deletedAt: null,
  }).lean();
  if (!session) {
    const err = new Error('Session not found');
    (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
    throw err;
  }

  const subDir = `nep-files/${organizationId}/${sessionId}/${fileType}`;
  const saved: SavedFile = saveFileToDisk(subDir, file.originalname, file.buffer, file.mimetype);

  const doc = await NepFile.create({
    sessionId,
    organizationId: new Types.ObjectId(organizationId),
    fileType,
    storageKey: saved.storageKey,
    filename: saved.filename,
    mimeType: saved.mimeType,
    sizeBytes: saved.sizeBytes,
    capturedAt: capturedAt ? new Date(capturedAt) : null,
  });

  return { ...doc.toObject(), url: getFileUrl(saved.storageKey) };
}

export async function listSessionFiles(organizationId: string, sessionId: string): Promise<Array<Record<string, unknown>>> {
  // Validate session belongs to org
  const session = await NepSession.findOne({
    id: sessionId,
    organizationId: new Types.ObjectId(organizationId),
    deletedAt: null,
  }).lean();
  if (!session) {
    const err = new Error('Session not found');
    (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
    throw err;
  }

  const files = await NepFile.find({
    sessionId,
    organizationId: new Types.ObjectId(organizationId),
  }).lean();

  return files.map((f) => ({ ...f, url: getFileUrl(f.storageKey) }));
}

export async function deleteSessionFile(
  organizationId: string,
  sessionId: string,
  fileId: string,
) {
  const file = await NepFile.findOne({
    _id: new Types.ObjectId(fileId),
    sessionId,
    organizationId: new Types.ObjectId(organizationId),
  }).lean();
  if (!file) {
    const err = new Error('File not found');
    (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
    throw err;
  }

  deleteFileFromDisk(file.storageKey);
  await NepFile.deleteOne({ _id: new Types.ObjectId(fileId) });
}

// ─── MET Record Pictures ──────────────────────────────────────────────────────

export async function uploadRecordPicture(
  organizationId: string,
  recordId: string,
  file: Express.Multer.File,
  takenAt?: string,
) {
  // Validate record belongs to org
  const record = await MetRecord.findOne({
    _id: new Types.ObjectId(recordId),
    organizationId: new Types.ObjectId(organizationId),
    deletedAt: null,
  }).lean();
  if (!record) {
    const err = new Error('Record not found');
    (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
    throw err;
  }

  const subDir = `met-pictures/${organizationId}/${recordId}`;
  const saved: SavedFile = saveFileToDisk(subDir, file.originalname, file.buffer, file.mimetype);

  const doc = await MetPicture.create({
    recordId: new Types.ObjectId(recordId),
    organizationId: new Types.ObjectId(organizationId),
    storageKey: saved.storageKey,
    filename: saved.filename,
    mimeType: saved.mimeType,
    sizeBytes: saved.sizeBytes,
    takenAt: takenAt ? new Date(takenAt) : null,
  });

  return { ...doc.toObject(), url: getFileUrl(saved.storageKey) };
}

export async function listRecordPictures(organizationId: string, recordId: string): Promise<Array<Record<string, unknown>>> {
  const record = await MetRecord.findOne({
    _id: new Types.ObjectId(recordId),
    organizationId: new Types.ObjectId(organizationId),
    deletedAt: null,
  }).lean();
  if (!record) {
    const err = new Error('Record not found');
    (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
    throw err;
  }

  const pictures = await MetPicture.find({
    recordId: new Types.ObjectId(recordId),
    organizationId: new Types.ObjectId(organizationId),
  }).lean();

  return pictures.map((p) => ({ ...p, url: getFileUrl(p.storageKey) }));
}

export async function deleteRecordPicture(
  organizationId: string,
  recordId: string,
  pictureId: string,
) {
  const picture = await MetPicture.findOne({
    _id: new Types.ObjectId(pictureId),
    recordId: new Types.ObjectId(recordId),
    organizationId: new Types.ObjectId(organizationId),
  }).lean();
  if (!picture) {
    const err = new Error('Picture not found');
    (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
    throw err;
  }

  deleteFileFromDisk(picture.storageKey);
  await MetPicture.deleteOne({ _id: new Types.ObjectId(pictureId) });
}
