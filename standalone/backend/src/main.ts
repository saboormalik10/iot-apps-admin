import 'dotenv/config';
import dns from 'dns';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException, ValidationError } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import compression from 'compression';
import * as express from 'express';
import { uploadsDir } from './config/data-dir';
import mongoose from 'mongoose';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// Some hosts (e.g. Render) advertise IPv6 but outbound IPv6 isn't actually
// routable — Node's DNS lookups then return an IPv6 address that connects fail
// against with ENETUNREACH (hit this against Gmail SMTP). Prefer IPv4 results
// process-wide as the general fix; the mailer also pins `family: 4` directly.
dns.setDefaultResultOrder('ipv4first');

async function bootstrap(): Promise<void> {
  // The raw Mongoose models in `src/models/*` use the DEFAULT global connection
  // (`mongoose.model(...)`), but @nestjs/mongoose connects its OWN connection via
  // `createConnection` — so the default connection is never opened and every
  // model query buffers then times out ("buffering timed out after 10000ms").
  // Connect the default connection explicitly (same URI/options the seed uses).
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      /**
       * autoIndex OFF in production, ON everywhere else.
       *
       * Two reasons, both observed (M23 W1/W4):
       *  1. It RESURRECTS dropped indexes. An index removed from the database
       *     comes straight back on the next connect unless it is also removed
       *     from the schema — which is how a deliberate index change silently
       *     undid itself.
       *  2. It costs 13 `createIndexes` round trips at cold start, one per
       *     model, before the first request is served.
       *
       * Indexes in production are applied by the migration scripts, which is
       * where a change can be reviewed and rolled back.
       */
      autoIndex: process.env.NODE_ENV !== 'production',
    });
    console.log('🔌 Default Mongoose connection established (raw models)');
  }

  const app = await NestFactory.create(AppModule);

  /**
   * Trust proxy — REQUIRED for per-IP rate limiting to mean anything (M24 W1).
   *
   * Behind a load balancer every request arrives from the balancer's address, so
   * `req.ip` is the same for everybody. Rate limiting then buckets the whole
   * customer base together: one noisy client 429s everyone, and an attacker is
   * throttled by the traffic of innocent users rather than their own.
   *
   * It is deliberately NOT `true`. `trust proxy: true` makes Express believe the
   * left-most `X-Forwarded-For` value, which the CLIENT supplies — so an attacker
   * spoofs a new IP per request and skips the limiter entirely. Setting the HOP
   * COUNT instead makes Express read the address the proxy itself appended.
   *
   * TRUST_PROXY = number of proxies in front of this app (1 for a single ALB).
   * Unset means 0 — correct for direct exposure, and safe by default.
   */
  // STANDALONE: the API listens on this PC only, behind the portal, which stamps
  // the browser's address (web/server.mjs) — so one hop is the default. Listening
  // on the network (API_HOST not loopback), nothing vouches for the header: 0.
  const apiHost = process.env.API_HOST?.trim() || '127.0.0.1';
  const loopback = apiHost === '127.0.0.1' || apiHost === 'localhost' || apiHost === '::1';
  const hops = Number.parseInt(process.env.TRUST_PROXY ?? (loopback ? '1' : '0'), 10);
  if (Number.isFinite(hops) && hops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', hops);
    console.log(`🔒 trust proxy: ${hops} hop(s)`);
  }

  // ── Response Compression ───────────────────────────────────────────────────
  // gzip every compressible response (JSON/text) above ~1 KB, so a fat
  // aggregated payload (e.g. met/history-multi) is small on its way to the web
  // app's server-side proxy.
  app.use(compression());

  // ── Security Middleware ────────────────────────────────────────────────────
  // CSP keeps 'self' + 'unsafe-inline' so the Swagger UI keeps working. Its
  // assets are served from this process, not a CDN — the site PC may be offline.
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

  // CORS: lock down to the configured web app origin(s) in production; fall
  // back to wildcard in dev.
  const corsOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Fail CLOSED in production. An unset CORS_ORIGIN previously fell back to a
  // wildcard, so a deploy that simply forgot the variable would silently serve
  // every origin — a misconfiguration that looks like nothing is wrong.
  if (!corsOrigins.length && process.env.NODE_ENV === 'production') {
    console.error('❌ CORS_ORIGIN must be set in production (refusing to start with a wildcard).');
    process.exit(1);
  }
  app.enableCors(
    corsOrigins.length
      ? { origin: corsOrigins, credentials: true }
      // Dev only, and never with credentials — a wildcard plus credentials is
      // rejected by browsers anyway, and would be a cross-site read if it weren't.
      : { origin: '*', credentials: false },
  );

  // ── Request Middleware ─────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // ── Uploaded files (branding logo) ─────────────────────────────────────────
  // Under `/v1/uploads` so the web app's `/api/*` proxy reaches them: the browser
  // never talks to the API directly, and in the Windows install the API listens
  // on localhost only. `index: false` — a folder URL must never list its files.
  app.use('/v1/uploads', express.static(uploadsDir(), { index: false, dotfiles: 'deny', fallthrough: false }));

  // ── Global Prefix (health/version bypass v1 prefix) ───────────────────────
  app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });

  // ── Global Pipes ───────────────────────────────────────────────────────────
  // `exceptionFactory` is required, not cosmetic: Nest's default validation
  // response is { statusCode, message: [...], error: 'Bad Request' }. That object
  // has an `error` key, so AllExceptionsFilter passes it through verbatim — and
  // clients reading `error.code` / `error.message` would see `undefined`. Collapse it into the standard envelope instead.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      exceptionFactory: (errors: ValidationError[]) => {
        const flatten = (errs: ValidationError[], prefix = ''): string[] =>
          errs.flatMap((e) => {
            const path = prefix ? `${prefix}.${e.property}` : e.property;
            const own = Object.values(e.constraints ?? {}).map((m) =>
              m.replace(new RegExp(`^${e.property}\\b`), path),
            );
            const children = e.children?.length ? flatten(e.children, path) : [];
            return [...own, ...children];
          });
        const message = flatten(errors).join('; ') || 'Validation failed';
        return new BadRequestException({ error: { code: 'VALIDATION_ERROR', message } });
      },
    }),
  );

  // ── Global Exception Filter ────────────────────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());

  // ── Swagger docs — password gate ───────────────────────────────────────────
  // Basic-Auth gate on the whole docs surface (every environment; fail-closed).
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
    .setTitle('Observator Standalone — API')
    .setVersion('1.0.0')
    .setDescription(
      `## Observator Standalone API\n\n` +
        `The API behind the site portal. The portal is its only intended client.\n\n` +
        `### Authentication\nProtected endpoints require a **Bearer** token in the ` +
        `\`Authorization\` header — a per-user JWT access token (15-min expiry), ` +
        `renewed via \`POST /v1/auth/refresh\`.\n\n` +
        `### Response Envelope\nSuccess: \`{ "data": … }\` (lists add \`"meta"\`). ` +
        `Error: \`{ "error": { "code", "message" } }\`.\n`,
    )
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Paste a JWT access token from POST /v1/auth/login',
    })
    // NB: no .addServer('/v1') — the global prefix is already baked into the paths
    // (e.g. /v1/devices), and /health,/version are correctly left at the root, so
    // "Try it out" targets the docs origin directly (avoids a /v1/v1 double-prefix).
    .build();

  const fullDoc = SwaggerModule.createDocument(app, swaggerConfig);

  // Full spec for Postman import (also behind the gate).
  app.getHttpAdapter().get('/api.json', (_req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(fullDoc);
  });

  // Swagger UI's CSS and JS come off disk (swagger-ui-dist), served by
  // SwaggerModule itself. The cloud project redirected them to a CDN to work
  // around Vercel; a site PC may have no internet, so they stay local here.
  SwaggerModule.setup('api', app, fullDoc, {
    customSiteTitle: 'Observator Standalone API Docs',
    swaggerOptions: { persistAuthorization: true },
  });

  // ── Start Server ───────────────────────────────────────────────────────────
  const PORT = process.env.PORT ?? 3000;
  // This PC only, by default. People on the site network reach the portal, and
  // the portal's own server passes the live socket through (web/server.mjs), so
  // nothing else needs the API — and the sensor stream has its own listener.
  const HOST = process.env.API_HOST?.trim() || '127.0.0.1';
  // Stop cleanly when Windows stops the service (WinSW sends Ctrl+C → SIGINT):
  // without this Nest never runs its shutdown, and the stream's part-finished
  // minute — written by StreamService.onModuleDestroy — was lost on every restart,
  // upgrade and reboot.
  app.enableShutdownHooks();
  await app.listen(PORT, HOST);
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📚 Swagger UI: http://localhost:${PORT}/api`);
  console.log(`🔧 OpenAPI JSON: http://localhost:${PORT}/api.json`);
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
