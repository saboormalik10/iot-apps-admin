import { buildTimeline, evaluatedValue, BucketInput, PENDING_WINDOW_MS } from '../src/alert-rules/timeline';

/**
 * The timeline answers "it says armed — why is my feed empty?". Its two real
 * answers (never crossed / swallowed by cooldown) look identical from outside,
 * so each is pinned here.
 */
const M = 60_000;
const bucket = (ts: number, over: Partial<BucketInput> = {}): BucketInput => ({
  ts,
  count: 60,
  max: 1,
  min: 0,
  avg: 0.5,
  ...over,
});

const run = (o: Partial<Parameters<typeof buildTimeline>[0]> = {}) =>
  buildTimeline({
    // Fixed far-future clock so the fixtures at ts=0 are long settled and the
    // pending window never colours the older assertions.
    now: 1_900_000_000_000,
    buckets: [bucket(0), bucket(M), bucket(2 * M)],
    condition: 'gt',
    thresholdStored: 0.5,
    cooldownMs: 5 * M,
    isActive: true,
    fires: [],
    priorFireMs: null,
    toDisplay: (v) => v * 3.6,
    ...o,
  });

describe('alert timeline reconstruction', () => {
  it('uses the PEAK for "above" rules and the TROUGH for "below" ones', () => {
    const b = bucket(0, { max: 9, min: 1 });
    expect(evaluatedValue('gt', b)).toBe(9);
    expect(evaluatedValue('gte', b)).toBe(9);
    expect(evaluatedValue('lt', b)).toBe(1);
    expect(evaluatedValue('lte', b)).toBe(1);
  });

  it('reports a minute under the threshold as not_crossed', () => {
    const out = run({ buckets: [bucket(0, { max: 0.1 })] });
    expect(out[0].breached).toBe(false);
    expect(out[0].reason).toBe('not_crossed');
  });

  it('marks the minute the rule actually fired', () => {
    const out = run({ fires: [30_000] });
    expect(out[0].fired).toBe(true);
    expect(out[0].reason).toBe('fired');
    expect(out[1].fired).toBe(false);
  });

  it('blames the COOLDOWN, not the threshold, when a breach is suppressed', () => {
    // Fires in minute 0; minutes 1 and 2 also breach but fall inside a 5-min cooldown.
    const out = run({ fires: [0] });
    expect(out[0].reason).toBe('fired');
    expect(out[1].breached).toBe(true);
    expect(out[1].reason).toBe('cooldown');
    expect(out[2].reason).toBe('cooldown');
  });

  it('carries a cooldown that started BEFORE the window', () => {
    // Without priorFireMs this window opens with no known fire and would
    // mislabel a suppressed minute as unexplained.
    const out = run({ priorFireMs: -2 * M });
    expect(out[0].reason).toBe('cooldown');
    const blind = run({ priorFireMs: null });
    expect(blind[0].reason).toBe('not_recorded');
  });

  it('lets the cooldown lapse', () => {
    const out = run({
      buckets: [bucket(0), bucket(6 * M)],
      fires: [0],
    });
    expect(out[0].reason).toBe('fired');
    // 6 minutes later the 5-minute cooldown has expired, so a breach here is
    // genuinely unexplained rather than suppressed.
    expect(out[1].reason).toBe('not_recorded');
  });

  /**
   * An empty minute that has only just happened is not a missing minute — its
   * file is written at the end of the minute, held by the agent until it looks
   * complete, and only then uploaded. Calling it "no readings" asserts something
   * we do not know yet, one minute after the fact.
   */
  describe('the pending window', () => {
    const NOW = 1_800_000_000_000;
    const empty = (ts: number) => bucket(ts, { count: 0, max: null, min: null, avg: null });

    it('calls a just-finished empty minute pending, not missing', () => {
      const out = run({ buckets: [empty(NOW - 2 * M)], now: NOW });
      expect(out[0].reason).toBe('pending');
    });

    it('calls it missing once its file can no longer arrive', () => {
      const out = run({ buckets: [empty(NOW - PENDING_WINDOW_MS - 2 * M)], now: NOW });
      expect(out[0].reason).toBe('no_data');
    });

    it('a minute WITH readings is never pending', () => {
      const out = run({ buckets: [bucket(NOW - M, { max: 0.1 })], now: NOW });
      expect(out[0].reason).toBe('not_crossed');
    });

    it('a fire still wins over pending', () => {
      const out = run({ buckets: [empty(NOW - M)], fires: [NOW - M + 10], now: NOW });
      expect(out[0].reason).toBe('fired');
    });
  });

  it('reports an empty minute as no_data, never as a calm reading', () => {
    const out = run({ buckets: [bucket(0, { count: 0, max: null, min: null, avg: null })] });
    expect(out[0].value).toBeNull();
    expect(out[0].displayValue).toBeNull();
    expect(out[0].reason).toBe('no_data');
  });

  it('says paused rather than inventing a threshold answer', () => {
    const out = run({ isActive: false });
    expect(out[0].breached).toBe(true);
    expect(out[0].reason).toBe('paused');
  });

  it('a fire still shows on a minute with no stored readings', () => {
    // Backfill: the alert is real even where the measurement axis is empty.
    const out = run({ buckets: [bucket(0, { count: 0, max: null, min: null, avg: null })], fires: [10_000] });
    expect(out[0].reason).toBe('fired');
  });

  it('converts every value into the rule unit, leaving `value` stored', () => {
    const out = run({ buckets: [bucket(0, { max: 2, avg: 1 })] });
    expect(out[0].value).toBe(2);
    expect(out[0].displayValue).toBeCloseTo(7.2);
    expect(out[0].displayAvg).toBeCloseTo(3.6);
  });
});
