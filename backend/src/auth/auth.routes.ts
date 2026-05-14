import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from './auth.controller';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please wait 1 minute.' } },
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new organization and admin user
 *     description: Creates a new organization and an admin user in one step. Returns access and refresh tokens.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orgName, email, password, firstName, lastName, country]
 *             properties:
 *               orgName:
 *                 type: string
 *                 example: Observator Instruments AU
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@observator.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: Admin@1234
 *               firstName:
 *                 type: string
 *                 example: Dana
 *               lastName:
 *                 type: string
 *                 example: Galbraith
 *               country:
 *                 type: string
 *                 example: AU
 *     responses:
 *       201:
 *         description: Registration successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/register', authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and get access + refresh tokens
 *     description: Rate limited to 10 requests per minute per IP.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@observator.com
 *               password:
 *                 type: string
 *                 example: Admin@1234
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Account suspended
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Rate limit exceeded (10 req/min per IP)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', loginLimiter, authController.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Exchange refresh token for a new access token
 *     description: Accepts refreshToken from request body or httpOnly cookie.
 *     tags: [Auth]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Raw refresh token (64-char hex). Can also be sent via httpOnly cookie.
 *                 example: a1b2c3d4e5f6...
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Invalid, revoked, or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/refresh', authController.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout and revoke refresh token
 *     description: Revokes the provided refresh token. Accepts token from body or httpOnly cookie.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: a1b2c3d4e5f6...
 *     responses:
 *       204:
 *         description: Logged out successfully
 */
router.post('/logout', authController.logout);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     description: |
 *       Sends a password reset link to the provided email address.
 *       Always returns 204 (or 200 in dev mode) regardless of whether the email exists — prevents user enumeration.
 *       **Note:** Email sending via Resend is configured in Week 4. In development mode, the reset token is returned in the response body.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@observator.com
 *     responses:
 *       204:
 *         description: Reset email sent (or silently ignored if email not found)
 *       200:
 *         description: (Development only) Reset token returned for testing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 devToken:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/forgot-password', authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using a reset token
 *     description: Consumes the reset token sent via email (or returned in dev mode). Token expires in 1 hour.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *                 description: Raw 64-char hex token from email link
 *                 example: a1b2c3d4e5f6...
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: NewPassword@1234
 *     responses:
 *       204:
 *         description: Password reset successful. All refresh tokens revoked.
 *       400:
 *         description: Invalid token, expired token, or weak password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/reset-password', authController.resetPassword);

export default router;
