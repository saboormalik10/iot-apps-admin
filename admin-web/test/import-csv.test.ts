import { describe, it, expect } from 'vitest';
import {
  MET_HEADER,
  NEP_HEADER,
  detectKind,
  dryRun,
  parseNum,
  parseTimestamp,
  splitCsv,
} from '@/features/import/csv-contract';

/**
 * The dry-run has no server counterpart — it IS the preview (plan §Month 12), so
 * it has to predict `backend/src/import/import.service.ts` exactly. These tests
 * pin the mirror: if the backend parser changes, one of these should fail.
 */

const nepCsv = (rows: string[]) => [NEP_HEADER.join(','), ...rows].join('\n');
const metCsv = (rows: string[]) => [MET_HEADER.join(','), ...rows].join('\n');

const EPOCH = 1737000000000; // 2025-01-16T04:00:00.000Z

describe('parseTimestamp (mirrors backend parseImportTimestampMs)', () => {
  it('round-trips the bare epoch-ms the exporters write', () => {
    expect(parseTimestamp(String(EPOCH))).toBe(EPOCH);
  });
  it('accepts ISO and space-separated', () => {
    expect(parseTimestamp('2025-01-16T04:00:00.000Z')).toBe(EPOCH);
    expect(parseTimestamp('2025-01-16 04:00:00.000Z')).toBe(EPOCH);
  });
  it('returns NaN rather than falling back to now', () => {
    expect(parseTimestamp('garbage')).toBeNaN();
    expect(parseTimestamp('')).toBeNaN();
    expect(parseTimestamp(undefined)).toBeNaN();
  });
});

describe('parseNum / splitCsv (mirror the backend helpers)', () => {
  it('empty → null, non-numeric → null', () => {
    expect(parseNum('')).toBeNull();
    expect(parseNum(undefined)).toBeNull();
    expect(parseNum('abc')).toBeNull();
    expect(parseNum('1.5')).toBe(1.5);
  });
  it('drops blank lines and trims cells, like the backend', () => {
    expect(splitCsv('a, b\n\n1 , 2 \n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('detectKind', () => {
  it('detects NEP from its header', () => {
    expect(detectKind(nepCsv([]))).toBe('nep');
  });
  it('detects MET from its header', () => {
    expect(detectKind(metCsv([]))).toBe('met');
  });
  it('returns null for an unrecognizable header', () => {
    expect(detectKind('foo,bar\n1,2')).toBeNull();
  });
});

describe('dryRun — NEP', () => {
  it('counts valid rows, sessions and the time span', () => {
    const r = dryRun(
      'nep',
      nepCsv([`s1,${EPOCH},12.5,20.1,R2,1.1,2.2,90`, `s1,${EPOCH + 1000},12.6,20.2,R2,1.1,2.2,89`, `s2,${EPOCH + 2000},400,20.3,R3,1.1,2.2,88`]),
    );
    expect(r.errors).toEqual([]);
    expect(r.totalRows).toBe(3);
    expect(r.validRows).toBe(3);
    expect(r.sessionIds).toEqual(['s1', 's2']);
    expect(r.timeRange).toEqual({ from: EPOCH, to: EPOCH + 2000 });
  });

  it('skips rows missing SessionId or with an unparseable Timestamp, and reports them', () => {
    const r = dryRun('nep', nepCsv([`s1,${EPOCH},1,2,R1,,,`, `,${EPOCH},1,2,R1,,,`, `s2,nope,1,2,R1,,,`]));
    expect(r.validRows).toBe(1);
    expect(r.issues).toHaveLength(2);
    expect(r.issues[0]).toMatchObject({ line: 3, reason: 'missing SessionId' });
    expect(r.issues[1].line).toBe(4);
    expect(r.issues[1].reason).toContain('unparseable Timestamp');
    // Non-fatal: the import still runs for the good row.
    expect(r.errors).toEqual([]);
  });

  it('blocks when a required column is absent', () => {
    const r = dryRun('nep', 'Timestamp,Turbidity_NTU\n1737000000000,5');
    expect(r.missingRequired).toEqual(['SessionId']);
    expect(r.errors[0]).toContain('SessionId');
  });

  it('caps reported issues at 50, like the backend', () => {
    const bad = Array.from({ length: 60 }, () => `,${EPOCH},1,2,R1,,,`);
    const r = dryRun('nep', nepCsv(bad));
    expect(r.totalRows).toBe(60);
    expect(r.validRows).toBe(0);
    expect(r.issues).toHaveLength(50);
  });
});

describe('dryRun — MET', () => {
  it('accepts the exporter’s epoch-ms timestamps (the round-trip regression)', () => {
    const r = dryRun('met', metCsv([`${EPOCH},20.1,55,1013,3.2,11.5,180,10.2,0,500,12.1,1.1,2.2`]));
    expect(r.errors).toEqual([]);
    expect(r.validRows).toBe(1);
    expect(r.timeRange).toEqual({ from: EPOCH, to: EPOCH });
  });

  it('errors when no row has a usable timestamp', () => {
    const r = dryRun('met', metCsv(['nope,20.1,55,1013,3.2,11.5,180,10.2,0,500,12.1,1.1,2.2']));
    expect(r.validRows).toBe(0);
    expect(r.errors[0]).toContain('No valid data rows');
  });

  it('errors on a file with no data rows', () => {
    expect(dryRun('met', metCsv([])).errors[0]).toContain('no data rows');
  });

  it('warns about unknown and absent optional columns without blocking', () => {
    const r = dryRun('met', `Timestamp,Temp_C,Nonsense\n${EPOCH},20.1,x`);
    expect(r.errors).toEqual([]);
    expect(r.validRows).toBe(1);
    expect(r.unknownColumns).toEqual(['Nonsense']);
    expect(r.absentOptional).toContain('Pressure_hPa');
    expect(r.warnings.some((w) => w.includes('Nonsense'))).toBe(true);
  });

  it('warns that quoted fields will shift columns (the backend splits on every comma)', () => {
    const r = dryRun('met', `Timestamp,Temp_C\n${EPOCH},"20,1"`);
    expect(r.warnings.some((w) => w.includes('quote'))).toBe(true);
  });

  it('matches header columns case-insensitively and ignores order', () => {
    const r = dryRun('met', `temp_c,TIMESTAMP\n20.1,${EPOCH}`);
    expect(r.errors).toEqual([]);
    expect(r.validRows).toBe(1);
  });

  describe("the station's own header", () => {
    it('detects a real WindSonic file as MET', () => {
      // `timestamp,direction,speed,units,status` is what the client actually
      // sends. It was not detected at all — every real file fell through to
      // "unknown" and had to be classified by hand.
      expect(detectKind('timestamp,direction,speed,units,status\n')).toBe('met');
    });

    it('accepts both direction spellings, as everywhere else', () => {
      expect(detectKind('timestamp,direction_deg,speed,units,status\n')).toBe('met');
      expect(detectKind('timestamp,dir,speed,units,status\n')).toBe('met');
    });

    it('still detects our own MET export header', () => {
      expect(detectKind('Timestamp,Temp_C,Humidity_%,Pressure_hPa\n')).toBe('met');
    });

    it('does not claim a header that merely has a timestamp', () => {
      expect(detectKind('timestamp,value\n')).toBeNull();
    });
  });

  describe('alias spellings', () => {
    it('does not report the other spellings as missing', () => {
      // A file using `direction` was told `direction_deg` and `dir` were "not in
      // this file, will import as empty" — true, and completely misleading.
      const r = dryRun('met', 'timestamp,direction,speed,units,status\n2026-08-25T09:00:00+10:00,350,0.5,K,A\n');
      const absent = r.warnings.find((w) => w.includes('will import as empty')) ?? '';
      expect(absent).not.toMatch(/direction_deg/);
      expect(absent).not.toMatch(/\bdir\b/);
    });

    it('still reports genuinely absent optional columns', () => {
      const r = dryRun('met', 'timestamp,direction,speed,units,status\n2026-08-25T09:00:00+10:00,350,0.5,K,A\n');
      expect(r.warnings.join(' ')).toMatch(/Temp_C/);
    });
  });
});
