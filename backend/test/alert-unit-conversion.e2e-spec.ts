import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { AlertRule } from '../src/models/AlertRule';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';
import { DomainEvent } from '../src/realtime/realtime.events';

/**
 * End-to-end proof that a rule's UNIT is honoured by the live evaluator.
 *
 * THE DEFECT
 * `wind_speed` is stored as `windSpeedMs` (m/s) while the dashboard shows km/h.
 * The evaluator compared `rule.threshold` raw, so "wind speed > 20 km/h" was
 * tested as 20 m/s and could only fire at 72 km/h — above anything this station
 * has ever recorded. The rule looked armed in the UI and could never fire.
 *
 * Verified against the real database before the fix: a "> 3 km/h" rule sat
 * silent through readings peaking at 3.35 km/h.
 *
 * This drives the real `AlertEvaluationService` through the real event, rather
 * than testing the maths in isolation — the maths is covered in
 * evaluate.e2e-spec.ts; what this pins is that the service actually applies it.
 */
jest.setTimeout(120_000);

describe('alert rule unit conversion (e2e)', () => {
  let app: INestApplication;
  let emitter: EventEmitter2;
  let orgId: string;
  let deviceId: string;
  let userId: string;
  const created: mongoose.Types.ObjectId[] = [];
  let createdDeviceId: mongoose.Types.ObjectId | undefined;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    emitter = app.get(EventEmitter2);

    const user = await User.findOne({ email: 'admin@observator.com' }).lean();
    userId = String(user!._id);
    orgId = String(user!.organizationId);
    /**
     * A THROWAWAY device, deliberately not the customer's real station.
     *
     * The emit below reaches every armed rule on whatever device it names, so
     * running this against the real station fires the customer's own rules on
     * synthetic wind and leaves real notifications in their feed. It did,
     * twice, before this was isolated.
     */
    const device = await Device.create({
      organizationId: user!.organizationId,
      name: 'UNIT-TEST throwaway station',
      type: 'MET-LINK',
      bleId: `UNIT-TEST-${Date.now()}`,
      isActive: true,
    });
    deviceId = String(device._id);
    createdDeviceId = device._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    if (created.length) await AlertRule.deleteMany({ _id: { $in: created } });
    await AlertRule.deleteMany({ name: /^UNIT-TEST/ });
    // Notifications fan out to real users, so they must go too.
    await mongoose.connection.collection('notifications').deleteMany({ title: /^UNIT-TEST/ });
    if (createdDeviceId) await Device.deleteOne({ _id: createdDeviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  /** Fire a batch whose PEAK is `peakMs` metres per second. */
  const emitReading = async (peakMs: number) => {
    emitter.emit(DomainEvent.MET_MEASURES, {
      organizationId: orgId,
      deviceId,
      recordId: new mongoose.Types.ObjectId().toString(),
      latest: { measuredAtMs: Date.now(), windSpeedMs: peakMs },
      extremes: { windSpeedMs: { min: 0, max: peakMs } },
    });
    // The listener is async; give it room to write.
    await new Promise((r) => setTimeout(r, 2500));
  };

  const makeRule = async (threshold: number, unit: string) => {
    const rule = await AlertRule.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      deviceId: new mongoose.Types.ObjectId(deviceId),
      createdBy: new mongoose.Types.ObjectId(userId),
      name: `UNIT-TEST ${threshold}${unit}`,
      appType: 'MET',
      sensor: 'wind_speed',
      condition: 'gt',
      threshold,
      unit,
      isActive: true,
      notifyUserIds: [new mongoose.Types.ObjectId(userId)],
      cooldownMinutes: 0,
    });
    created.push(rule._id as mongoose.Types.ObjectId);
    return rule;
  };

  it('fires a km/h rule at the km/h value, not the m/s one', async () => {
    const rule = await makeRule(20, 'km/h'); // = 5.556 m/s
    // 6 m/s = 21.6 km/h — above the rule in km/h, far BELOW it read as m/s.
    await emitReading(6);
    const after = await AlertRule.findById(rule._id).lean();
    expect(after!.lastTriggeredAt).toBeTruthy();
  });

  it('does not fire below the threshold', async () => {
    const rule = await makeRule(20, 'km/h'); // = 5.556 m/s
    // 5 m/s = 18 km/h — genuinely under 20 km/h.
    await emitReading(5);
    const after = await AlertRule.findById(rule._id).lean();
    expect(after!.lastTriggeredAt).toBeNull();
  });

  it('still treats an m/s rule as m/s', async () => {
    const rule = await makeRule(5, 'm/s');
    await emitReading(6);
    const after = await AlertRule.findById(rule._id).lean();
    expect(after!.lastTriggeredAt).toBeTruthy();
  });

  it('records the reading in the stored unit, and reports it in the rule’s', async () => {
    const rule = await makeRule(10, 'km/h');
    await emitReading(6); // 21.6 km/h
    const after = await AlertRule.findById(rule._id).lean();
    const entry = after!.triggerHistory[after!.triggerHistory.length - 1];
    // History keeps the raw measurement — the unit is the sensor's, not the rule's.
    expect(entry.sensorValue).toBeCloseTo(6, 3);
  });

  it('a rule with an unparseable unit still evaluates instead of throwing', async () => {
    // The field was free text before the dropdown, so saved rules can hold
    // anything. An unknown unit must degrade to "compare as written", never
    // take down evaluation for the whole device.
    const rule = await makeRule(5, 'bananas');
    await expect(emitReading(6)).resolves.not.toThrow();
    const after = await AlertRule.findById(rule._id).lean();
    expect(after!.lastTriggeredAt).toBeTruthy(); // 6 > 5, compared unconverted
  });
});
