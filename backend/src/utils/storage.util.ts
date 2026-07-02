/**
 * storage.util.ts
 *
 * Media storage backed by Cloudinary (free tier). Replaces the previous
 * local-disk implementation — Render's filesystem is ephemeral, so disk
 * uploads did not survive restarts/redeploys.
 *
 * The DB `storageKey` is the Cloudinary `public_id`; the canonical delivery URL
 * (`secure_url`) is stored alongside it. Legacy records that still hold a disk
 * relative path resolve through `getFileUrl` (served at /uploads).
 */

import multer from 'multer';
import path from 'path';
import { Readable } from 'stream';
import { fromBuffer } from 'file-type';
import { cloudinary } from '../config/cloudinary';

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

// Plain-text formats have no binary signature, so `file-type` returns undefined
// for them — they are allowed only when the *declared* type is one of these.
const TEXT_MIME_TYPES = new Set(['text/csv', 'text/plain', 'application/csv']);

/**
 * Month 5 hardening: validate the file by its **magic bytes**, not the
 * client-declared mimetype (which is trivially spoofable). Throws a 415 with the
 * `INVALID_MIME` code (surfaced by AllExceptionsFilter) when the real content is
 * not in {@link ALLOWED_MIME_TYPES}.
 */
export async function assertAllowedFileType(buffer: Buffer, declaredMime: string): Promise<void> {
  const reject = (message: string): never => {
    throw Object.assign(new Error(message), { code: 'INVALID_MIME', statusCode: 415 });
  };
  const detected = await fromBuffer(buffer);
  if (detected) {
    if (!ALLOWED_MIME_TYPES.has(detected.mime)) {
      reject(`Unsupported file type: ${detected.mime}`);
    }
    return;
  }
  // No signature detected (e.g. CSV / plain text) — only accept if the caller
  // declared a text type that we allow. Anything else is treated as spoofed.
  if (!TEXT_MIME_TYPES.has(declaredMime)) {
    reject('Unrecognised or disallowed file content (magic-byte check failed)');
  }
}

// ─── Multer — memory storage (buffer is streamed straight to Cloudinary) ──────

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

// ─── Upload result ────────────────────────────────────────────────────────────

export interface UploadedFile {
  storageKey: string;   // Cloudinary public_id
  url: string;          // Cloudinary secure_url (canonical delivery URL)
  resourceType: string; // 'image' | 'raw' | 'video' (needed for deletion)
  filename: string;     // original sanitised filename
  mimeType: string;
  sizeBytes: number;
}

/**
 * Upload an in-memory file buffer to Cloudinary.
 * @param subDir e.g. "nep-files/{orgId}/{sessionId}/photo" — used as the Cloudinary folder
 * @param originalName original filename from multer
 * @param buffer file buffer from multer memoryStorage
 * @param mimeType validated MIME type
 */
export async function uploadFile(
  subDir: string,
  originalName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadedFile> {
  await assertAllowedFileType(buffer, mimeType);

  const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const publicId = `${Date.now()}_${safeName}`;

  return new Promise<UploadedFile>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: subDir,
        public_id: publicId,
        resource_type: 'auto', // handles images + raw (csv/pdf)
        use_filename: false,
        unique_filename: false,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed'));
          return;
        }
        resolve({
          storageKey: result.public_id,
          url: result.secure_url,
          resourceType: result.resource_type,
          filename: safeName,
          mimeType,
          sizeBytes: buffer.length,
        });
      },
    );
    Readable.from(buffer).pipe(stream);
  });
}

/**
 * Delete a file from Cloudinary by its storageKey (public_id).
 * Best-effort — failures are swallowed (matches the previous disk behaviour).
 */
export async function deleteFile(storageKey: string, resourceType?: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(storageKey, {
      resource_type: resourceType || 'image',
      invalidate: true,
    });
  } catch {
    // Non-fatal — log-free best effort, same as the legacy disk delete.
  }
}

/**
 * Legacy fallback URL for records stored on local disk before the Cloudinary
 * migration (their storageKey is a relative path served at /uploads).
 * New records store the Cloudinary `secure_url` directly and never hit this.
 */
export function getFileUrl(storageKey: string): string {
  const base = (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/uploads/${storageKey}`;
}
