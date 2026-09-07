import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { AlertRule } from '../src/models/AlertRule';
import { Device } from '../src/models/Device';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { User } from '../src/models/User';
import { AlertRulesService } from '../src/alert-rules/alert-rules.service';

/**
 * The timeline endpoint against real collections.
 *
 * Everything is built on a THROWAWAY device: the emit-and-observe style of the
 * sibling alert specs has twice fired the customer's own rules on synthetic
 * wind, so nothing here touches a real station.
 */
jest.setTimeout(120_000);

const MIN = 60_000;

describe('alert rule timeline (e2e)', () => {
  let app: INestApplication;
  let service: AlertRulesService;
  let orgId: string;
  let deviceId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;
  let recordId: mongoose.Types.ObjectId;
  let base: number;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(AlertRulesService);

    const user = await User.findOne({ email: 'admin@observator.com' }).lean();
    userId = user!._id as mongoose.Types.ObjectId;
    orgId = String(user!.organizationId);

    const device = await Device.create({
      organizationId: user!.organizationId,
      name: 'TIMELINE-TEST throwaway station',
      type: 'MET-LINK',
      bleId: `TIMELINE-TEST-${Date.now()}`,
      isActive: true,
    });
    deviceId = device._id as mongoose.Types.ObjectId;

    // Ten whole minutes, far enough back that every one is past the pending
    // window — otherwise a genuinely absent minute reads as "still on its way"
    // and the gap assertions below would be testing the wrong thing.
    base = Math.floor((Date.now() - 40 * MIN) / MIN) * MIN;
    const record = await MetRecord.create({
      organizationId: user!.organizationId,
      deviceId,
      deviceName: 'TIMELINE-TEST throwaway station',
      dateStart: new Date(base).toISOString(),
      dateStartMs: base,
      dateEndMs: null,
      measureCount: 0,
      source: 'sftp',
    });
    recordId = record._id as mongoose.Types.ObjectId;

    // Minute 3 gusts to 5 m/s; minute 4 to 6 m/s; minute 7 is silent.
    const peaks: Record<number, number> = { 3: 5, 4: 6 };
    const docs: Record<string, unknown>[] = [];
    for (let m = 0; m < 10; m++) {
      if (m === 7) continue;
      for (let s = 0; s < 4; s++) {
        const ts = base + m * MIN + s * 1000;
        const speed = s === 0 ? (peaks[m] ?? 0.2) : 0.1;
        docs.push({
          recordId,
          organizationId: user!.organizationId,
          rowType: 'data',
          timeStamp: new Date(ts).toISOString(),
          timestampMs: ts,
          dataSentence: `$IIMWV,000,R,${speed.toFixed(2)},M,A*00`,
          windSpeedMs: speed,
          source: 'sftp',
        });
      }
    }
    await MetMeasure.insertMany(docs);
  });

  afterAll(async () => {
    await AlertRule.deleteMany({ name: /^TIMELINE-TEST/ });
    await MetMeasure.deleteMany({ recordId });
    await MetRecord.deleteOne({ _id: recordId });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  const makeRule = (over: Record<string, unknown> = {}) =>
    AlertRule.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      deviceId,
      createdBy: userId,
      name: 'TIMELINE-TEST rule',
      appType: 'MET',
      sensor: 'wind_speed',
      condition: 'gt',
      threshold: 20, // km/h = 5.556 m/s
      unit: 'km/h',
      isActive: true,
      notifyUserIds: [],
      cooldownMinutes: 5,
      ...over,
    });

  it('returns one bucket per minute, including the silent one', async () => {
    const rule = await makeRule();
    const { data } = await service.timeline(orgId, String(rule._id), { minutes: 10, at: base + 5 * MIN });
    expect(data.buckets).toHaveLength(10);
    // Minute 7 had no readings and is present as a gap, not omitted.
    const silent = data.buckets.find((b) => b.ts === base + 7 * MIN);
    expect(silent?.count).toBe(0);
    expect(silent?.value).toBeNull();
    expect(silent?.reason).toBe('no_data');
  });

  it('marks a just-finished empty minute as pending rather than missing', async () => {
    // The window ends NOW, so its last minutes are inside the pending window and
    // this station has sent nothing for them in this test.
    const rule = await makeRule();
    const { data } = await service.timeline(orgId, String(rule._id), { minutes: 5 });
    const last = data.buckets[data.buckets.length - 1];
    expect(last.count).toBe(0);
    expect(last.reason).toBe('pending');
  });

  it('applies the rule UNIT — a 20 km/h rule is not a 20 m/s rule', async () => {
    const rule = await makeRule();
    const { data } = await service.timeline(orgId, String(rule._id), { minutes: 10, at: base + 5 * MIN });
    expect(data.thresholdStored).toBeCloseTo(5.556, 2);

    // 6 m/s = 21.6 km/h clears 20 km/h; 5 m/s = 18 km/h does not. Compared as
    // raw m/s BOTH would sit far below 20 and neither would ever breach.
    const gust = data.buckets.find((b) => b.ts === base + 4 * MIN);
    expect(gust?.displayValue).toBeCloseTo(21.6, 1);
    expect(gust?.breached).toBe(true);

    const lesser = data.buckets.find((b) => b.ts === base + 3 * MIN);
    expect(lesser?.displayValue).toBeCloseTo(18, 1);
    expect(lesser?.breached).toBe(false);
    expect(lesser?.reason).toBe('not_crossed');
  });

  it('uses the minute PEAK, not its average', async () => {
    const rule = await makeRule();
    const { data } = await service.timeline(orgId, String(rule._id), { minutes: 10, at: base + 5 * MIN });
    const gust = data.buckets.find((b) => b.ts === base + 4 * MIN);
    // One 6 m/s reading among three 0.1s: the average would hide the gust
    // entirely, which is the defect M17 W4 fixed in the evaluator itself.
    expect(gust?.value).toBeCloseTo(6, 5);
    expect(gust!.displayAvg!).toBeLessThan(gust!.displayValue!);
  });

  it('names the COOLDOWN when a breach is suppressed by a recent alert', async () => {
    const rule = await makeRule({
      cooldownMinutes: 30,
      lastTriggeredAt: new Date(base + 3 * MIN),
      triggerHistory: [{ triggeredAt: new Date(base + 3 * MIN), sensorValue: 5, notifiedCount: 0, measuredAtMs: base + 3 * MIN }],
    });
    const { data } = await service.timeline(orgId, String(rule._id), { minutes: 10, at: base + 5 * MIN });
    const gust = data.buckets.find((b) => b.ts === base + 4 * MIN);
    expect(gust?.breached).toBe(true);
    expect(gust?.fired).toBe(false);
    expect(gust?.reason).toBe('cooldown');
  });

  it('says paused rather than pretending a paused rule was below threshold', async () => {
    const rule = await makeRule({ isActive: false });
    const { data } = await service.timeline(orgId, String(rule._id), { minutes: 10, at: base + 5 * MIN });
    const gust = data.buckets.find((b) => b.ts === base + 4 * MIN);
    expect(gust?.reason).toBe('paused');
  });

  it('clamps the window to 60 minutes and refuses another tenant', async () => {
    const rule = await makeRule();
    const { data } = await service.timeline(orgId, String(rule._id), { minutes: 5000 });
    expect(data.minutes).toBe(60);
    expect(data.buckets).toHaveLength(60);

    const stranger = new mongoose.Types.ObjectId().toString();
    await expect(service.timeline(stranger, String(rule._id))).rejects.toMatchObject({ statusCode: 404 });
  });

  it('plots a fire on the MEASUREMENT minute, not the minute it was processed', async () => {
    // Processed at minute 9, but the reading was taken at minute 4 — a backlog
    // drain. Plotting it at 9 would mark the alert over a stretch of calm.
    const rule = await makeRule({
      triggerHistory: [
        { triggeredAt: new Date(base + 9 * MIN), sensorValue: 6, notifiedCount: 0, measuredAtMs: base + 4 * MIN },
      ],
    });
    const { data } = await service.timeline(orgId, String(rule._id), { minutes: 10, at: base + 5 * MIN });
    expect(data.buckets.find((b) => b.ts === base + 4 * MIN)?.fired).toBe(true);
    expect(data.buckets.find((b) => b.ts === base + 9 * MIN)?.fired).toBe(false);
    expect(data.firesOnIngestTime).toBe(0);
  });

  it('counts fires that only have a processing time, so the caller can say so', async () => {
    const rule = await makeRule({
      triggerHistory: [{ triggeredAt: new Date(base + 4 * MIN), sensorValue: 6, notifiedCount: 0 }],
    });
    const { data } = await service.timeline(orgId, String(rule._id), { minutes: 10, at: base + 5 * MIN });
    expect(data.firesOnIngestTime).toBe(1);
  });
});
