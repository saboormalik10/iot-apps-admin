import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { StreamTypesService } from '../src/provision/stream-types.service';
import { StreamType } from '../src/models/StreamType';
import { MetMeasure } from '../src/models/MetMeasure';

/**
 * Stream types and the sample preview (M22 W3).
 *
 * The preview exists so an operator can answer "will this file work?" BEFORE a
 * customer starts sending. The two properties that matter are that it writes
 * nothing, and that it NAMES the columns it ignored — a silently dropped column
 * is exactly the mystery this screen is meant to prevent.
 */

jest.setTimeout(60_000);

const CSV = [
  'timestamp,direction,speed,units,status',
  '2026-08-25T11:19:00+10:00,350,0.50,K,A',
  '2026-08-25T11:19:01+10:00,349,0.52,K,A',
].join('\r\n') + '\r\n';

describe('StreamTypesService', () => {
  const service = new StreamTypesService();

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  });
  afterAll(async () => {
    await StreamType.deleteMany({ key: /^tt-/ });
    await mongoose.disconnect();
  });

  describe('list', () => {
    it('joins the configured type with its installed parser', async () => {
      const met = (await service.list()).find((t) => t.key === 'met-csv');
      expect(met).toBeDefined();
      expect(met!.parserAvailable).toBe(true);
      expect(met!.columns.length).toBeGreaterThan(0);
    });

    it('hides the internal `__` columns from the operator', async () => {
      const met = (await service.list()).find((t) => t.key === 'met-csv')!;
      expect(met.columns.some((c) => c.field.startsWith('__'))).toBe(false);
    });

    it('publishes the aliases, so a header can be checked before going live', async () => {
      const met = (await service.list()).find((t) => t.key === 'met-csv')!;
      const dir = met.columns.find((c) => c.field === 'windDirRelDeg')!;
      expect(dir.aliases).toEqual(expect.arrayContaining(['direction', 'direction_deg']));
    });

    it('FLAGS a type whose parser is not installed', async () => {
      // It would accept stations and then reject every file they send. Surfacing
      // it here beats discovering it from a quarantine folder.
      await StreamType.create({ key: `tt-orphan-${Date.now()}`, parserKey: 'no-such-parser', name: 'Orphan' });
      const orphan = (await service.list()).find((t) => t.parserKey === 'no-such-parser');
      expect(orphan!.parserAvailable).toBe(false);
    });

    it('counts the stations using each type', async () => {
      const met = (await service.list()).find((t) => t.key === 'met-csv')!;
      expect(met.stationCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('preview', () => {
    it('reports what would be stored', async () => {
      const r = await service.preview('met-csv', CSV, 'WindSonic_20260825_1119.csv');
      expect(r.ok).toBe(true);
      expect(r.totalRows).toBe(2);
      expect(r.sampleRows[0].windDirRelDeg).toBe(350);
      expect(r.sensorsSeen).toEqual(expect.arrayContaining(['wind_speed', 'wind_dir']));
    });

    it('WRITES NOTHING', async () => {
      // The whole point. If a preview stored rows, an operator experimenting with
      // a customer's sample would be polluting that customer's data.
      const before = await MetMeasure.countDocuments({});
      await service.preview('met-csv', CSV);
      expect(await MetMeasure.countDocuments({})).toBe(before);
    });

    it('says so in the payload, so the UI can repeat it', async () => {
      expect((await service.preview('met-csv', CSV)).persisted).toBe(false);
    });

    it('NAMES the columns it ignored', async () => {
      // A silently dropped column is precisely the mystery this screen prevents:
      // "why is my salinity sensor missing from the dashboard?"
      const withExtra = CSV.replace('status', 'status,salinity').replace(/,A\r\n/g, ',A,35\r\n');
      const r = await service.preview('met-csv', withExtra);
      expect(r.ignoredColumns).toContain('salinity');
      expect(r.recognisedColumns).toContain('direction');
    });

    it('reports a file it cannot read, rather than accepting it', async () => {
      const r = await service.preview('met-csv', 'this is not a csv at all');
      expect(r.ok).toBe(false);
      expect(r.rejectReason).toBeTruthy();
    });

    it('treats a pasted sample as COMPLETE, unlike an SFTP file', async () => {
      // No trailing newline: from the agent that means the logger was still
      // writing, but a pasted sample is whole by definition.
      const noNewline = CSV.trimEnd();
      expect((await service.preview('met-csv', noNewline)).totalRows).toBe(2);
    });

    it('refuses an empty sample', async () => {
      await expect(service.preview('met-csv', '   ')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses an unknown stream type', async () => {
      await expect(service.preview('water-quality', CSV)).rejects.toMatchObject({ code: 'UNKNOWN_STREAM_TYPE' });
    });

    it('refuses a type whose parser is missing, naming it', async () => {
      const key = `tt-noparser-${Date.now()}`;
      await StreamType.create({ key, parserKey: 'gone', name: 'Gone' });
      await expect(service.preview(key, CSV)).rejects.toMatchObject({ code: 'PARSER_UNAVAILABLE' });
    });

    it('caps the rows returned, so a big sample cannot become a data dump', async () => {
      const many = ['timestamp,direction,speed,units,status']
        .concat(Array.from({ length: 50 }, (_, i) => `2026-08-25T11:${String(20 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}+10:00,350,0.5,K,A`))
        .join('\r\n') + '\r\n';
      const r = await service.preview('met-csv', many);
      expect(r.totalRows).toBe(50);
      expect(r.sampleRows.length).toBeLessThanOrEqual(10);
    });
  });

  describe('setEnabled', () => {
    it('toggles a type', async () => {
      const t = await StreamType.create({ key: `tt-toggle-${Date.now()}`, parserKey: 'met-csv', name: 'Toggle' });
      expect((await service.setEnabled(String(t._id), false)).isEnabled).toBe(false);
      expect((await service.setEnabled(String(t._id), true)).isEnabled).toBe(true);
    });

    it('404s an unknown id', async () => {
      await expect(service.setEnabled(String(new Types.ObjectId()), true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(service.setEnabled('not-an-id', true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
