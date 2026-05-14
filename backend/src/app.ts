import 'dotenv/config';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';

import { swaggerSpec } from './config/swagger';
import authRoutes from './auth/auth.routes';
import deviceRoutes from './devices/devices.routes';
import sessionRoutes from './sessions/sessions.routes';
import recordRoutes from './records/records.routes';
import fileRoutes from './files/files.routes';
import syncRoutes from './sync/sync.routes';
import { errorHandler } from './middleware/error.middleware';
import path from 'path';

const app = express();
const PORT = process.env.PORT ?? 3000;
const MONGO_URI = process.env.MONGO_URI ?? '';

console.log('🔧 Initialising Express app...');

// ── Security Middleware ──────────────────────────────────────────────────────
// Allow swagger-ui inline scripts/styles in all environments
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }),
);
app.use(
  cors({
    origin: '*',
    credentials: false,
  }),
);

// ── Request Middleware ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Swagger UI ───────────────────────────────────────────────────────────────
// Available at: GET /api
app.use(
  '/api',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Observator API Docs',
    swaggerOptions: { persistAuthorization: true },
  }),
);

// Serve raw OpenAPI JSON spec for tooling (e.g. Postman import)
app.get('/api.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ── API Routes ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns server and database status for deployment monitoring.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 db:
 *                   type: string
 *                   enum: [connected, disconnected]
 *                   example: connected
 *                 uptime:
 *                   type: number
 *                   description: Process uptime in seconds
 *                   example: 3600
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /version:
 *   get:
 *     summary: API version
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Version info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 env:
 *                   type: string
 *                   example: development
 */
app.get('/version', (_req: Request, res: Response) => {
  res.json({ version: '1.0.0', env: process.env.NODE_ENV ?? 'development' });
});

// Serve uploaded files as static assets
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Versioned API routes
app.use('/v1/auth', authRoutes);
app.use('/v1/devices', deviceRoutes);
app.use('/v1/sessions', sessionRoutes);
app.use('/v1/records', recordRoutes);
app.use('/v1', fileRoutes);
app.use('/v1/sync', syncRoutes);

// ── Global Error Handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

// ── MongoDB connection ───────────────────────────────────────────────────────
async function connectDB(): Promise<void> {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not set in .env');
    process.exit(1);
  }
  console.log('⏳ Connecting to MongoDB...');
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  }
}

// ── Start ────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📚 Swagger UI: http://localhost:${PORT}/api`);
    console.log(`🔧 OpenAPI JSON: http://localhost:${PORT}/api.json`);
  });
});
