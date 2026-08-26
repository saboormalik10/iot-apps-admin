import { DailySummaryService } from '../src/analytics/daily-summary.service';
import { MetMeasuresEvent } from '../src/realtime/realtime.events';

/**
 * Debounce behaviour for the daily rollup (M14 W2).
 *
 * The rollup previously ran once per agent POST — 1,440 times a day per station,
 * each recomputing the whole day. Measured at 8-9.5s per full-day recompute, that
 * is four hours of CPU per station per day. Coalescing is what makes the ingest
 * rate survivable.
 *
 * Pure: `populateMetDay` is stubbed, so no app and no database.
 */

jest.useFakeTimers();

function event(deviceId: string, dayKeys: string[]): MetMeasuresEvent {
  return {
    organizationId: 'org1',
    deviceId,
    recordId: 'rec1',
    latest: { measuredAtMs: Date.now() },
    dayKeys,
    timezone: 'Australia/Sydney',
  };
}

describe('daily rollup debounce', () => {
  let svc: DailySummaryService;
  let calls: string[];

  beforeEach(() => {
    svc = new DailySummaryService();
    calls = [];
    // Record what would have been recomputed, instead of touching Mongo.
    jest
      .spyOn(svc, 'populateMetDay')
      .mockImplementation(async (_org: string, deviceId: string, _s: number, _e?: number, dayKey?: string) => {
        calls.push(`${deviceId}:${dayKey}`);
        return null;
      });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('collapses a burst of events into ONE recompute', async () => {
    // A catch-up after an outage: many POSTs for the same device and day.
    for (let i = 0; i < 50; i++) await svc.onMetMeasures(event('dev1', ['2026-08-20']));

    expect(calls).toHaveLength(0); // nothing has run yet — all deferred

    jest.advanceTimersByTime(60_000);
    await svc.flushPending();

    expect(calls).toEqual(['dev1:2026-08-20']);
  });

  it('keeps separate days separate', async () => {
    await svc.onMetMeasures(event('dev1', ['2026-08-19', '2026-08-20']));
    jest.advanceTimersByTime(60_000);
    await svc.flushPending();

    expect(calls.sort()).toEqual(['dev1:2026-08-19', 'dev1:2026-08-20']);
  });

  it('keeps separate devices separate', async () => {
    await svc.onMetMeasures(event('dev1', ['2026-08-20']));
    await svc.onMetMeasures(event('dev2', ['2026-08-20']));
    jest.advanceTimersByTime(60_000);
    await svc.flushPending();

    expect(calls.sort()).toEqual(['dev1:2026-08-20', 'dev2:2026-08-20']);
  });

  it('does not starve a continuously busy station', async () => {
    // An event every 30s would defer forever under a naive trailing debounce.
    // The five-minute ceiling forces a run regardless.
    for (let i = 0; i < 12; i++) {
      await svc.onMetMeasures(event('dev1', ['2026-08-20']));
      jest.advanceTimersByTime(30_000);
    }
    expect(calls.length).toBeGreaterThan(0);
  });

  it('falls back to the single-day path when the event carries no dayKeys', async () => {
    // Mobile-era emitters send no dayKeys; that path must still work.
    await svc.onMetMeasures({
      organizationId: 'org1',
      deviceId: 'dev1',
      recordId: 'rec1',
      latest: { measuredAtMs: Date.UTC(2026, 7, 20, 12) },
    });
    // The legacy branch runs immediately rather than being scheduled.
    expect(calls).toHaveLength(1);
  });
});
