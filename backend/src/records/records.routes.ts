import { Router } from 'express';
import { requireAuth, requireAuthOrApiKey } from '../middleware/auth.middleware';
import * as ctrl from './records.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: MET Records
 *     description: MET-LINK meteorological logging records — upload, query and export weather station data
 */

/**
 * @swagger
 * /v1/records:
 *   get:
 *     summary: List all MET-LINK records in the organisation
 *     tags: [MET Records]
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
 *         description: Filter records with dateStartMs >= this Unix ms value
 *       - in: query
 *         name: to
 *         schema:
 *           type: integer
 *         description: Filter records with dateStartMs <= this Unix ms value
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
 *         description: Paginated list of records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MetRecord'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginatedMeta'
 */
router.get('/', requireAuth, ctrl.listRecords);

/**
 * @swagger
 * /v1/records:
 *   post:
 *     summary: Upload a MET-LINK logging record from the mobile app
 *     description: |
 *       Creates a new record (logging session). Safe to retry — if `localRecordId` matches
 *       an existing record in this org, the existing record is returned without creating a duplicate.
 *     tags: [MET Records]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MetRecordInput'
 *     responses:
 *       201:
 *         description: Record created (or existing record returned)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/MetRecord'
 *       404:
 *         description: Device not found in organisation
 */
router.post('/', requireAuthOrApiKey, ctrl.createRecord);

/**
 * @swagger
 * /v1/records/{id}:
 *   get:
 *     summary: Get record detail
 *     tags: [MET Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ObjectId
 *     responses:
 *       200:
 *         description: Record detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/MetRecord'
 *       404:
 *         description: Record not found
 */
router.get('/:id', requireAuth, ctrl.getRecord);

/**
 * @swagger
 * /v1/records/{id}:
 *   patch:
 *     summary: Update record comment
 *     tags: [MET Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comment:
 *                 type: string
 *                 example: Station serviced, recalibrated anemometer
 *     responses:
 *       200:
 *         description: Updated record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/MetRecord'
 *       404:
 *         description: Record not found
 */
router.patch('/:id', requireAuth, ctrl.updateRecord);

/**
 * @swagger
 * /v1/records/{id}:
 *   delete:
 *     summary: Delete record and cascade-delete all measures
 *     tags: [MET Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Record not found
 */
router.delete('/:id', requireAuth, ctrl.deleteRecord);

/**
 * @swagger
 * /v1/records/{id}/measures:
 *   post:
 *     summary: Bulk upload measures for a record
 *     description: |
 *       Accepts an array of raw `{ dataSentence, timeStamp }` objects from the MET-LINK app's
 *       SQLite `measure` table and parses all sensor fields on ingest (wind speed/direction,
 *       temperature, humidity, pressure, precipitation, solar, voltage, GPS, dew point, QNH/QFE).
 *
 *       The first element should be the header row (dataSentence contains literal "Unit,Description"
 *       triplets). The backend detects this automatically and marks it `rowType: "header"`.
 *
 *       Up to 10 000 rows per call. Uses a single `insertMany` — never loops individual inserts.
 *     tags: [MET Records]
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
 *         application/json:
 *           schema:
 *             type: object
 *             required: [measures]
 *             properties:
 *               measures:
 *                 type: array
 *                 maxItems: 10000
 *                 description: Array of raw measure rows from SQLite. First item is the header row.
 *                 items:
 *                   $ref: '#/components/schemas/MetMeasureInput'
 *                 example:
 *                   - dataSentence: "Wind speed,Unit,Description,Wind direction,Unit,Description,Temperature,Unit,Description,Humidity,Unit,Description,Pressure,Unit,Description,Latitude phone,Longitude phone"
 *                     timeStamp: "2026-05-01 14:32:00"
 *                   - dataSentence: "12.5,m/s,relative,045.0,°,relative,23.4,°C,TEMP,63.5,%,RH,1.025,B,PRESS,-37.8136,144.9631"
 *                     timeStamp: "2026-05-01 14:32:01"
 *     responses:
 *       201:
 *         description: Measures inserted
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
 *                       example: 3601
 *                     dataRows:
 *                       type: integer
 *                       example: 3600
 *                     headerRows:
 *                       type: integer
 *                       example: 1
 *       400:
 *         description: Validation error — measures array is empty or malformed
 *       404:
 *         description: Record not found
 */
router.post('/:id/measures', requireAuthOrApiKey, ctrl.bulkInsertMeasures);

/**
 * @swagger
 * /v1/records/{id}/measures:
 *   get:
 *     summary: Get paginated measures for a record
 *     tags: [MET Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ObjectId
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 1000
 *           maximum: 5000
 *     responses:
 *       200:
 *         description: Paginated measures
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MetMeasure'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginatedMeta'
 *       404:
 *         description: Record not found
 */
router.get('/:id/measures', requireAuth, ctrl.getMeasures);

/**
 * @swagger
 * /v1/records/{id}/export:
 *   get:
 *     summary: Download record data as CSV
 *     description: |
 *       Returns the full record as a CSV file matching the MET-LINK app's native export format:
 *       ```
 *       Timestamp,<headerSentence>,Comment:,<comment>
 *       2026-05-01 14:32:01,12.5,m/s,relative,...
 *       ```
 *     tags: [MET Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ObjectId
 *     responses:
 *       200:
 *         description: CSV file download
 *         headers:
 *           Content-Disposition:
 *             description: attachment; filename="MET-Link-YYYY-MM-DD.csv"
 *             schema:
 *               type: string
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       404:
 *         description: Record not found
 */
router.get('/:id/export', requireAuth, ctrl.exportCsv);

export default router;
