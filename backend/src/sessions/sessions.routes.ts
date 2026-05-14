import { Router } from 'express';
import { requireAuth, requireAuthOrApiKey } from '../middleware/auth.middleware';
import * as ctrl from './sessions.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: NEP Sessions
 *     description: NEP-LINK water quality logging sessions — upload, query and export turbidity data
 */

/**
 * @swagger
 * /v1/sessions:
 *   get:
 *     summary: List sessions
 *     tags: [NEP Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: deviceId
 *         schema:
 *           type: string
 *         description: Filter by device ObjectId
 *       - in: query
 *         name: from
 *         schema:
 *           type: integer
 *         description: Start timestamp filter (Unix ms)
 *       - in: query
 *         name: to
 *         schema:
 *           type: integer
 *         description: End timestamp filter (Unix ms)
 *       - in: query
 *         name: probeRange
 *         schema:
 *           type: string
 *           enum: [R1, R2, R3]
 *         description: Filter by probe range (R1=0–10 NTU, R2=10–1000 NTU, R3=>1000 NTU)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated session list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/NepSession'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginatedMeta'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', requireAuth, ctrl.listSessions);

/**
 * @swagger
 * /v1/sessions:
 *   post:
 *     summary: Upload a NEP-LINK session from the mobile app
 *     description: |
 *       Idempotent — repeated uploads with the same `id` (UUID) return the existing session without error.
 *       Auto-computes `turbidityAvg`, `turbidityMin`, `turbidityMax`, `temperatureAvg`, `sampleCount`, `probeRange`, and `hasTempData`
 *       from any inline `samples` provided with the upload.
 *       `probeRange` is derived from the first non-null turbidity value: <10 NTU = R1, 10–1000 = R2, >1000 = R3.
 *     tags: [NEP Sessions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, deviceId, deviceName, startTimestamp, timezoneName, timezoneOffset]
 *             properties:
 *               id:
 *                 type: string
 *                 format: uuid
 *                 description: UUID v4 from mobile app — used as idempotency key
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               deviceId:
 *                 type: string
 *                 description: Device ObjectId
 *               deviceName:
 *                 type: string
 *                 example: "NEP-LINK-001"
 *               startTimestamp:
 *                 type: integer
 *                 description: Session start Unix ms
 *                 example: 1746057600000
 *               endTimestamp:
 *                 type: integer
 *                 nullable: true
 *               timezoneName:
 *                 type: string
 *                 example: "Australia/Melbourne"
 *               timezoneOffset:
 *                 type: integer
 *                 description: Timezone offset in hours
 *                 example: 10
 *               turbidityEnabled:
 *                 type: boolean
 *                 default: true
 *               temperatureEnabled:
 *                 type: boolean
 *                 default: true
 *               locationEnabled:
 *                 type: boolean
 *                 default: false
 *               comment:
 *                 type: string
 *                 example: "River sampling at intake"
 *               isDemoMode:
 *                 type: boolean
 *                 default: false
 *               samples:
 *                 type: array
 *                 description: Optional inline samples — processed in the same request (max 7200)
 *                 items:
 *                   $ref: '#/components/schemas/NepSampleInput'
 *     responses:
 *       201:
 *         description: Session created (or existing session returned if already uploaded)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/NepSession'
 *       404:
 *         description: Device not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/', requireAuthOrApiKey, ctrl.createSession);

/**
 * @swagger
 * /v1/sessions/{id}:
 *   get:
 *     summary: Get session detail + aggregated stats
 *     tags: [NEP Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session UUID (from mobile app)
 *     responses:
 *       200:
 *         description: Full session object with computed stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/NepSession'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id', requireAuth, ctrl.getSession);

/**
 * @swagger
 * /v1/sessions/{id}:
 *   patch:
 *     summary: Update session comment
 *     tags: [NEP Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comment:
 *                 type: string
 *                 example: "Updated field notes after review"
 *     responses:
 *       200:
 *         description: Updated session
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/NepSession'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.patch('/:id', requireAuth, ctrl.updateSession);

/**
 * @swagger
 * /v1/sessions/{id}:
 *   delete:
 *     summary: Delete session and cascade-delete all samples
 *     description: Permanently soft-deletes the session and hard-deletes all associated samples. Files must be deleted separately.
 *     tags: [NEP Sessions]
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
 *       204:
 *         description: Session deleted
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete('/:id', requireAuth, ctrl.deleteSession);

/**
 * @swagger
 * /v1/sessions/{id}/samples:
 *   post:
 *     summary: Bulk insert samples for a session
 *     description: |
 *       Inserts up to **7,200 samples** in a single request using one `insertMany()` call.
 *       After insertion, the session's aggregated stats (`turbidityAvg`, `turbidityMin`, `turbidityMax`,
 *       `sampleCount`, `probeRange`, etc.) are recomputed automatically.
 *
 *       **Important:** Never call this endpoint in a loop per sample — always batch all samples into one request.
 *     tags: [NEP Sessions]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [samples]
 *             properties:
 *               samples:
 *                 type: array
 *                 maxItems: 7200
 *                 description: Array of sensor samples (max 7200 per request)
 *                 items:
 *                   $ref: '#/components/schemas/NepSampleInput'
 *     responses:
 *       201:
 *         description: Samples inserted and session stats updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     inserted:
 *                       type: integer
 *                       example: 3600
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/:id/samples', requireAuthOrApiKey, ctrl.bulkInsertSamples);

/**
 * @swagger
 * /v1/sessions/{id}/samples:
 *   get:
 *     summary: Get paginated samples for a session
 *     description: |
 *       Returns raw samples with pagination. When `?downsample=true` and the session has more than 500 samples,
 *       returns 1-minute averaged buckets instead of raw rows. Downsampled response includes
 *       `meta.downsampled: true` and `meta.originalCount`.
 *     tags: [NEP Sessions]
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
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 500
 *           maximum: 1000
 *       - in: query
 *         name: downsample
 *         schema:
 *           type: boolean
 *           default: false
 *         description: |
 *           When true and total samples > 500, returns 1-minute bucket averages
 *           instead of raw samples. Ideal for chart rendering — reduces payload from
 *           7200 points to ~120 buckets for a 2-hour session.
 *     responses:
 *       200:
 *         description: Sample list (raw or downsampled)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/NepSample'
 *                 meta:
 *                   allOf:
 *                     - $ref: '#/components/schemas/PaginatedMeta'
 *                     - type: object
 *                       properties:
 *                         downsampled:
 *                           type: boolean
 *                         originalCount:
 *                           type: integer
 *                           nullable: true
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id/samples', requireAuth, ctrl.getSamples);

/**
 * @swagger
 * /v1/sessions/{id}/export:
 *   get:
 *     summary: Download session data as CSV
 *     description: |
 *       Returns a CSV file matching the NEP-LINK app's export format:
 *       ```
 *       Date,Time,Lat,Lon,Turbidity,Temperature,,Comment,Battery Level
 *       Australia/Melbourne,,,,NTU,°C,,,,%
 *       01 May 2026,14:32:01,51.5074,-0.1278,245.67,18.3,,Field notes,85
 *       ```
 *     tags: [NEP Sessions]
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
 *         description: CSV file download
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *               example: 'attachment; filename="NEP-Link-2026-05-13.csv"'
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id/export', requireAuth, ctrl.exportCsv);

export default router;
