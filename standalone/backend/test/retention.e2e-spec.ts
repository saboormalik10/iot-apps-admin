import 'dotenv/config';
import mongoose from 'mongoose';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetRecord } from '../src/models/MetRecord';
import { MetDailySummary } from '../src/models/MetDailySummary';
import { MetRawSample } from '../src/models/MetRawSample';

/**
 * "Keep it indefinitely cos this is their local pc" — the client, 22 Sep 2026.
 *
 * Nothing that holds a reading may carry a TTL index. The cloud copy this was
 * forked from expired raw samples after seven days, which is right for a hosted
 * service paying for the disk and wrong here: the site guide tells the
 * technician that readings are never deleted. The index was once removed and
 * came back, so this asserts it for every weather collection, in the schema AND
 * in the live database.
 */
describe('weather data is kept indefinitely', () => {
  const models = [
    ['minute records', MetMeasure],
    ['day records', MetRecord],
    ['daily summaries', MetDailySummary],
    ['raw per-second samples', MetRawSample],
  ] as const;

  let app: INestApplication;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    // Booting the app is the point of the second case below: a database created
    // before this change still has the old TTL, and starting the service is what
    // must drop it (FirstRunService.ensureIndexes → syncIndexes).
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 60_000);
  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it.each(models)('%s carry no expiry in the schema', (_label, model) => {
    for (const [fields, options] of model.schema.indexes()) {
      expect({ fields, ...options }).not.toHaveProperty('expireAfterSeconds');
    }
  });

  it.each(models)('%s lose any expiry the database already had, when the service starts', async (_label, model) => {
    const indexes = await model.collection.indexes().catch(() => []);
    const expiring = indexes.filter((i) => 'expireAfterSeconds' in i).map((i) => i.name);
    expect(expiring).toEqual([]);
  });
});
