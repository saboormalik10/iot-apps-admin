import 'dotenv/config';
import dns from 'dns';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import * as express from 'express';
import * as path from 'path';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { configureCloudinary } from './config/cloudinary';

// Some hosts (e.g. Render) advertise IPv6 but outbound IPv6 isn't actually
// routable — Node's DNS lookups then return an IPv6 address that connects fail
// against with ENETUNREACH (hit this against Gmail SMTP). Prefer IPv4 results
// process-wide as the general fix; the mailer also pins `family: 4` directly.
dns.setDefaultResultOrder('ipv4first');

// ── Audience-filtered OpenAPI specs ────────────────────────────────────────────
type Audience = 'nep-link' | 'met-link' | 'admin';
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

/**
 * Produce a copy of the full spec containing only the operations whose
 * `x-consumers` extension includes `audience`. Operations without the extension
 * default to `admin`. Emptied paths are dropped.
 */
function filterByConsumer(full: OpenAPIObject, audience: Audience): OpenAPIObject {
  const clone = JSON.parse(JSON.stringify(full)) as OpenAPIObject;
  const paths = clone.paths ?? {};
  for (const p of Object.keys(paths)) {
    const item = paths[p] as Record<string, unknown>;
    for (const m of Object.keys(item)) {
      if (!HTTP_METHODS.includes(m)) continue;
      const op = item[m] as Record<string, unknown>;
      const consumers = (op['x-consumers'] as string[] | undefined) ?? ['admin'];
      if (!consumers.includes(audience)) delete item[m];
    }
    const remaining = Object.keys(item).filter((k) => HTTP_METHODS.includes(k));
    if (remaining.length === 0) delete paths[p];
  }
  return clone;
}

const MOBILE_GUIDE = `
### Mobile Apps (NEP-LINK & MET-LINK) — how to integrate, step by step
Every person using the app has their **own account**. Everything the app uploads is
saved together with that user's id, so the admin panel can show who did what.

**1. Get the user signed in**
- First time: \`POST /v1/auth/mobile/signup\` with name, email, password and your
  \`appType\` ("MET-LINK" or "NEP-LINK").
- Coming back: \`POST /v1/auth/mobile/login\` with email + password.
- Both return an \`accessToken\` and a \`refreshToken\`. Save both securely on the
  phone (e.g. Keychain / Keystore).

**2. Call the API**
Send the access token on every request:
\`\`\`
Authorization: Bearer <accessToken>
Content-Type: application/json
\`\`\`

**3. Keep the user signed in (refresh)**
The access token only lives **15 minutes**. When a request comes back
**401 TOKEN_INVALID**, call \`POST /v1/auth/mobile/refresh\` with your saved
\`refreshToken\`, store the new \`accessToken\`, and retry the request. You can also
refresh proactively just before the 15 minutes are up. The refresh token lives
**30 days** — if the refresh call itself fails, send the user back to the login
screen. On logout, call \`POST /v1/auth/mobile/logout\` and delete both tokens.

**4. Register the device once, then upload**
On first BLE pairing call \`POST /v1/devices\` and keep the returned \`_id\` — that is
the \`deviceId\` every other call asks for.

**📱 NEP-LINK flow:** \`POST /v1/devices\` (type NEP-LINK) → \`POST /v1/sessions\` →
\`POST /v1/sessions/{id}/samples\` (or the one-shot \`POST /v1/sync/upload\`).

**📱 MET-LINK flow:** \`POST /v1/devices\` (type MET-LINK) → \`POST /v1/records\` →
\`POST /v1/records/{id}/measures\` (or the one-shot \`POST /v1/sync/upload\`).

While connected to the instrument, send \`PATCH /v1/sync/device-status\` about once a
minute so the dashboard shows the device as online (include GPS-bearing data in your
uploads if you want the device on the fleet map).

Live updates over WebSocket \`/v1/ws\` are **admin/JWT-only** — mobile polls
\`GET /v1/sync/download\` instead. Use the audience dropdown (top-right) to see only
one app's endpoints.
`;

async function bootstrap(): Promise<void> {
  // Month 5: crash reporting. No-op unless SENTRY_DSN is configured.
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0.1,
    });
  }

  configureCloudinary();

  // The raw Mongoose models in `src/models/*` use the DEFAULT global connection
  // (`mongoose.model(...)`), but @nestjs/mongoose connects its OWN connection via
  // `createConnection` — so the default connection is never opened and every
  // model query buffers then times out ("buffering timed out after 10000ms").
  // Connect the default connection explicitly (same URI/options the seed uses).
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('🔌 Default Mongoose connection established (raw models)');
  }

  const app = await NestFactory.create(AppModule);

  // ── Security Middleware ────────────────────────────────────────────────────
  // CSP keeps 'self' + 'unsafe-inline' so the Swagger UI (and its /api/json/*
  // spec-dropdown XHRs, via connect-src → default-src 'self') keep working.
  // HSTS + X-Frame-Options come from helmet defaults; set HSTS explicitly.
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
      hsts: { maxAge: 15552000, includeSubDomains: true },
    }),
  );

  // CORS: lock down to the configured dashboard origin(s) in production; fall
  // back to wildcard in dev. Mobile apps use the API key over Authorization
  // (not cookies), so they are unaffected by this.
  const corsOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors(
    corsOrigins.length
      ? { origin: corsOrigins, credentials: true }
      : { origin: '*', credentials: false },
  );

  // ── Request Middleware ─────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // ── Static Files ───────────────────────────────────────────────────────────
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // ── Global Prefix (health/version bypass v1 prefix) ───────────────────────
  app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });

  // ── Global Pipes ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  // ── Global Exception Filter ────────────────────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());

  // ── Swagger docs — password gate + audience dropdown ───────────────────────
  // Basic-Auth gate on the whole docs surface (every environment; fail-closed).
  // `/api` also covers the `/api/json/*` spec routes, keeping them in one
  // protection space so the browser re-sends creds to the dropdown's XHR fetches.
  const docsGuard: express.RequestHandler = (req, res, next) => {
    const user = process.env.SWAGGER_USER;
    const pass = process.env.SWAGGER_PASSWORD;
    if (!user || !pass) {
      res.status(503).send('Docs auth not configured');
      return;
    }
    const header = req.headers.authorization ?? '';
    const [scheme, b64] = header.split(' ');
    if (scheme === 'Basic' && b64) {
      const decoded = Buffer.from(b64, 'base64').toString();
      const sep = decoded.indexOf(':'); // split on first ':' so passwords may contain ':'
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (u === user && p === pass) {
        next();
        return;
      }
    }
    res
      .set('WWW-Authenticate', 'Basic realm="Observator API Docs"')
      .status(401)
      .send('Authentication required');
  };
  app.use(['/api', '/api.json'], docsGuard);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Observator Instruments — Cloud API')
    .setVersion('1.0.0')
    .setDescription(
      `## Observator Instruments Cloud Platform API\n\n` +
        `**Stack:** NestJS + TypeScript + Mongoose (MongoDB)\n\n` +
        `Use the **definition dropdown (top-right)** to view endpoints for a single ` +
        `audience: All / 📱 NEP-LINK App / 📱 MET-LINK App / 🖥️ Admin Panel.\n\n` +
        `### Authentication\nProtected endpoints require a **Bearer** token in the ` +
        `\`Authorization\` header — a per-user JWT access token (15-min expiry). ` +
        `Admin panel renews via \`POST /v1/auth/refresh\`; mobile apps via ` +
        `\`POST /v1/auth/mobile/refresh\`.\n\n` +
        `### Response Envelope\nSuccess: \`{ "data": … }\` (lists add \`"meta"\`). ` +
        `Error: \`{ "error": { "code", "message" } }\`.\n` +
        `\n### CORS / security\nBrowser access is restricted to the configured ` +
        `dashboard origin; the mobile API-key clients are unaffected.\n` +
        MOBILE_GUIDE,
    )
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Paste a JWT access token (from admin login or mobile login/signup)',
    })
    // NB: no .addServer('/v1') — the global prefix is already baked into the paths
    // (e.g. /v1/devices), and /health,/version are correctly left at the root, so
    // "Try it out" targets the docs origin directly (avoids a /v1/v1 double-prefix).
    .build();

  const fullDoc = SwaggerModule.createDocument(app, swaggerConfig);

  const specs: Record<string, OpenAPIObject> = {
    all: fullDoc,
    'nep-link': filterByConsumer(fullDoc, 'nep-link'),
    'met-link': filterByConsumer(fullDoc, 'met-link'),
    admin: filterByConsumer(fullDoc, 'admin'),
  };

  const httpAdapter = app.getHttpAdapter();
  for (const [key, doc] of Object.entries(specs)) {
    httpAdapter.get(`/api/json/${key}`, (_req: express.Request, res: express.Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(doc);
    });
  }
  // Full spec for Postman import (also behind the gate).
  httpAdapter.get('/api.json', (_req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(fullDoc);
  });

  SwaggerModule.setup('api', app, fullDoc, {
    explorer: true,
    customSiteTitle: 'Observator API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      urls: [
        { url: '/api/json/all', name: 'All Endpoints' },
        { url: '/api/json/nep-link', name: '📱 NEP-LINK App' },
        { url: '/api/json/met-link', name: '📱 MET-LINK App' },
        { url: '/api/json/admin', name: '🖥️ Admin Panel' },
      ],
    },
  });

  // ── Start Server ───────────────────────────────────────────────────────────
  const PORT = process.env.PORT ?? 3000;
  await app.listen(PORT);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Swagger UI: http://localhost:${PORT}/api`);
  console.log(`🔧 OpenAPI JSON: http://localhost:${PORT}/api.json`);
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
