import { describe, it, expect } from 'vitest';
import { mergeMeasureRows } from '@/features/records/merge-measure-rows';
import type { MetMeasureRow } from '@/lib/api/types';

/**
 * Wind and environmental arrive as separate FILES, so they are stored as
 * separate rows — ~60 wind rows a minute, and one environmental row carrying
 * only temperature, humidity and pressure. In a table that reads as a dropout:
 * one line in sixty has a temperature and no wind.
 *
 * The dangerous version of this fix is "group by timestamp". The sensor emits
 * more than one wind reading in the same second, so that would silently discard
 * readings — which is why the tests below count rows, not just fields.
 */
let seq = 0;
const row = (over: Partial<MetMeasureRow>): MetMeasureRow =>
  ({
    _id: `r${++seq}`, recordId: 'rec', rowType: 'data', dataSentence: '', timeStamp: '',
    timestampMs: 0, windSpeedMs: null, windSpeedTrueMs: null, windSpeedRelMs: null,
    windDirTrueDeg: null, windDirRelDeg: null, tempC: null, humidityPct: null,
    pressureHpa: null, dewPointC: null, ...over,
  }) as MetMeasureRow;

const wind = (t: number, speed: number) => row({ timestampMs: t, windSpeedMs: speed, windDirTrueDeg: 50 });
const env = (t: number) => row({ timestampMs: t, tempC: 18.8, humidityPct: 60.3, pressureHpa: 1010.8, dewPointC: 11 });

describe('mergeMeasureRows', () => {
  it('folds the environmental reading into the wind row at that instant', () => {
    const out = mergeMeasureRows([wind(1000, 2.0), env(1000)]);
    expect(out).toHaveLength(1);
    expect(out[0].windSpeedMs).toBe(2.0);
    expect(out[0].tempC).toBe(18.8);
    expect(out[0].dewPointC).toBe(11);
  });

  it('NEVER collapses two wind readings that share a second', () => {
    // The real data has exactly this: 10:04:59 twice, different speeds. A
    // group-by-timestamp implementation loses one of them.
    const out = mergeMeasureRows([wind(1000, 1.69), wind(1000, 1.89)]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.windSpeedMs)).toEqual([1.69, 1.89]);
  });

  it('absorbs into ONE wind row when several share the instant', () => {
    const out = mergeMeasureRows([wind(1000, 1.69), wind(1000, 1.89), env(1000)]);
    expect(out).toHaveLength(2);
    expect(out.filter((r) => r.tempC != null)).toHaveLength(1);
    // …and the other keeps its own reading untouched.
    expect(out.map((r) => r.windSpeedMs)).toEqual([1.69, 1.89]);
  });

  it('matches within the MINUTE, not the exact second', () => {
    /**
     * The case that made the first attempt useless. The wind sensor is roughly
     * but not exactly 1 Hz, so a real minute reads :00, :02, :03, :04 — and the
     * environmental row at :01 had no partner at its own instant, so nothing
     * ever merged.
     */
    const out = mergeMeasureRows([wind(60_000, 0.7), env(61_000), wind(62_000, 0.7)]);
    expect(out).toHaveLength(2);
    const withTemp = out.filter((r) => r.tempC != null);
    expect(withTemp).toHaveLength(1);
    expect(withTemp[0].windSpeedMs).toBe(0.7);
  });

  it('picks the CLOSEST wind row in that minute', () => {
    const out = mergeMeasureRows([wind(60_000, 1.1), wind(64_000, 2.2), env(63_500)]);
    expect(out.find((r) => r.tempC != null)?.windSpeedMs).toBe(2.2);
  });

  it('never crosses a minute boundary', () => {
    // A minute mean describes ITS minute. Showing it against the next one would
    // not be arbitrary, it would be wrong.
    const out = mergeMeasureRows([wind(59_000, 1.0), env(60_000)]);
    expect(out).toHaveLength(2);
    expect(out[1].tempC).toBe(18.8);
    expect(out[1].windSpeedMs).toBeNull();
  });

  it('keeps an environmental row that has no wind in its minute', () => {
    // Dropping it, or shifting it into a minute it does not describe, would be
    // inventing data — better a lone row than a wrong one.
    const out = mergeMeasureRows([wind(1000, 2.0), env(300_000)]);
    expect(out).toHaveLength(2);
    expect(out[1].tempC).toBe(18.8);
    expect(out[1].windSpeedMs).toBeNull();
  });

  it('loses no reading at all across a realistic minute', () => {
    const rows = [
      wind(998, 1.69), wind(999, 1.89), wind(1000, 2.02), env(1000),
      wind(1002, 2.24), wind(1002, 2.81),
    ];
    const out = mergeMeasureRows(rows);
    expect(out).toHaveLength(5); // one fewer row, because one was folded IN
    // Every wind reading survives.
    expect(out.map((r) => r.windSpeedMs)).toEqual([1.69, 1.89, 2.02, 2.24, 2.81]);
    // And the temperature is on the 10:05:00 line now.
    expect(out.find((r) => r.timestampMs === 1000)?.tempC).toBe(18.8);
  });

  it('preserves chronological order', () => {
    const out = mergeMeasureRows([wind(1, 1), wind(2, 2), env(2), wind(3, 3)]);
    expect(out.map((r) => r.timestampMs)).toEqual([1, 2, 3]);
  });

  it('leaves a page with no environmental rows exactly as it was', () => {
    const rows = [wind(1, 1), wind(2, 2)];
    expect(mergeMeasureRows(rows)).toEqual(rows);
  });

  it('does not merge two environmental rows together', () => {
    const out = mergeMeasureRows([env(1000), env(1000)]);
    expect(out).toHaveLength(2);
  });

  it('handles an empty page', () => {
    expect(mergeMeasureRows([])).toEqual([]);
  });
});

describe('mergeMeasureRows — QC flags', () => {
  it('carries both rows’ QC codes onto the merged line', () => {
    // Folding the environmental reading into the wind row must not drop the
    // explanation for why its temperature cell is blank.
    const out = mergeMeasureRows([
      row({ timestampMs: 1000, windSpeedMs: 2, windDirTrueDeg: 50, qc: ['status:V'] }),
      row({ timestampMs: 1000, tempC: 18.8, qc: ['range:humidityPct'] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].qc).toEqual(['status:V', 'range:humidityPct']);
  });

  it('still folds a minute whose environmental values were ALL rejected', () => {
    /**
     * QC nulls the field it rejects, so a fully-rejected environmental row has
     * no values at all. Judged on values alone it is neither wind nor
     * environmental, and it settles on its own blank line — an unexplained gap
     * in the table. The QC codes are the evidence of what it was.
     */
    const out = mergeMeasureRows([
      row({ timestampMs: 1000, windSpeedMs: 2, windDirTrueDeg: 50 }),
      row({ timestampMs: 1400, qc: ['range:tempC', 'range:humidityPct'] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].windSpeedMs).toBe(2);
    expect(out[0].qc).toEqual(['range:tempC', 'range:humidityPct']);
  });

  it('leaves a clean pair without a qc key', () => {
    const out = mergeMeasureRows([wind(1000, 2.0), env(1000)]);
    expect(out[0].qc).toBeUndefined();
  });
});
