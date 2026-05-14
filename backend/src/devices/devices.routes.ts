import { Router } from 'express';
import { requireAuth, requireAuthOrApiKey, requireRole } from '../middleware/auth.middleware';
import * as ctrl from './devices.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Devices
 *     description: Device registry — register, manage and monitor MET-LINK and NEP-LINK hardware devices
 */

/**
 * @swagger
 * /v1/devices:
 *   get:
 *     summary: List all devices in org
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [MET-LINK, NEP-LINK]
 *         description: Filter by device type
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
 *         description: Paginated device list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Device'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginatedMeta'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', requireAuth, ctrl.listDevices);

/**
 * @swagger
 * /v1/devices:
 *   post:
 *     summary: Register a new device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bleId, name, type]
 *             properties:
 *               bleId:
 *                 type: string
 *                 example: "MET-00:11:22:33:44:55"
 *                 description: BLE MAC address or device ID — unique per organization
 *               name:
 *                 type: string
 *                 example: "MET-LINK-001"
 *               type:
 *                 type: string
 *                 enum: [MET-LINK, NEP-LINK]
 *               serialNo:
 *                 type: string
 *                 example: "SN-20240101-001"
 *               firmwareVersion:
 *                 type: string
 *                 example: "2.3.1"
 *               customName:
 *                 type: string
 *                 example: "Rooftop Station"
 *     responses:
 *       201:
 *         description: Device created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Device'
 *       409:
 *         description: Device with this BLE ID already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/', requireAuthOrApiKey, ctrl.createDevice);

/**
 * @swagger
 * /v1/devices/{id}:
 *   get:
 *     summary: Get device detail + live status
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ObjectId
 *     responses:
 *       200:
 *         description: Device detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Device'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id', requireAuth, ctrl.getDevice);

/**
 * @swagger
 * /v1/devices/{id}:
 *   patch:
 *     summary: Update device name / serial / firmware
 *     tags: [Devices]
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
 *               name:
 *                 type: string
 *               customName:
 *                 type: string
 *               serialNo:
 *                 type: string
 *               firmwareVersion:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated device
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Device'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.patch('/:id', requireAuth, ctrl.updateDevice);

/**
 * @swagger
 * /v1/devices/{id}:
 *   delete:
 *     summary: Soft-delete a device (admin only)
 *     description: Sets `deletedAt` timestamp. Historical data is preserved. The device can no longer receive new sessions/records.
 *     tags: [Devices]
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
 *         description: Device deleted
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deleteDevice);

/**
 * @swagger
 * /v1/devices/{id}/stats:
 *   get:
 *     summary: Aggregated stats for a device
 *     description: Returns total session count and last activity timestamp.
 *     tags: [Devices]
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
 *         description: Device stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionCount:
 *                       type: integer
 *                       example: 42
 *                     lastActivityAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id/stats', requireAuth, ctrl.getDeviceStats);

export default router;
