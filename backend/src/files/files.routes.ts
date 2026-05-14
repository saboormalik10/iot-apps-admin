import { Router } from 'express';
import { requireAuth, requireAuthOrApiKey } from '../middleware/auth.middleware';
import { upload } from '../utils/storage.util';
import * as ctrl from './files.controller';

const router = Router();

// ─── NEP Session Files ────────────────────────────────────────────────────────

/**
 * @swagger
 * /v1/sessions/{id}/files:
 *   post:
 *     summary: Upload a file to a NEP session (photo, map screenshot, thumbnail)
 *     description: |
 *       Multipart file upload. Validates MIME type and enforces 10 MB max.
 *       Allowed types: image/jpeg, image/png, image/webp, text/csv.
 *       Files are stored on disk and served via a URL in the response.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: NEP Session UUID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to upload (max 10 MB)
 *               fileType:
 *                 type: string
 *                 enum: [photo, map, thumbnail]
 *                 default: photo
 *                 description: Type of file being uploaded
 *               capturedAt:
 *                 type: string
 *                 format: date-time
 *                 description: When the photo/map was captured (optional)
 *     responses:
 *       201:
 *         description: File uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/FileObject'
 *       400:
 *         description: No file or invalid fileType
 *       415:
 *         description: Unsupported MIME type
 *       404:
 *         description: Session not found
 */
router.post('/sessions/:id/files', requireAuthOrApiKey, upload.single('file'), ctrl.uploadSessionFile);

/**
 * @swagger
 * /v1/sessions/{id}/files:
 *   get:
 *     summary: List all files for a NEP session
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of file objects with download URLs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FileObject'
 *       404:
 *         description: Session not found
 */
router.get('/sessions/:id/files', requireAuth, ctrl.listSessionFiles);

/**
 * @swagger
 * /v1/sessions/{id}/files/{fileId}:
 *   delete:
 *     summary: Delete a file from a NEP session
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session UUID
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: File ObjectId
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: File or session not found
 */
router.delete('/sessions/:id/files/:fileId', requireAuth, ctrl.deleteSessionFile);

// ─── MET Record Pictures ──────────────────────────────────────────────────────

/**
 * @swagger
 * /v1/records/{id}/pictures:
 *   post:
 *     summary: Upload a picture to a MET record
 *     description: |
 *       Multipart image upload (JPEG/PNG/WebP). Max 10 MB.
 *       Mirrors the MET-LINK app's photo capture feature — photos are stored
 *       server-side and a download URL is returned.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               takenAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Picture uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/FileObject'
 *       400:
 *         description: No file uploaded
 *       415:
 *         description: Unsupported MIME type
 *       404:
 *         description: Record not found
 */
router.post('/records/:id/pictures', requireAuthOrApiKey, upload.single('file'), ctrl.uploadRecordPicture);

/**
 * @swagger
 * /v1/records/{id}/pictures:
 *   get:
 *     summary: List all pictures for a MET record
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of picture objects with download URLs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FileObject'
 *       404:
 *         description: Record not found
 */
router.get('/records/:id/pictures', requireAuth, ctrl.listRecordPictures);

/**
 * @swagger
 * /v1/records/{id}/pictures/{pictureId}:
 *   delete:
 *     summary: Delete a picture from a MET record
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: pictureId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Picture not found
 */
router.delete('/records/:id/pictures/:pictureId', requireAuth, ctrl.deleteRecordPicture);

export default router;
