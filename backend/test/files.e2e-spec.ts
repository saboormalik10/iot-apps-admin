import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';
import { User } from '../src/models/User';
import { MetRecord } from '../src/models/MetRecord';
import { NepSession } from '../src/models/NepSession';
import { MetPicture } from '../src/models/MetPicture';
import { NepFile } from '../src/models/NepFile';

// Mock Cloudinary so uploads never hit the network in CI. The fake
// `upload_stream` consumes the buffer then resolves with a Cloudinary-shaped result.
jest.mock('../src/config/cloudinary', () => {
  const { Writable } = require('stream');
  return {
    configureCloudinary: jest.fn(),
    isCloudinaryConfigured: () => true,
    cloudinary: {
      uploader: {
        upload_stream: (opts: { folder: string; public_id: string }, cb: (e: unknown, r: unknown) => void) => {
          const sink = new Writable({ write(_c: Buffer, _e: string, done: () => void) { done(); } });
          sink.on('finish', () =>
            cb(null, {
              public_id: `${opts.folder}/${opts.public_id}`,
              secure_url: `https://res.cloudinary.com/demo/image/upload/${opts.public_id}`,
              resource_type: 'image',
            }),
          );
          return sink;
        },
        destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
      },
    },
  };
});

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('Files / Cloudinary media (e2e)', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let token: string;
  let recordId: string | null = null;
  let sessionId: string | null = null;
  const createdPictureIds: string[] = [];
  const createdFileIds: string[] = [];

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const admin = await User.findOne({ email: 'admin@observator.com' });
    if (!admin) throw new Error('Seed first: admin@observator.com missing');

    const record = await MetRecord.findOne({ organizationId: admin.organizationId, deletedAt: null });
    recordId = record ? (record._id as mongoose.Types.ObjectId).toString() : null;
    const session = await NepSession.findOne({ organizationId: admin.organizationId, deletedAt: null });
    sessionId = session ? session.id : null;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    httpServer = app.getHttpServer();

    const login = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    token = login.body.data?.accessToken ?? login.body.accessToken;
  });

  afterAll(async () => {
    if (createdPictureIds.length) {
      await MetPicture.deleteMany({ _id: { $in: createdPictureIds.map((id) => new mongoose.Types.ObjectId(id)) } });
    }
    if (createdFileIds.length) {
      await NepFile.deleteMany({ _id: { $in: createdFileIds.map((id) => new mongoose.Types.ObjectId(id)) } });
    }
    await app?.close();
    await mongoose.disconnect();
  });

  it('POST /v1/records/:id/pictures → stores on Cloudinary and returns a cloudinary url', async () => {
    expect(recordId).toBeTruthy(); // seed must have run
    const res = await request(httpServer)
      .post(`/v1/records/${recordId}/pictures`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, { filename: 'shot.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.url).toContain('res.cloudinary.com');
    expect(res.body.data.storageKey).toContain('met-pictures/');
    createdPictureIds.push(res.body.data._id);
  });

  it('POST /v1/sessions/:id/files → stores on Cloudinary and returns a cloudinary url', async () => {
    expect(sessionId).toBeTruthy(); // seed must have run
    const res = await request(httpServer)
      .post(`/v1/sessions/${sessionId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .field('fileType', 'photo')
      .attach('file', PNG, { filename: 'map.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.url).toContain('res.cloudinary.com');
    createdFileIds.push(res.body.data._id);
  });

  it('rejects an unsupported file type → 4xx', async () => {
    const res = await request(httpServer)
      .post(`/v1/records/${recordId}/pictures`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
