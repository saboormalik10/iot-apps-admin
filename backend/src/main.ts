import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import * as express from 'express';
import * as path from 'path';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ── Security Middleware ────────────────────────────────────────────────────
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
  app.enableCors({ origin: '*', credentials: false });

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

  // ── Swagger ────────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Observator Instruments — Cloud API')
    .setVersion('1.0.0')
    .setDescription(
      `## Observator Instruments Cloud Platform API\n\n` +
        `**Stack:** NestJS + TypeScript + Mongoose (MongoDB)\n\n` +
        `### Authentication\nAll protected endpoints require a **Bearer JWT** in the \`Authorization\` header.\n` +
        `Access tokens expire in **15 minutes**. Use \`POST /v1/auth/refresh\` to renew.`,
    )
    .addBearerAuth()
    .addServer('/v1', 'API base (v1)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'Observator API Docs',
    swaggerOptions: { persistAuthorization: true },
  });

  // Raw OpenAPI JSON for tooling (Postman import etc.)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api.json', (_req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(document);
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
