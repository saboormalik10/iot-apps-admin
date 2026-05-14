/**
 * storage.util.ts
 *
 * Local disk storage for file uploads.
 * Files are saved to: backend/uploads/{orgId}/{type}/{filename}
 * Served as static files via Express at: GET /uploads/{orgId}/{type}/{filename}
 *
 * SWAP POINT: To migrate to Cloudflare R2 or AWS S3 in the future,
 * replace `uploadFile` and `getFileUrl` with S3 SDK calls.
 * The DB storageKey format ("nep-files/{orgId}/{sessionId}/{filename}") already
 * matches the R2 object key convention — no schema changes needed.
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/csv',
  'application/pdf',
]);

const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');

// ─── Multer — memory storage (we handle disk write ourselves for full path control) ──

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), {
          code: 'INVALID_MIME',
        }) as unknown as null,
        false,
      );
    }
  },
});

// ─── Save file to disk ────────────────────────────────────────────────────────

export interface SavedFile {
  storageKey: string;   // relative path used as DB key — matches R2 key convention
  filename: string;     // original sanitised filename
  mimeType: string;
  sizeBytes: number;
}

/**
 * Save an uploaded file buffer to disk.
 * @param subDir  e.g. "nep-files/{orgId}/{sessionId}" or "met-pictures/{orgId}/{recordId}"
 * @param originalName  original filename from multer
 * @param buffer  file buffer from multer memoryStorage
 * @param mimeType  validated MIME type
 */
export function saveFileToDisk(
  subDir: string,
  originalName: string,
  buffer: Buffer,
  mimeType: string,
): SavedFile {
  // Sanitise filename — strip directory traversal attempts
  const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const filename = `${timestamp}_${safeName}`;
  const storageKey = `${subDir}/${filename}`;
  const absDir = path.join(UPLOADS_ROOT, subDir);
  const absPath = path.join(UPLOADS_ROOT, storageKey);

  // Validate the resolved path is still inside UPLOADS_ROOT (path traversal guard)
  if (!absPath.startsWith(UPLOADS_ROOT + path.sep) && absPath !== UPLOADS_ROOT) {
    throw Object.assign(new Error('Invalid file path'), { code: 'INVALID_PATH' });
  }

  fs.mkdirSync(absDir, { recursive: true });
  fs.writeFileSync(absPath, buffer);

  return { storageKey, filename, mimeType, sizeBytes: buffer.length };
}

/**
 * Delete a file from disk by its storageKey.
 * Silent if the file does not exist.
 */
export function deleteFileFromDisk(storageKey: string): void {
  try {
    const absPath = path.join(UPLOADS_ROOT, storageKey);
    // Path traversal guard
    if (!absPath.startsWith(UPLOADS_ROOT + path.sep)) return;
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch {
    // Non-fatal — log but continue
  }
}

/**
 * Generate a URL to access the file.
 * In local dev: http://localhost:3000/uploads/{storageKey}
 * In production: https://{API_BASE_URL}/uploads/{storageKey}
 *
 * SWAP POINT: Replace with S3 presigned URL generation when migrating to R2.
 */
export function getFileUrl(storageKey: string): string {
  const base = (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/uploads/${storageKey}`;
}
