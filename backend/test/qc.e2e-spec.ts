import { applyQc, type QcState } from '../src/ingest/qc';
import type { ParsedMetRow } from '../src/ingest/met-csv/parse-met-csv';
import { computeMetDaily } from '../src/analytics/daily-summary.util';

/**
 * Per-reading QC, WMO-No. 8 Part IV.
 *
 * The cases below are the ones that separate working QC from QC that merely
 * runs: a check that fires on real weather is worse than no check, so most of
 * these assert that something is NOT flagged.
 */

const MIN = 60_000;

/** A row with only the fields a test cares about; everything else is null. */
function row(timestampMs: number, fields: Partial<ParsedMetRow> = {}): ParsedMetRow {
  return {
    timestampMs,
    raw: 'raw',
    windSpeedMs: null,
    windSpeedKmh: null,
    windSpeedKnots: null,
    windDirRelDeg: null,
    tempC: null,
    humidityPct: null,
    pressureHpa: null,
    dewPointC: null,
    solarWm2: null,
    precipMm: null,
    voltageV: null,
    gpsLat: null,
    gpsLng: null,
    status: null,
    ...fields,
  };
}

describe('QC — the sensor’s own status code', () => {
  it('drops the wind reading when the Gill reports a fault', () => {
    // The numbers are entirely plausible. Only the status column says otherwise,
    // which is exactly why this check cannot be replaced by a threshold.
    const { rows, flaggedRows } = applyQc([row(0, { windSpeedMs: 4.2, windDirRelDeg: 180, status: 'V' })]);
    expect(rows[0].windSpeedMs).toBeNull();
    expect(rows[0].windDirRelDeg).toBeNull();
    expect(rows[0].qc).toEqual(['status:V']);
    expect(flaggedRows).toBe(1);
  });

  it('accepts A — the code every row in the live corpus carries', () => {
    const { rows, flaggedRows } = applyQc([row(0, { windSpeedMs: 4.2, status: 'A' })]);
    expect(rows[0].windSpeedMs).toBe(4.2);
    expect(rows[0].qc).toBeUndefined();
    expect(flaggedRows).toBe(0);
  });

  it('accepts the Gill 00 status word and is not case-sensitive', () => {
    expect(applyQc([row(0, { windSpeedMs: 1, status: '00' })]).rows[0].windSpeedMs).toBe(1);
    expect(applyQc([row(0, { windSpeedMs: 1, status: 'a' })]).rows[0].windSpeedMs).toBe(1);
  });

  it('leaves a row with no status column alone', () => {
    // The environmental stream has no status column at all. Absent must not read
    // as "faulty", or every temperature reading we hold would be thrown away.
    const { rows } = applyQc([row(0, { tempC: 12.3, status: null })]);
    expect(rows[0].tempC).toBe(12.3);
    expect(rows[0].qc).toBeUndefined();
  });
});

describe('QC — range (gross-error limits)', () => {
  it('rejects an impossible humidity but keeps the rest of the row', () => {
    // Per FIELD, not per row: a failed hygrometer must not delete that second's
    // good temperature reading too.
    const { rows } = applyQc([row(0, { humidityPct: 137, tempC: 18.4 })]);
    expect(rows[0].humidityPct).toBeNull();
    expect(rows[0].tempC).toBe(18.4);
    expect(rows[0].qc).toEqual(['range:humidityPct']);
  });

  it('accepts a violent but real gust', () => {
    // 60 m/s is a category-4 hurricane. It is real weather, and it is precisely
    // the reading the station exists to capture.
    const { rows } = applyQc([row(0, { windSpeedMs: 60 })]);
    expect(rows[0].windSpeedMs).toBe(60);
  });

  it('accepts 100 %RH and 0 m/s — the boundary values that occur daily', () => {
    const { rows } = applyQc([row(0, { humidityPct: 100, windSpeedMs: 0 })]);
    expect(rows[0].humidityPct).toBe(100);
    expect(rows[0].windSpeedMs).toBe(0);
  });

  it('does not let a rejected spike become the baseline for the next reading', () => {
    // Without this the aftermath of one bad value is a second false flag on the
    // good reading that follows it.
    const { rows } = applyQc([
      row(0, { tempC: 18 }),
      row(MIN, { tempC: 999 }),   // impossible — rejected on range
      row(2 * MIN, { tempC: 18.2 }),
    ]);
    expect(rows[1].tempC).toBeNull();
    expect(rows[2].tempC).toBe(18.2);
    expect(rows[2].qc).toBeUndefined();
  });
});

describe('QC — step (time consistency)', () => {
  it('flags a temperature jump no atmosphere can produce', () => {
    const { rows } = applyQc([row(0, { tempC: 18 }), row(MIN, { tempC: 31 })]);
    expect(rows[1].tempC).toBeNull();
    expect(rows[1].qc).toEqual(['step:tempC']);
  });

  it('accepts a sharp but real frontal drop', () => {
    // 2.5 °C in a minute happens when a front passes. The limit is 3.
    const { rows } = applyQc([row(0, { tempC: 24 }), row(MIN, { tempC: 21.5 })]);
    expect(rows[1].tempC).toBe(21.5);
    expect(rows[1].qc).toBeUndefined();
  });

  it('normalises by elapsed time, not by row count', () => {
    /**
     * The load-bearing case for two streams that sample 60x apart. The same
     * 3 °C change is impossible inside one second and ordinary across ten
     * minutes; a per-reading limit would get one of them wrong.
     */
    const fast = applyQc([row(0, { tempC: 18 }), row(1_000, { tempC: 21 })]);
    expect(fast.rows[1].tempC).toBeNull();

    const slow = applyQc([row(0, { tempC: 18 }), row(10 * MIN, { tempC: 21 })]);
    expect(slow.rows[1].tempC).toBe(21);
  });

  it('does not flag this barometer’s own noise', () => {
    /**
     * CALIBRATION GUARD. The station's pressure sensor swings up to ~3 hPa in a
     * minute and back, several times a day — jitter, not weather. An earlier
     * draft put the limit at 2 hPa/min, which sat INSIDE that distribution: it
     * rejected 11 readings out of 200,000 while passing thousands of identical
     * ones, which is worse than not checking at all.
     *
     * Measured with `src/scripts/qc-distribution.ts`; re-run it before changing
     * the limit.
     */
    const { flaggedRows } = applyQc([
      row(0, { pressureHpa: 1015.46 }),
      row(MIN, { pressureHpa: 1018.26 }),   // +2.80 in a minute — real, and flagged by the old limit
      row(2 * MIN, { pressureHpa: 1015.7 }),
      row(3 * MIN, { pressureHpa: 1018.23 }),
    ]);
    expect(flaggedRows).toBe(0);
  });

  it('still catches a barometer that has genuinely failed', () => {
    // The limit is wide, not absent: 40 hPa in a minute is not a pressure system.
    const { rows } = applyQc([row(0, { pressureHpa: 1015 }), row(MIN, { pressureHpa: 1055 })]);
    expect(rows[1].pressureHpa).toBeNull();
    expect(rows[1].qc).toEqual(['step:pressureHpa']);
  });

  it('does not flag across a long outage', () => {
    // Two hours apart is not a step, it is a gap. There is no basis to judge it.
    const { rows } = applyQc([row(0, { tempC: 5 }), row(2 * 60 * MIN, { tempC: 25 })]);
    expect(rows[1].tempC).toBe(25);
  });

  it('survives the duplicate timestamps the real corpus contains', () => {
    // 280 timestamps in the live corpus appear twice: the sensor samples faster
    // than 1 Hz and the timestamp is truncated to whole seconds. A zero gap
    // makes the rate infinite, which would flag both rows.
    const { rows } = applyQc([row(0, { tempC: 18 }), row(0, { tempC: 18.4 })]);
    expect(rows[1].tempC).toBe(18.4);
  });

  it('leaves wind direction unchecked', () => {
    // In light air the bearing legitimately swings right through the compass
    // between consecutive seconds.
    const { rows } = applyQc([row(0, { windDirRelDeg: 5 }), row(1_000, { windDirRelDeg: 200 })]);
    expect(rows[1].windDirRelDeg).toBe(200);
  });
});

describe('QC — persistence (a stuck sensor)', () => {
  const flat = (count: number, value: number) =>
    Array.from({ length: count }, (_, i) => row(i * MIN, { tempC: value }));

  it('flags a thermometer frozen for an hour', () => {
    const { rows } = applyQc(flat(90, 19.5));
    // Nothing is flagged until the run actually exceeds the window.
    expect(rows[30].tempC).toBe(19.5);
    expect(rows[30].qc).toBeUndefined();
    expect(rows[75].tempC).toBeNull();
    expect(rows[75].qc).toEqual(['persist:tempC']);
  });

  it('keeps flagging for as long as the sensor stays stuck', () => {
    // The run must not reset the moment it is first flagged, or the fault would
    // be reported once an hour forever instead of continuously.
    const { rows } = applyQc(flat(180, 19.5));
    expect(rows[179].tempC).toBeNull();
    expect(rows[179].qc).toEqual(['persist:tempC']);
  });

  it('does not flag calm air or saturated air', () => {
    /**
     * Both genuinely sit still for hours, and both are common here. Flagging
     * them would delete every calm reading the station records — 31% of the
     * live corpus.
     */
    const calm = applyQc(Array.from({ length: 180 }, (_, i) => row(i * MIN, { windSpeedMs: 0 })));
    expect(calm.rows[179].windSpeedMs).toBe(0);
    expect(calm.flaggedRows).toBe(0);

    const fog = applyQc(Array.from({ length: 180 }, (_, i) => row(i * MIN, { humidityPct: 100 })));
    expect(fog.rows[179].humidityPct).toBe(100);
    expect(fog.flaggedRows).toBe(0);
  });

  it('a single moving reading clears the run', () => {
    const rows = [...flat(50, 19.5), row(50 * MIN, { tempC: 19.6 }), ...flat(50, 19.5).map((r, i) => row((51 + i) * MIN, { tempC: 19.5 }))];
    const out = applyQc(rows);
    expect(out.flaggedRows).toBe(0);
  });

  it('does not treat a value either side of an outage as a flat line', () => {
    const { rows } = applyQc([row(0, { tempC: 19.5 }), row(5 * 60 * MIN, { tempC: 19.5 })]);
    expect(rows[1].tempC).toBe(19.5);
  });
});

describe('QC — internal consistency', () => {
  it('rejects a dew point above air temperature', () => {
    // Both readings are individually plausible; only the pair is impossible.
    const { rows } = applyQc([row(0, { tempC: 12, dewPointC: 18 })]);
    expect(rows[0].dewPointC).toBeNull();
    expect(rows[0].tempC).toBe(12);
    expect(rows[0].qc).toEqual(['consistency:dewPointC>tempC']);
  });

  it('accepts saturated air, where dew point equals temperature', () => {
    const { rows } = applyQc([row(0, { tempC: 12, dewPointC: 12 })]);
    expect(rows[0].dewPointC).toBe(12);
    expect(rows[0].qc).toBeUndefined();
  });
});

describe('QC — state carried across files', () => {
  it('checks continuity across a file boundary', () => {
    /**
     * The environmental stream puts ONE row in each file. Without carry-in state
     * the step and persistence checks would have nothing to compare against and
     * would never fire on that stream at all.
     */
    const first = applyQc([row(0, { tempC: 18 })]);
    const second = applyQc([row(MIN, { tempC: 31 })], first.state);
    expect(second.rows[0].tempC).toBeNull();
    expect(second.rows[0].qc).toEqual(['step:tempC']);
  });

  it('finds an hour-long flat line spread over sixty one-row files', () => {
    let state: QcState = {};
    let flagged = 0;
    for (let i = 0; i < 90; i++) {
      const out = applyQc([row(i * MIN, { tempC: 19.5 })], state);
      state = out.state;
      flagged += out.flaggedRows;
    }
    expect(flagged).toBeGreaterThan(0);
  });

  it('sorts a catch-up batch into time order before judging continuity', () => {
    // A catch-up run can hand us files in any order. Out of order, the step
    // check would compare a reading against its own successor.
    const { rows } = applyQc([row(2 * MIN, { tempC: 18.2 }), row(0, { tempC: 18 }), row(MIN, { tempC: 18.1 })]);
    expect(rows.map((r) => r.timestampMs)).toEqual([0, MIN, 2 * MIN]);
    expect(rows.every((r) => r.qc === undefined)).toBe(true);
  });
});

describe('QC — the point of all of it: bad data leaves the statistics', () => {
  /**
   * The promise made to the client is that a flagged reading is excluded from
   * the reported figures. It holds because a failed check NULLS the field, and
   * every aggregate in the codebase already skips null — so this asserts the end
   * of the chain, not the middle of it. If someone later changes QC to merely
   * tag a row without nulling it, this test is what fails.
   */
  const DAY = Date.UTC(2026, 8, 14);

  it('keeps a stuck-sensor spike out of the day’s mean and maximum', () => {
    const clean = Array.from({ length: 20 }, (_, i) =>
      row(DAY + i * 1_000, { windSpeedMs: 5, windDirRelDeg: 90, status: 'A' }),
    );
    // One reading the sensor itself marked faulty, with a wildly high speed.
    const withFault = [...clean, row(DAY + 20_000, { windSpeedMs: 48, windDirRelDeg: 90, status: 'V' })];

    const raw = computeMetDaily(withFault as never, DAY, DAY + 86_400_000, DAY + 86_400_000);
    const qcd = computeMetDaily(applyQc(withFault).rows as never, DAY, DAY + 86_400_000, DAY + 86_400_000);

    // Untreated, one faulty reading becomes the day's headline gust.
    expect(raw.windSpeedMaxMs).toBe(48);
    expect(qcd.windSpeedMaxMs).toBe(5);
    expect(qcd.windSpeedAvgMs).toBe(5);
  });

  it('does not let the rejected reading distort the calm percentage', () => {
    // The denominator must lose the flagged reading too. If only the numerator
    // dropped it, QC would quietly change a statistic it was meant to protect.
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => row(DAY + i * 1_000, { windSpeedMs: 0.1, status: 'A' })),
      row(DAY + 9_000, { windSpeedMs: 12, status: 'V' }),
    ];
    const qcd = computeMetDaily(applyQc(rows).rows as never, DAY, DAY + 86_400_000, DAY + 86_400_000);
    expect(qcd.windCalmPct).toBe(100);
  });
});

describe('QC — a clean file is untouched', () => {
  it('adds nothing to ordinary readings', () => {
    const { rows, flaggedRows, counts } = applyQc([
      row(0, { windSpeedMs: 1.8, windDirRelDeg: 291, status: 'A' }),
      row(1_000, { windSpeedMs: 1.36, windDirRelDeg: 282, status: 'A' }),
      row(2_000, { windSpeedMs: 1.67, windDirRelDeg: 289, status: 'A' }),
    ]);
    expect(flaggedRows).toBe(0);
    expect(counts).toEqual({});
    expect(rows.every((r) => r.qc === undefined)).toBe(true);
  });
});
