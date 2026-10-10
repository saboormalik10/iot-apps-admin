import 'dotenv/config';
import * as net from 'net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { StreamService } from '../src/stream/stream.service';
import { gillChecksum } from '../src/stream/gmx';
import { NmeaAssembler, isNmeaSentence, unwrapNmea } from '../src/stream/nmea';
import { RainAccumulator } from '../src/stream/rain';
import { Device } from '../src/models/Device';
import { Organization } from '../src/models/Organization';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetDailySummary } from '../src/models/MetDailySummary';

/**
 * The GMX551 in NMEA 0183 mode (client, 9 Oct 2026: every line his sensor sent
 * was refused — it was set to NMEA, and only Gill ASCII was read). Sentences as
 * the MaxiMet manual (issue 11, appendix G) gives them for a GMX551: relative
 * wind, corrected wind, one transducer sentence, then tilt, every second.
 */
jest.setTimeout(60_000);

const nmea = (body: string) => `$${body}*${gillChecksum(body)}\r\n`;
/** One output cycle: wind 10 kn from 090 relative / 100 corrected, the manual's transducer example, tilt. */
const cycle = (opts: { knots?: number; precip?: number; valid?: boolean } = {}) =>
  [
    nmea(`WIMWV,090,R,${(opts.knots ?? 10).toFixed(2).padStart(6, '0')},N,${opts.valid === false ? 'V' : 'A'}`),
    nmea('WIMWV,100,T,,N,A'),
    nmea(`WIXDR,C,+023.0,C,TEMP,C,+008.1,C,DEWP,P,1.0243,B,PRESS,H,038.1,P,RH,Z,0120,W,SOLAR,Y,${(opts.precip ?? 0).toFixed(3)},M,PRECIP`),
    // Exactly as the client's sensor sent it.
    '$PGILT,A,+31,D,-58,D,+1,TILT*3D\r\n',
  ].join('');

describe('NMEA sentences', () => {
  it("checks the checksum the way Gill computes it — the client's own tilt line passes", () => {
    expect(unwrapNmea('$PGILT,A,+31,D,-58,D,+1,TILT*3D')).toMatchObject({ checksumOk: true, body: 'PGILT,A,+31,D,-58,D,+1,TILT' });
    expect(unwrapNmea('$PGILT,A,+31,D,-58,D,+1,TILT*3E').checksumOk).toBe(false);
    expect(isNmeaSentence('$WIMWV,090,R,010.00,N,A*00')).toBe(true);
    expect(isNmeaSentence('\x02Q,090,004.00\x0300')).toBe(false);
  });

  it('turns one cycle into one reading, in stored units, when the next begins', () => {
    const a = new NmeaAssembler();
    const lines = cycle({ precip: 3.6 }).trim().split('\r\n');
    for (const l of lines) expect(a.accept(l, 1_000).kind).toBe('absorbed');
    const next = a.accept(lines[0], 2_000);
    expect(next.kind).toBe('data');
    if (next.kind !== 'data') return;
    expect(next.atMs).toBe(1_000);
    expect(next.reading.status).toBeNull();
    expect(next.reading.values).toEqual({
      dir: 90,
      speed: 5.144, // 10 kn
      cdir: 100,
      temp: 23,
      dewpoint: 8.1,
      press: 1024.3, // 1.0243 bar
      rh: 38.1,
      solar: 120,
      precipi: 3.6,
    });
  });

  it('turns intensity into rain over the cycle, and adds it to the site total', () => {
    const a = new NmeaAssembler();
    const rain = new RainAccumulator('total');
    const l = cycle({ precip: 3.6 }).trim().split('\r\n');
    let total = 0;
    for (let s = 0; s < 4; s++) {
      for (const line of l) {
        const r = a.accept(line, s * 1_000);
        if (r.kind === 'data') total = rain.addInterval((r.reading as { rainIntervalMm: number }).rainIntervalMm, r.atMs);
      }
    }
    // Three cycles finished; the first is the baseline, two seconds at 3.6 mm/h = 0.002 mm.
    expect(total).toBeCloseTo(0.002, 6);
  });

  it('drops the wind of a cycle the unit marks void', () => {
    const a = new NmeaAssembler();
    for (const l of cycle({ valid: false }).trim().split('\r\n')) a.accept(l, 0);
    const r = a.accept(cycle().split('\r\n')[0], 1_000);
    expect(r.kind === 'data' && r.reading.values.speed).toBeNull();
    expect(r.kind === 'data' && r.reading.status).toBe('V');
    expect(r.kind === 'data' && r.reading.values.temp).toBe(23);
  });

  it('refuses a sentence whose checksum does not match', () => {
    expect(new NmeaAssembler().accept('$WIMWV,090,R,010.00,N,A*00', 0)).toEqual({ kind: 'rejected', reason: 'CHECKSUM' });
  });
});

describe('sensor stream, NMEA (e2e)', () => {
  const BLE_ID = `STREAM-NMEA-${process.pid}`;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let stream: StreamService;
  let deviceId: Types.ObjectId;
  let token: string;
  let clock = 0;
  const T0 = Math.floor(Date.now() / 60_000) * 60_000 - 5 * 60_000;
  const saved = { ...process.env };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const org = await Organization.findOne({ slug: 'observator-au' }).lean();
    if (!org) throw new Error('run `npm run seed` first');
    const device = await Device.create({ organizationId: org._id, bleId: BLE_ID, name: 'NMEA test station', type: 'MET-LINK' });
    deviceId = device._id as Types.ObjectId;
    Object.assign(process.env, { STREAM_ENABLED: 'true', STREAM_MODE: 'listen', STREAM_TCP_PORT: '0', STREAM_HOST: '127.0.0.1', STREAM_STATION_BLE_ID: BLE_ID });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    stream = app.get(StreamService);
    (stream as unknown as { now: () => number }).now = () => clock;
    await app.init();
    http = app.getHttpServer();
    const login = await request(http)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    token = login.body.data?.accessToken ?? login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    const records = await MetRecord.find({ deviceId }).select('_id').lean();
    await MetMeasure.deleteMany({ recordId: { $in: records.map((r) => r._id) } });
    await MetRecord.deleteMany({ deviceId });
    await MetDailySummary.deleteMany({ deviceId });
    await Device.deleteOne({ _id: deviceId });
    await mongoose.disconnect();
  });

  it('stores a minute of NMEA output like any other', async () => {
    const sensor = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host: '127.0.0.1', port: stream.port! }, () => resolve(s));
      s.on('error', reject);
    });
    const sendAt = async (atMs: number, data: string, lines: number) => {
      const before = stream.getStatus().counts.lines;
      clock = atMs;
      sensor.write(data);
      const until = Date.now() + 3_000;
      while (stream.getStatus().counts.lines < before + lines) {
        if (Date.now() > until) throw new Error('timed out waiting for the lines');
        await new Promise((r) => setTimeout(r, 5));
      }
    };

    // 62 cycles: a cycle is finished by the next, and the minute by a reading in the next minute.
    for (let s = 0; s < 62; s++) await sendAt(T0 + s * 1000 + 100, cycle({ precip: 3.6 }), 4);
    await (stream as unknown as { writes: Promise<void> }).writes;

    const st = stream.getStatus();
    expect(st.format).toBe('nmea');
    expect(st.counts.readings).toBe(61);
    expect(st.counts.columnMismatches).toBe(0);
    expect(st.counts.checksumErrors).toBe(0);

    const record = await MetRecord.findOne({ deviceId }).lean();
    const m = await MetMeasure.findOne({ recordId: record!._id, res: '1m', timestampMs: T0 }).lean();
    expect(m).not.toBeNull();
    expect(m!.windSampleCount).toBe(60);
    expect(m!.windSpeedMs).toBeCloseTo(5.144, 2);
    expect(m!.tempC).toBe(23);
    expect(m!.dewPointC).toBe(8.1);
    expect(m!.pressureHpa).toBeCloseTo(1024.3, 1);
    expect(m!.humidityPct).toBeCloseTo(38.1, 1);
    expect(m!.solarWm2).toBe(120);
    // 59 seconds at 3.6 mm/h after the first cycle's baseline.
    expect(m!.precipMm).toBeCloseTo(0.059, 3);
    sensor.destroy();
  });

  it('lists the recent lines and what became of each', async () => {
    const res = await request(http).get('/v1/stream/recent-lines').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rows = res.body.data as { line: string; outcome: string }[];
    expect(rows).toHaveLength(100);
    expect(rows.some((r) => r.line === '$PGILT,A,+31,D,-58,D,+1,TILT*3D' && r.outcome === 'part of a reading')).toBe(true);
    expect(rows.some((r) => r.line.startsWith('$WIMWV,090,R') && r.outcome === 'reading')).toBe(true);
  });
});
