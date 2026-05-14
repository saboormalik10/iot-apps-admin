import { Router } from 'express';
import { requireAuth, requireAuthOrApiKey } from '../middleware/auth.middleware';
import * as ctrl from './sync.controller';

const router = Router();

/**
 * @swagger
 * /v1/sync/status:
 *   get:
 *     summary: Get sync status for the organisation (or a specific device)
 *     description: |
 *       Returns counts and timestamps of the last synced NEP sessions and MET records.
 *       Used by the mobile app to show "X sessions synced" indicators.
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: deviceId
 *         schema:
 *           type: string
 *         description: Optional — filter status to a specific device ObjectId
 *     responses:
 *       200:
 *         description: Sync status object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     organizationId:
 *                       type: string
 *                     deviceId:
 *                       type: string
 *                       nullable: true
 *                     nepSessions:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 42 }
 *                         lastSyncedAt: { type: string, format: date-time, nullable: true }
 *                     metRecords:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 15 }
 *                         lastSyncedAt: { type: string, format: date-time, nullable: true }
 *                     serverTime:
 *                       type: string
 *                       format: date-time
 */
router.get('/status', requireAuthOrApiKey, ctrl.getSyncStatus);

/**
 * @swagger
 * /v1/sync/upload:
 *   post:
 *     summary: Upload a session or record from the mobile app (idempotent upsert)
 *     description: |
 *       Single unified endpoint for both NEP-LINK sessions and MET-LINK records.
 *       Set `type` to `"nep_session"` or `"met_record"`.
 *
 *       **Idempotent:** Safe to call multiple times with the same data.
 *       - NEP sessions: deduped by `sessionId` (UUID)
 *       - MET records: deduped by `localRecordId` (SQLite integer) or `deviceId + dateStart`
 *
 *       Inline samples/measures are parsed and inserted in a single `insertMany`.
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/SyncNepSessionInput'
 *               - $ref: '#/components/schemas/SyncMetRecordInput'
 *           examples:
 *             nep_session:
 *               summary: NEP-LINK session with samples
 *               value:
 *                 type: nep_session
 *                 sessionId: "550e8400-e29b-41d4-a716-446655440000"
 *                 deviceId: "664a1f2e3c4d5e6f7a8b9c0f"
 *                 deviceName: "NEP-LINK-001"
 *                 startTimestamp: 1746057600000
 *                 timezoneName: "Australia/Melbourne"
 *                 timezoneOffset: 10
 *                 turbidityEnabled: true
 *                 temperatureEnabled: true
 *                 samples:
 *                   - timestamp: 1746057601000
 *                     turbidityValue: 245.5
 *                     temperatureValue: 18.4
 *                     probeRange: "R2"
 *                     batteryLevel: 85
 *             met_record:
 *               summary: MET-LINK record with measures
 *               value:
 *                 type: met_record
 *                 deviceId: "664a1f2e3c4d5e6f7a8b9c0f"
 *                 deviceName: "MET-LINK-001"
 *                 dateStart: "2026-05-01 14:00:00"
 *                 dateEnd: "2026-05-01 15:00:00"
 *                 localRecordId: 42
 *                 measures:
 *                   - dataSentence: "Wind speed,Unit,Description,Temperature,Unit,Description,Latitude phone,Longitude phone"
 *                     timeStamp: "2026-05-01 14:00:00"
 *                   - dataSentence: "12.5,m/s,relative,23.4,°C,TEMP,-37.8136,144.9631"
 *                     timeStamp: "2026-05-01 14:00:01"
 *     responses:
 *       201:
 *         description: Upserted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [nep_session, met_record]
 *                     samplesInserted:
 *                       type: integer
 *                       example: 3600
 *                     measuresInserted:
 *                       type: integer
 *                       example: 3601
 *       400:
 *         description: Validation error
 *       404:
 *         description: Device not found
 */
router.post('/upload', requireAuthOrApiKey, ctrl.syncUpload);

/**
 * @swagger
 * /v1/sync/download:
 *   get:
 *     summary: Download synced data for a device since a given timestamp
 *     description: |
 *       Returns all NEP sessions or MET records that were synced after the `since` timestamp.
 *       Used by the admin dashboard to pull the latest data, or by apps to verify what's been received.
 *       Returns max 100 items. Paginate by advancing the `since` cursor.
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ObjectId
 *       - in: query
 *         name: since
 *         schema:
 *           type: integer
 *         description: Unix ms — return records synced after this time. Omit for all records.
 *     responses:
 *       200:
 *         description: Downloaded data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     device:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         name: { type: string }
 *                         type: { type: string, enum: [MET-LINK, NEP-LINK] }
 *                     since:
 *                       type: string
 *                       format: date-time
 *                     nepSessions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/NepSession'
 *                     metRecords:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/MetRecord'
 *       400:
 *         description: Missing deviceId
 *       404:
 *         description: Device not found
 */
router.get('/download', requireAuthOrApiKey, ctrl.syncDownload);

export default router;
