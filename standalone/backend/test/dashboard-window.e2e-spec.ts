import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';
import { DashboardService } from '../src/dashboard/dashboard.service';

/**
 * The scope bar's range must reach the dashboard.
 *
 * The KPI tiles took no window at all, so picking "Last hour" left every number
 * unchanged — the headline figures silently contradicted the filter above them.
 *
 * Read-only against the real organisation: this asserts RELATIONSHIPS between
 * windows rather than absolute counts, so it neither depends on nor disturbs the
 * customer's data.
 */
jest.setTimeout(120_000);

const H = 3_600_000;

describe('dashboard summary window (e2e)', () => {
  let app: INestApplication;
  let service: DashboardService;
  let orgId: string;
  let now: number;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(DashboardService);
    const user = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = String(user!.organizationId);
    now = Date.now();
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  type Summary = Awaited<ReturnType<DashboardService['getSummary']>> & Record<string, number | boolean>;
  const summary = (from?: number, to?: number) =>
    service.getSummary(orgId, undefined, undefined, { from, to }) as Promise<Summary>;

  it('counts fewer readings in a narrower window', async () => {
    const [hour, day, all] = await Promise.all([
      summary(now - H, now),
      summary(now - 24 * H, now),
      summary(),
    ]);
    expect(hour.totalMetRecords).toBeLessThanOrEqual(day.totalMetRecords);
    expect(day.totalMetRecords).toBeLessThanOrEqual(all.totalMetRecords);
    // And the range genuinely bites — an hour is not the whole dataset.
    expect(hour.totalMetRecords).toBeLessThan(all.totalMetRecords);
  });

  it('leaves current-state counts alone', async () => {
    // "Devices in the last hour" has no meaning, so these must NOT move.
    //
    // Scoped to ONE device on purpose. Compared org-wide this raced with the
    // sibling suites, which create and delete throwaway stations in the same
    // organisation — the count could legitimately change between the two reads
    // and the failure said nothing about the window.
    const device = await Device.findOne({
      organizationId: new mongoose.Types.ObjectId(orgId),
      type: 'MET-LINK',
      name: { $not: /TEST/ },
      deletedAt: null,
    })
      .select('_id')
      .lean();
    const scoped = (from?: number, to?: number) =>
      service.getSummary(orgId, undefined, String(device!._id), { from, to }) as Promise<Summary>;

    const [hour, all] = await Promise.all([scoped(now - H, now), scoped()]);
    expect(hour.totalDevices).toBe(all.totalDevices);
    expect(hour.onlineDevices).toBe(all.onlineDevices);
    // `activeAlertRules` is deliberately NOT asserted here. It is org-wide
    // current state with no device narrowing, and the sibling alert suites
    // create and delete rules while this runs — so a mismatch would mean "a rule
    // was added just then", not "the window leaked into the count". The window's
    // absence from that query is covered by `getSummary` taking no window
    // argument for it at all.
  });

  it('flags whether the data figures were windowed', async () => {
    expect((await summary()).windowed).toBe(false);
    expect((await summary(now - H, now)).windowed).toBe(true);
  });

  it('does not serve one window from another window’s cache', async () => {
    // The result is memoised per scope; without the window in the cache key a
    // range change returns the previous range's numbers.
    const hour = await summary(now - H, now);
    const all = await summary();
    const hourAgain = await summary(now - H, now);
    expect(hourAgain.totalMetRecords).toBe(hour.totalMetRecords);
    expect(all.totalMetRecords).not.toBe(hour.totalMetRecords);
  });

  it('reports zero readings for a window that predates the data', async () => {
    const ancient = await summary(now - 3650 * 24 * H, now - 3600 * 24 * H);
    expect(ancient.totalMetRecords).toBe(0);
    expect(ancient.totalMetDays).toBe(0);
  });
});
