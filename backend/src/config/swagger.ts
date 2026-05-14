import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import fs from 'fs';

// __dirname = .../src/config (dev) or .../dist/config (prod)
const srcOrDist = path.resolve(__dirname, '..');

export const swaggerDefinition: swaggerJsdoc.OAS3Definition = {
  openapi: '3.0.3',
    info: {
      title: 'Observator Instruments — Cloud API',
      version: '1.0.0',
      description: `
## Observator Instruments Cloud Platform API

**Project:** MET-LINK + NEP-LINK Cloud Platform + Admin Dashboard  
**Client:** Observator Instruments (AU / NL)  
**Stack:** Node.js + TypeScript + Express + Mongoose (MongoDB)

### Authentication
All protected endpoints require a **Bearer JWT** in the \`Authorization\` header:
\`\`\`
Authorization: Bearer <accessToken>
\`\`\`
Access tokens expire in **15 minutes**. Use \`POST /v1/auth/refresh\` to get a new one using your refresh token (30-day expiry).

### Response Envelope
All responses follow a consistent envelope:
- **Success:** \`{ "data": ..., "meta": { "page": 1, "limit": 20, "total": 100 } }\`
- **Error:** \`{ "error": { "code": "NOT_FOUND", "message": "Session not found" } }\`
      `,
      contact: {
        name: 'Veldora Studio',
        email: 'dev@veldora.studio',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/v1',
        description: 'Local development',
      },
      {
        url: 'https://api.observator.railway.app/v1',
        description: 'Production (Railway)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token (15-minute expiry). Obtain via POST /v1/auth/login.',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'NOT_FOUND' },
                message: { type: 'string', example: 'Resource not found' },
              },
            },
          },
        },
        UserObject: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0d' },
            email: { type: 'string', format: 'email', example: 'admin@observator.com' },
            firstName: { type: 'string', example: 'Dana' },
            lastName: { type: 'string', example: 'Galbraith' },
            role: { type: 'string', enum: ['admin', 'operator', 'viewer'], example: 'admin' },
            organizationId: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0e' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/UserObject' },
                accessToken: {
                  type: 'string',
                  description: 'JWT access token (15-minute expiry)',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
                refreshToken: {
                  type: 'string',
                  description: '64-char hex raw refresh token (30-day expiry). Also set as httpOnly cookie.',
                  example: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
                },
              },
            },
          },
        },
        Organization: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0e' },
            name: { type: 'string', example: 'Observator Instruments AU' },
            slug: { type: 'string', example: 'observator-instruments-au' },
            contactEmail: { type: 'string', format: 'email', example: 'info@observator.com' },
            country: { type: 'string', example: 'AU' },
            timezone: { type: 'string', example: 'Australia/Melbourne' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Device: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0f' },
            organizationId: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0e' },
            bleId: { type: 'string', example: 'MET-00:11:22:33:44:55' },
            name: { type: 'string', example: 'MET-LINK-001' },
            customName: { type: 'string', nullable: true, example: null },
            type: { type: 'string', enum: ['MET-LINK', 'NEP-LINK'], example: 'MET-LINK' },
            serialNo: { type: 'string', nullable: true, example: 'SN-001' },
            firmwareVersion: { type: 'string', nullable: true, example: '2.1.4' },
            lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
            lastBatteryPct: { type: 'number', nullable: true, example: 87 },
            isOnline: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        PaginatedMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 100 },
            pages: { type: 'integer', example: 5 },
          },
        },
        NepSession: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c11' },
            id: { type: 'string', format: 'uuid', description: 'UUID v4 from mobile app — idempotency key', example: '550e8400-e29b-41d4-a716-446655440000' },
            organizationId: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0e' },
            deviceId: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0f' },
            deviceName: { type: 'string', example: 'NEP-LINK-001' },
            startTimestamp: { type: 'integer', description: 'Unix ms', example: 1746057600000 },
            endTimestamp: { type: 'integer', nullable: true, example: 1746061200000 },
            timezoneName: { type: 'string', example: 'Australia/Melbourne' },
            timezoneOffset: { type: 'integer', example: 10 },
            probeRange: {
              type: 'string',
              nullable: true,
              enum: ['R1', 'R2', 'R3', null],
              description: 'Derived from turbidity values: R1 (<10 NTU), R2 (10–1000 NTU), R3 (>1000 NTU)',
              example: 'R2',
            },
            turbidityEnabled: { type: 'boolean', example: true },
            temperatureEnabled: { type: 'boolean', example: true },
            locationEnabled: { type: 'boolean', example: false },
            comment: { type: 'string', example: 'River sampling at intake' },
            sampleCount: { type: 'integer', example: 3600 },
            turbidityAvg: { type: 'number', nullable: true, example: 245.67 },
            turbidityMin: { type: 'number', nullable: true, example: 10.2 },
            turbidityMax: { type: 'number', nullable: true, example: 980.5 },
            temperatureAvg: { type: 'number', nullable: true, example: 18.4 },
            temperatureMin: { type: 'number', nullable: true, example: 16.1 },
            temperatureMax: { type: 'number', nullable: true, example: 21.3 },
            hasTempData: { type: 'boolean', example: true },
            hasGpsData: { type: 'boolean', example: false },
            isDemoMode: { type: 'boolean', example: false },
            syncedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        NepSampleInput: {
          type: 'object',
          required: ['timestamp'],
          properties: {
            timestamp: { type: 'integer', description: 'Unix ms', example: 1746057601000 },
            turbidityValue: { type: 'number', nullable: true, example: 245.67, description: 'NTU' },
            temperatureValue: { type: 'number', nullable: true, example: 18.4, description: '°C' },
            probeRange: { type: 'string', nullable: true, enum: ['R1', 'R2', 'R3', null], example: 'R2' },
            locationLat: { type: 'number', nullable: true, example: -37.8136 },
            locationLng: { type: 'number', nullable: true, example: 144.9631 },
            batteryLevel: { type: 'integer', nullable: true, example: 85, description: '0–100 %' },
            batteryRawVoltage: { type: 'number', nullable: true, example: 3840, description: 'mV' },
            batteryCharging: { type: 'boolean', nullable: true, example: false },
            demoModeEnabled: { type: 'boolean', nullable: true, example: false },
          },
        },
        MetRecord: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c20' },
            organizationId: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0e' },
            deviceId: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0f' },
            deviceName: { type: 'string', example: 'MET-LINK-001' },
            urlMaps: { type: 'string', nullable: true, example: '-37.8136,144.9631' },
            dateStart: { type: 'string', example: '2026-05-01 14:32:01' },
            dateEnd: { type: 'string', nullable: true, example: '2026-05-01 15:45:22' },
            dateStartMs: { type: 'integer', description: 'Unix ms', example: 1746103921000 },
            dateEndMs: { type: 'integer', nullable: true, example: 1746108322000 },
            comment: { type: 'string', example: 'Calibration check at rooftop station' },
            measureCount: { type: 'integer', example: 4401 },
            hasHeaderRow: { type: 'boolean', example: true },
            localRecordId: { type: 'integer', nullable: true, example: 42, description: 'Original SQLite id_record — used for deduplication on re-sync' },
            isDemoMode: { type: 'boolean', example: false },
            syncedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        MetRecordInput: {
          type: 'object',
          required: ['deviceId', 'dateStart'],
          properties: {
            deviceId: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0f' },
            deviceName: { type: 'string', example: 'MET-LINK-001' },
            dateStart: { type: 'string', example: '2026-05-01 14:32:01', description: 'Human-readable start time from the app' },
            dateEnd: { type: 'string', nullable: true, example: '2026-05-01 15:45:22' },
            comment: { type: 'string', example: 'Field notes' },
            urlMaps: { type: 'string', nullable: true, example: '-37.8136,144.9631' },
            localRecordId: { type: 'integer', nullable: true, example: 42, description: 'Original SQLite id_record — idempotency key on re-sync' },
            isDemoMode: { type: 'boolean', example: false },
          },
        },
        MetMeasureInput: {
          type: 'object',
          required: ['dataSentence', 'timeStamp'],
          properties: {
            dataSentence: {
              type: 'string',
              description: 'Raw CSV triplets from the MET-LINK SQLite measure.dataSentence field. Format: Value,Unit,Description,Value,Unit,Description,...,PhoneLat,PhoneLng. The first row is the header row whose triplets contain literal "Unit" and "Description" placeholders.',
              example: '12.5,m/s,relative,045.0,°,relative,23.4,°C,TEMP,63.5,%,RH,1.025,B,PRESS,-37.8136,144.9631',
            },
            timeStamp: {
              type: 'string',
              description: 'Human-readable timestamp from SQLite: "YYYY-MM-DD HH:mm:ss"',
              example: '2026-05-01 14:32:01',
            },
          },
        },
        MetMeasure: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            recordId: { type: 'string' },
            organizationId: { type: 'string' },
            rowType: { type: 'string', enum: ['header', 'data'] },
            dataSentence: { type: 'string' },
            timeStamp: { type: 'string', example: '2026-05-01 14:32:01' },
            timestampMs: { type: 'integer', example: 1746103921000 },
            windSpeedMs: { type: 'number', nullable: true, example: 12.5, description: 'm/s — base unit for all wind speed fields' },
            windSpeedKmh: { type: 'number', nullable: true, example: 45.0 },
            windSpeedKnots: { type: 'number', nullable: true, example: 24.3 },
            windSpeedRelMs: { type: 'number', nullable: true, example: 12.5, description: 'Relative-reference wind speed (MWV R)' },
            windSpeedTrueMs: { type: 'number', nullable: true, example: 11.8, description: 'True-north wind speed (MWV T)' },
            windDirRelDeg: { type: 'number', nullable: true, example: 45.0 },
            windDirTrueDeg: { type: 'number', nullable: true, example: 52.0 },
            tempC: { type: 'number', nullable: true, example: 23.4 },
            humidityPct: { type: 'number', nullable: true, example: 63.5 },
            pressureHpa: { type: 'number', nullable: true, example: 1025.2, description: 'hPa — converted from XDR bar value on ingest' },
            precipMm: { type: 'number', nullable: true, example: 0.0 },
            precipRateMmHr: { type: 'number', nullable: true, example: 0.0 },
            solarWm2: { type: 'number', nullable: true, example: 450.0 },
            voltageV: { type: 'number', nullable: true, example: 13.3, description: 'DC/solar panel input voltage' },
            batteryVoltageV: { type: 'number', nullable: true, example: 12.6, description: 'Battery bank voltage (second V transducer)' },
            currentA: { type: 'number', nullable: true, example: 1.2 },
            dewPointC: { type: 'number', nullable: true, example: 16.2 },
            qnhHpa: { type: 'number', nullable: true, example: 1023.5 },
            qfeHpa: { type: 'number', nullable: true, example: 1021.8 },
            gpsLat: { type: 'number', nullable: true, example: -37.8136 },
            gpsLng: { type: 'number', nullable: true, example: 144.9631 },
            gpsAltM: { type: 'number', nullable: true, example: 545.4 },
            gpsSatellites: { type: 'integer', nullable: true, example: 8 },
            gpsHorDilution: { type: 'number', nullable: true, example: 0.9 },
            gpsGeoidalSepM: { type: 'number', nullable: true, example: 46.9 },
            gpsQuality: { type: 'integer', nullable: true, example: 1, description: '0=no fix, 1=GPS fix, 2=DGPS' },
            phoneLat: { type: 'number', nullable: true, example: -37.8136 },
            phoneLng: { type: 'number', nullable: true, example: 144.9631 },
            isDemoMode: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        NepSample: {
          allOf: [
            { $ref: '#/components/schemas/NepSampleInput' },
            {
              type: 'object',
              properties: {
                _id: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c12' },
                sessionId: { type: 'string', format: 'uuid' },
                organizationId: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
        FileObject: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c20' },
            sessionId: { type: 'string', format: 'uuid', nullable: true },
            recordId: { type: 'string', nullable: true },
            organizationId: { type: 'string' },
            fileType: { type: 'string', enum: ['map', 'photo', 'thumbnail', 'csv'], example: 'photo' },
            storageKey: { type: 'string', example: 'nep-files/orgId/sessionId/photo/1234567890_photo.jpg' },
            filename: { type: 'string', example: '1234567890_photo.jpg' },
            mimeType: { type: 'string', example: 'image/jpeg' },
            sizeBytes: { type: 'integer', example: 245678 },
            url: { type: 'string', format: 'uri', description: 'Direct download URL', example: 'http://localhost:3000/uploads/nep-files/orgId/sessionId/photo/1234567890_photo.jpg' },
            capturedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        SyncNepSessionInput: {
          type: 'object',
          required: ['type', 'sessionId', 'deviceId', 'startTimestamp'],
          properties: {
            type: { type: 'string', enum: ['nep_session'], example: 'nep_session' },
            sessionId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            deviceId: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0f' },
            deviceName: { type: 'string', example: 'NEP-LINK-001' },
            startTimestamp: { type: 'integer', description: 'Unix ms', example: 1746057600000 },
            endTimestamp: { type: 'integer', nullable: true },
            timezoneName: { type: 'string', example: 'Australia/Melbourne' },
            timezoneOffset: { type: 'integer', example: 10 },
            turbidityEnabled: { type: 'boolean', example: true },
            temperatureEnabled: { type: 'boolean', example: true },
            locationEnabled: { type: 'boolean', example: false },
            comment: { type: 'string', example: '' },
            isDemoMode: { type: 'boolean', example: false },
            samples: { type: 'array', items: { $ref: '#/components/schemas/NepSampleInput' }, maxItems: 7200 },
          },
        },
        SyncMetRecordInput: {
          type: 'object',
          required: ['type', 'deviceId', 'dateStart'],
          properties: {
            type: { type: 'string', enum: ['met_record'], example: 'met_record' },
            deviceId: { type: 'string', example: '664a1f2e3c4d5e6f7a8b9c0f' },
            deviceName: { type: 'string', example: 'MET-LINK-001' },
            dateStart: { type: 'string', example: '2026-05-01 14:00:00' },
            dateEnd: { type: 'string', nullable: true, example: '2026-05-01 15:00:00' },
            comment: { type: 'string', example: '' },
            localRecordId: { type: 'integer', nullable: true, example: 42, description: 'SQLite id_record — idempotency key' },
            urlMaps: { type: 'string', nullable: true },
            isDemoMode: { type: 'boolean', example: false },
            measures: { type: 'array', items: { $ref: '#/components/schemas/MetMeasureInput' }, maxItems: 10000 },
          },
        },
      },
      responses: {
        ValidationError: {
          description: 'Validation error — missing or invalid request fields',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                error: { code: 'VALIDATION_ERROR', message: 'email and password are required' },
              },
            },
          },
        },
        Unauthorized: {
          description: 'Missing or invalid access token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } },
            },
          },
        },
        Forbidden: {
          description: 'Insufficient role / permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: { code: 'FORBIDDEN', message: 'Requires role: admin' } },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: { code: 'NOT_FOUND', message: 'Device not found' } },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication — register, login, token refresh, password reset' },
      { name: 'Devices', description: 'Device registry — register and manage MET-LINK and NEP-LINK hardware' },
      { name: 'MET Records', description: 'MET-LINK meteorological logging records — upload, query and export weather station data (wind, temperature, humidity, pressure, precipitation, solar, GPS)' },
      { name: 'NEP Sessions', description: 'NEP-LINK water quality logging sessions — upload, query and export turbidity data' },
      { name: 'Files', description: 'File uploads — photos and map screenshots for sessions (NEP) and records (MET). Max 10 MB. Served from /uploads/.' },
      { name: 'Sync', description: 'Unified sync API — idempotent upload and download for both MET-LINK and NEP-LINK mobile apps' },
      { name: 'System', description: 'Health check and version endpoints' },
    ],
};

// In production: load the pre-generated JSON baked into the Docker image at build time.
// Using require() rather than fs.readFileSync — more reliable in Alpine containers.
// Falls back to dynamic ts-node generation for local dev (no dist/ pre-gen file).
const preGenPath = path.resolve(__dirname, '..', 'swagger-spec.json');

export const swaggerSpec: object = (() => {
  // Try pre-generated file first (always present in Docker image after npm run build)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const spec = require(preGenPath) as Record<string, unknown>;
    const count = Object.keys((spec.paths ?? {}) as object).length;
    console.log(`📋 Swagger: loaded pre-gen spec (${count} endpoints) from ${preGenPath}`);
    if (count > 0) return spec;
    console.warn('⚠️  Swagger: pre-gen spec has 0 endpoints — falling back to dynamic scan');
  } catch {
    console.log(`📋 Swagger: pre-gen file not found at ${preGenPath} — using dynamic scan`);
  }

  // Fallback: dynamic scan (local ts-node dev)
  const ext = process.env.NODE_ENV === 'production' ? 'js' : 'ts';
  const spec = swaggerJsdoc({
    definition: swaggerDefinition,
    apis: [
      path.join(srcOrDist, '**', `*.routes.${ext}`),
      path.join(srcOrDist, `app.${ext}`),
    ],
  });
  const count = Object.keys(((spec as Record<string, unknown>).paths ?? {}) as object).length;
  console.log(`📋 Swagger: dynamic scan found ${count} endpoints`);
  return spec;
})();
