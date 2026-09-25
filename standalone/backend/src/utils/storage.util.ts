/**
 * storage.util.ts
 *
 * Media storage on LOCAL DISK, under the standalone data folder.
 *
 * The cloud portal used Cloudinary, because its host's filesystem was wiped on
 * every redeploy. The standalone PC keeps its disk, has no internet to reach
 * Cloudinary with, and backs up one data folder — so files live there instead.
 * This is a return to the disk storage the cloud portal used before Cloudinary.
 *
 * `storageKey` is the path relative to the uploads folder. The stored `url` is
 * RELATIVE to the web app (`/api/uploads/<key>`): the browser reaches the API
 * through the web app's proxy, so an absolute API address would break for
 * anyone opening the portal from another PC on the network.
 */

import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { fromBuffer } from 'file-type';
import { uploadsDir } from '../config/data-dir';

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

// ─── Multer — memory storage (the buffer is validated, then written to disk) ──

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
  storageKey: string;   // path relative to the uploads folder
  url: string;          // web-relative delivery URL, via the web app's proxy
  resourceType: string; // kept for API compatibility; always 'image' or 'raw'
  filename: string;     // original sanitised filename
  mimeType: string;
  sizeBytes: number;
}

/**
 * Resolve a storage key to an absolute path, refusing anything that escapes the
 * uploads folder. `subDir` is built from ids today, but a key that ever carried
 * `../` would otherwise let a delete reach any file the service account can touch.
 */
function resolveKey(storageKey: string): string {
  const root = uploadsDir();
  const full = path.resolve(root, storageKey);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw Object.assign(new Error('Invalid storage key'), { code: 'VALIDATION_ERROR', statusCode: 400 });
  }
  return full;
}

/**
 * Write an in-memory file buffer to the uploads folder.
 * @param subDir e.g. "branding/{orgId}"
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
  // Forward slashes in the key regardless of OS, so a key written on Windows
  // still reads as a URL path.
  const storageKey = [subDir, `${Date.now()}_${safeName}`].join('/').replace(/\\/g, '/');
  const full = resolveKey(storageKey);

  await fs.mkdir(path.dirname(full), { recursive: true });
  // `wx`: never overwrite. Two uploads in the same millisecond with the same
  // name is vanishingly rare, and failing loudly beats silently replacing a file.
  await fs.writeFile(full, buffer, { flag: 'wx' });

  return {
    storageKey,
    url: getFileUrl(storageKey),
    resourceType: mimeType.startsWith('image/') ? 'image' : 'raw',
    filename: safeName,
    mimeType,
    sizeBytes: buffer.length,
  };
}

/** Delete a stored file. Best-effort: a missing file is not an error. */
export async function deleteFile(storageKey: string, _resourceType?: string): Promise<void> {
  try {
    await fs.unlink(resolveKey(storageKey));
  } catch {
    // Already gone, or never written — nothing to undo.
  }
}

/** The web-relative URL a browser uses to fetch a stored file. */
export function getFileUrl(storageKey: string): string {
  return `/api/uploads/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
}
