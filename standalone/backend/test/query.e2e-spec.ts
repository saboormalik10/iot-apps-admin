import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { IngestService } from '../src/ingest/ingest.service';
import type { ParsedMetRow } from '../src/ingest/met-row';
import { rainSummary } from '../src/query/rain-totals';
import { convertUnit } from '../src/analytics/analytics.util';
import { Device } from '../src/models/Device';
import { Organization } from '../src/models/Organization';
import { User } from '../src/models/User';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetDailySummary } from '../src/models/MetDailySummary';

/**
 * The query screen and the rain figures, against data whose answers are known.
 *
 * Four hours on 1 Sep 2026 in the seeded organisation's timezone (Melbourne, +10,
 * no daylight saving yet), one record a minute:
 *
 *   07:00–07:59  wind ~5 m/s, ~17 °C, no rain
 *   08:00–08:04  1.0 mm of rain (0.2 a minute)       wind ~10 m/s, ~18 °C
 *   09:30        another 0.4 mm                      wind ~10 m/s, ~19 °C
 *   10:00–10:59  dry                                 wind ~5 m/s, ~20 °C
 *
 * Every level wobbles by a few hundredths minute to minute and averages out
 * exactly: a value held perfectly flat for hours is what QC's persistence check
 * rightly calls a stuck sensor, and it would blank it.
 *
 * So: hourly rain 0 / 1.0 / 0.4 / 0; a 9am rain day splits it 1.0 | 0.4; a
 * midnight day holds 1.4.
 */
jest.setTimeout(60_000);

const TZ = 'Australia/Melbourne';
const local = (hh: number, mm: number) => Date.parse(`2026-09-01T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+10:00`);
const FROM = local(7, 0);
const TO = local(11, 0);
const BLE_ID = `QUERY-TEST-${process.pid}`;

function rainTotalAt(ms: number): number {
  if (ms < local(8, 0)) return 0;
  if (ms < local(8, 5)) return Math.round(((ms - local(8, 0)) / 60_000 + 1) * 0.2 * 10) / 10;
  if (ms < local(9, 30)) return 1.0;
  return 1.4;
}

function minuteRows(): ParsedMetRow[] {
  const rows: ParsedMetRow[] = [];
  for (let t = FROM; t < TO; t += 60_000) {
    const hour = (new Date(t).getUTCHours() + 10) % 24; // +10 in September
    const minute = new Date(t).getUTCMinutes();
    // ±0.05 alternating: exact zero mean per hour, never flat.
    const wobble = minute % 2 ? 0.05 : -0.05;
    const wind = (hour === 8 || hour === 9 ? 10 : 5) + wobble;
    rows.push({
      timestampMs: t,
      raw: 'test',
      windSpeedMs: wind,
      windSpeedKmh: wind * 3.6,
      windSpeedKnots: null,
      windDirRelDeg: 90,
      tempC: 17 + (hour - 7) + wobble,
      humidityPct: 60 + wobble * 10,
      pressureHpa: 1012 + wobble,
      dewPointC: 9 + wobble,
      solarWm2: null,
      precipMm: rainTotalAt(t),
      voltageV: null,
      gpsLat: null,
      gpsLng: null,
      status: null,
    });
  }
  return rows;
}

describe('query screen and rain (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let token: string;
  let deviceId: Types.ObjectId;
  let orgId: Types.ObjectId;
  let savedTz: string;

  const get = (path: string, q: Record<string, string | number>) =>
    request(http)
      .get(path)
      .query(q)
      .set('Authorization', `Bearer ${token}`);
  const base = () => ({ deviceId: String(deviceId), from: FROM, to: TO });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();

    const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = admin!.organizationId as Types.ObjectId;
    const org = await Organization.findById(orgId).lean();
    savedTz = org!.timezone;
    await Organization.updateOne({ _id: orgId }, { $set: { timezone: TZ } });
    const device = await Device.create({ organizationId: orgId, bleId: BLE_ID, name: 'Query test station', type: 'MET-LINK', rainDayStartHour: 9 });
    deviceId = device._id as Types.ObjectId;

    await app.get(IngestService).ingestStreamRows(String(orgId), String(deviceId), minuteRows(), [
      'wind_speed',
      'wind_dir',
      'temperature',
      'humidity',
      'pressure',
      'dew_point',
      'precipitation',
    ]);

    const login = await request(http)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    token = login.body.data?.accessToken ?? login.body.accessToken;
  });

  afterAll(async () => {
    await Organization.updateOne({ _id: orgId }, { $set: { timezone: savedTz, 'displayUnits.windSpeed': 'm/s' } });
    const records = await MetRecord.find({ deviceId }).select('_id').lean();
    await MetMeasure.deleteMany({ recordId: { $in: records.map((r) => r._id) } });
    await MetRecord.deleteMany({ deviceId });
    await MetDailySummary.deleteMany({ deviceId });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  it('offers the columns the station reports, in the organisation’s units', async () => {
    const res = await get('/v1/query/columns', { deviceId: String(deviceId) });
    expect(res.status).toBe(200);
    const keys = res.body.data.columns.map((c: { key: string }) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['windSpeed', 'windGust', 'windSpeed10m', 'temperature', 'rain', 'coverage']));
    expect(res.body.data).toMatchObject({ timezone: TZ, rainDayStartHour: 9 });
  });

  it('hourly rows: rain as a total per hour, never a mean of the running total', async () => {
    const res = await get('/v1/query/measures', { ...base(), fields: 'rain,windSpeed,temperature,coverage', resolution: 'hour' });
    expect(res.status).toBe(200);
    const { rows, total } = res.body.data;
    expect(total).toBe(4);
    expect(rows.map((r: { rain: number }) => r.rain)).toEqual([0, 1, 0.4, 0]);
    rows.forEach((r: { windSpeed: number; temperature: number }, i: number) => {
      expect(r.windSpeed).toBeCloseTo([5, 10, 10, 5][i], 2);
      expect(r.temperature).toBeCloseTo([17, 18, 19, 20][i], 2);
    });
    expect(rows.every((r: { coverage: number }) => r.coverage === 60)).toBe(true);
    expect(rows[0].t).toBe(local(7, 0));
  });

  it('daily rows follow the station’s rain day — 9am splits the rain 1.0 | 0.4', async () => {
    const res = await get('/v1/query/measures', { ...base(), fields: 'rain,coverage', resolution: 'day' });
    const { rows } = res.body.data;
    expect(rows.map((r: { t: number }) => r.t)).toEqual([local(9, 0) - 24 * 3_600_000, local(9, 0)]);
    expect(rows.map((r: { rain: number }) => r.rain)).toEqual([1, 0.4]);
    expect(rows.map((r: { coverage: number }) => r.coverage)).toEqual([120, 120]);
  });

  it('…and a midnight rain day holds all 1.4 mm', async () => {
    await Device.updateOne({ _id: deviceId }, { $set: { rainDayStartHour: 0 } });
    try {
      const res = await get('/v1/query/measures', { ...base(), fields: 'rain', resolution: 'day' });
      expect(res.body.data.rows).toEqual([{ t: local(0, 0), rain: 1.4 }]);
    } finally {
      await Device.updateOne({ _id: deviceId }, { $set: { rainDayStartHour: 9 } });
    }
  });

  it('minute rows: each minute’s own rain — on any page, not the running total', async () => {
    // Page 3 of 30 starts at 08:00, the first wet minute.
    const res = await get('/v1/query/measures', { ...base(), fields: 'rain,windGust,windSpeed10m', page: 3, limit: 30 });
    const { rows, total, pageCount } = res.body.data;
    expect(total).toBe(240);
    expect(pageCount).toBe(8);
    expect(rows[0].t).toBe(local(8, 0));
    expect(rows.slice(0, 6).map((r: { rain: number }) => r.rain)).toEqual([0.2, 0.2, 0.2, 0.2, 0.2, 0]);
    expect(rows[0].windSpeed10m).not.toBeNull();
  });

  it('leaves minute-only columns out of hourly and daily rows', async () => {
    const res = await get('/v1/query/measures', { ...base(), fields: 'windSpeed,windSpeed10m,windDir2m', resolution: 'hour' });
    expect(res.body.data.columns.map((c: { key: string }) => c.key)).toEqual(['windSpeed']);
  });

  it('converts to the organisation’s display units', async () => {
    await Organization.updateOne({ _id: orgId }, { $set: { 'displayUnits.windSpeed': 'km/h' } });
    try {
      const res = await get('/v1/query/measures', { ...base(), fields: 'windSpeed', resolution: 'hour' });
      expect(res.body.data.columns[0]).toMatchObject({ key: 'windSpeed', unit: 'km/h' });
      expect(res.body.data.rows[0].windSpeed).toBeCloseTo(18, 1);
    } finally {
      await Organization.updateOne({ _id: orgId }, { $set: { 'displayUnits.windSpeed': 'm/s' } });
    }
  });

  it('the CSV holds exactly the table’s rows, with local time and UTC', async () => {
    const fields = 'rain,windSpeed,temperature';
    const table = await get('/v1/query/measures', { ...base(), fields, resolution: 'hour' });
    const csv = await get('/v1/query/measures.csv', { ...base(), fields, resolution: 'hour' });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    // The STATION's dates, like the rows inside the file: this range is one local
    // day in Melbourne, though it begins on 31 August in UTC.
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="Query-test-station-hour-2026-09-01-to-2026-09-01\.csv"/);
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toBe(`Time (${TZ}),Time (UTC),Wind speed (m/s),Temperature (°C),Rain (mm)`);
    expect(lines).toHaveLength(5);
    expect(lines[2]).toMatch(/^2026-09-01 08:00,2026-08-31T22:00Z,10(\.0\d*)?,18(\.0\d*)?,1$/);
    // Every CSV row matches the table row, column for column.
    table.body.data.rows.forEach((r: Record<string, number>, i: number) => {
      const cells = lines[i + 1].split(',');
      expect(cells.slice(2).map(Number)).toEqual([r.windSpeed, r.temperature, r.rain]);
    });
  });

  it('streams a minute CSV the same way', async () => {
    const csv = await get('/v1/query/measures.csv', { ...base(), fields: 'rain' });
    const lines = csv.text.trim().split('\r\n');
    expect(lines).toHaveLength(241);
    const wet = lines.slice(1).map((l) => Number(l.split(',')[2]));
    expect(Math.round(wet.reduce((a, b) => a + b, 0) * 10) / 10).toBe(1.4);
  });

  it('refuses nonsense before writing anything', async () => {
    expect((await get('/v1/query/measures', { ...base(), fields: 'nope' })).status).toBe(400);
    expect((await get('/v1/query/measures', { ...base(), fields: 'rain', resolution: 'week' })).status).toBe(400);
    expect((await get('/v1/query/measures', { deviceId: String(deviceId), from: TO, to: FROM, fields: 'rain' })).status).toBe(400);
    expect((await get('/v1/query/measures.csv', { ...base(), fields: '' })).status).toBe(400);
    expect((await get('/v1/query/measures', { ...base(), deviceId: String(new Types.ObjectId()), fields: 'rain' })).status).toBe(404);
  });

  it('dashboard rain: today from the rain-day start, the last hour, and the rate', async () => {
    // At 10:30 local: the 9am rain day has had the 09:30 shower, as has the last hour.
    const summary = await rainSummary(deviceId, TZ, 9, local(10, 30));
    expect(summary).toMatchObject({ todayMm: 0.4, lastHourMm: 0.4, rateMmHr: 0, dayStartMs: local(9, 0) });
    // At 08:30 the 9am day began yesterday and holds the morning's 1.0 mm.
    expect(await rainSummary(deviceId, TZ, 9, local(8, 30))).toMatchObject({ todayMm: 1, lastHourMm: 1 });
    // At 08:10:30 the last ten minutes hold the tips of 08:01–08:04, 0.8 mm: 4.8 mm/h.
    expect((await rainSummary(deviceId, TZ, 9, local(8, 10) + 30_000)).rateMmHr).toBe(4.8);
  });

  it('the dashboard rain endpoint answers for the station', async () => {
    const res = await get('/v1/dashboard/met/rain', { deviceId: String(deviceId) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rainDayStartHour: 9 });
    expect(typeof res.body.todayMm).toBe('number');
  });

  it('Beaufort converts the right way round', () => {
    // 10 m/s is force 5 (8.0–10.7 m/s); force 12 starts at 32.7 m/s.
    expect(convertUnit(10, 'm/s', 'bft').result).toBeCloseTo(5.23, 2);
    expect(convertUnit(12, 'bft', 'm/s').result).toBeCloseTo(34.8, 1);
  });
});
