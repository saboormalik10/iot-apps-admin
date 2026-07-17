import type { DeviceType } from '@/lib/api/types';

/**
 * The CSV import contract (plan §6 / §Month 12), mirrored from
 * `backend/src/import/import.service.ts`. There is NO server dry-run, so this
 * module IS the dry-run: it reproduces the backend's parse rules exactly and
 * predicts what the import will do before the user commits to it.
 *
 * Mirror rules — any change here must be checked against import.service.ts:
 *  - rows: split on \r?\n, trim, drop blank lines, split on "," , trim cells
 *  - header: lowercased, matched by indexOf (order-independent, extras ignored)
 *  - values: "" → null; non-numeric → null
 *  - a row is skipped (not fatal) when its required fields don't parse
 *  - fatal: fewer than 2 lines; MET with zero valid rows
 */

export type ImportKind = 'nep' | 'met';

export const KIND_DEVICE_TYPE: Record<ImportKind, DeviceType> = {
  nep: 'NEP-LINK',
  met: 'MET-LINK',
};

/** Exact export headers — import and export round-trip these (plan §6). */
export const NEP_HEADER = [
  'SessionId',
  'Timestamp',
  'Turbidity_NTU',
  'Temperature_C',
  'ProbeRange',
  'Lat',
  'Lng',
  'Battery_%',
] as const;

export const MET_HEADER = [
  'Timestamp',
  'Temp_C',
  'Humidity_%',
  'Pressure_hPa',
  'WindSpeed_ms',
  'WindSpeed_kmh',
  'WindDir_deg',
  'DewPoint_C',
  'Precip_mm',
  'Solar_Wm2',
  'Voltage_V',
  'Lat',
  'Lng',
] as const;

export const HEADERS: Record<ImportKind, readonly string[]> = { nep: NEP_HEADER, met: MET_HEADER };

/** Columns the backend refuses the file without. */
export const REQUIRED: Record<ImportKind, readonly string[]> = {
  nep: ['SessionId', 'Timestamp'],
  met: ['Timestamp'],
};

/** Backend cap: multer `limits.fileSize` = 20 MB. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Mirrors the backend's `CSV_MIME` allow-list. */
export const ACCEPTED_MIME = ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv'];

export interface RowIssue {
  /** 1-based line number as the backend reports it (header is line 1). */
  line: number;
  reason: string;
}

export interface DryRunResult {
  kind: ImportKind;
  /** Header cells as found in the file, original case. */
  header: string[];
  /** Required columns the file is missing → import will be rejected. */
  missingRequired: string[];
  /** Columns present in the file that the importer ignores. */
  unknownColumns: string[];
  /** Contract columns absent from the file — imported as null, not an error. */
  absentOptional: string[];
  totalRows: number;
  validRows: number;
  /** Rows the backend will skip, with the reason it will report. */
  issues: RowIssue[];
  /** First rows, parsed, for the preview table. */
  preview: Record<string, string>[];
  /** NEP only — the file's distinct SessionIds (upsert is keyed on these). */
  sessionIds: string[];
  /** Epoch-ms span of the valid rows. */
  timeRange: { from: number; to: number } | null;
  /** Blocking problems — the import cannot be submitted. */
  errors: string[];
  /** Non-blocking things the user should see before committing. */
  warnings: string[];
}

/** Mirrors `parseImportTimestampMs` in backend/src/import/parse-import-timestamp.ts. */
export function parseTimestamp(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;
  if (/^-?\d+$/.test(s)) return Number(s);
  return Date.parse(s.replace(' ', 'T'));
}

/** Mirrors the backend `num()`: "" → null, non-finite → null. */
export function parseNum(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Mirrors the backend `splitCsv()` — naive, no quoted-field handling. */
export function splitCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split(',').map((c) => c.trim()));
}

const PREVIEW_ROWS = 8;
/** The backend stops collecting after 50 row errors; mirror that so counts agree. */
const MAX_ISSUES = 50;

/**
 * Predicts the outcome of `POST /import/{kind}` for this file. Pure — no network.
 * Every `errors` entry blocks submission; `warnings` are advisory.
 */
export function dryRun(kind: ImportKind, text: string): DryRunResult {
  const contract = HEADERS[kind];
  const required = REQUIRED[kind];

  const base: DryRunResult = {
    kind,
    header: [],
    missingRequired: [],
    unknownColumns: [],
    absentOptional: [],
    totalRows: 0,
    validRows: 0,
    issues: [],
    preview: [],
    sessionIds: [],
    timeRange: null,
    errors: [],
    warnings: [],
  };

  const rows = splitCsv(text);
  if (rows.length < 2) {
    return { ...base, errors: ['CSV is empty or has no data rows.'] };
  }

  const header = rows[0];
  const lower = header.map((h) => h.toLowerCase());
  const at = (name: string) => lower.indexOf(name.toLowerCase());

  const missingRequired = required.filter((c) => at(c) < 0);
  const unknownColumns = header.filter((h) => !contract.some((c) => c.toLowerCase() === h.toLowerCase()));
  const absentOptional = contract.filter((c) => !required.includes(c) && at(c) < 0);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (missingRequired.length) {
    errors.push(
      `Missing required ${missingRequired.length > 1 ? 'columns' : 'column'}: ${missingRequired.join(', ')}.`,
    );
  }
  if (unknownColumns.length) {
    warnings.push(`Ignored ${unknownColumns.length > 1 ? 'columns' : 'column'}: ${unknownColumns.join(', ')}.`);
  }
  if (absentOptional.length) {
    warnings.push(`Not in this file, will import as empty: ${absentOptional.join(', ')}.`);
  }
  // The backend splits on every comma, so a quoted comma silently shifts columns.
  if (text.includes('"')) {
    warnings.push(
      'This file contains quote characters. The importer splits on every comma and does not understand quoted fields, so a comma inside a quoted value will shift that row’s columns.',
    );
  }

  const iTs = at('Timestamp');
  const iSession = kind === 'nep' ? at('SessionId') : -1;

  const issues: RowIssue[] = [];
  const preview: Record<string, string>[] = [];
  const sessionIds = new Set<string>();
  let validRows = 0;
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 1; // backend reports `Row ${i + 1}`
    const ts = iTs >= 0 ? parseTimestamp(r[iTs]) : NaN;
    const sessionId = iSession >= 0 ? r[iSession] : '';

    const badTs = !Number.isFinite(ts);
    const badSession = kind === 'nep' && !sessionId;

    if (badTs || badSession) {
      if (issues.length < MAX_ISSUES) {
        const why = badSession && badTs ? 'missing SessionId and unparseable Timestamp'
          : badSession ? 'missing SessionId'
          : `unparseable Timestamp${r[iTs] ? ` (“${r[iTs]}”)` : ''}`;
        issues.push({ line, reason: why });
      }
      continue;
    }

    if (r.length !== header.length && issues.length < MAX_ISSUES) {
      warnings.push(`Row ${line} has ${r.length} values but the header has ${header.length}.`);
    }

    validRows++;
    if (sessionId) sessionIds.add(sessionId);
    if (ts < from) from = ts;
    if (ts > to) to = ts;

    if (preview.length < PREVIEW_ROWS) {
      const obj: Record<string, string> = {};
      header.forEach((h, c) => (obj[h] = r[c] ?? ''));
      preview.push(obj);
    }
  }

  const totalRows = rows.length - 1;

  if (validRows === 0 && !errors.length) {
    errors.push('No valid data rows found — every row is missing a usable timestamp.');
  }
  if (issues.length && validRows > 0) {
    warnings.push(`${totalRows - validRows} of ${totalRows} rows will be skipped.`);
  }

  return {
    kind,
    header,
    missingRequired,
    unknownColumns,
    absentOptional,
    totalRows,
    validRows,
    issues,
    preview,
    sessionIds: [...sessionIds],
    timeRange: validRows > 0 ? { from, to } : null,
    errors,
    warnings: [...new Set(warnings)],
  };
}

/** Guesses the file's kind from its header so the wizard can pre-select it. */
export function detectKind(text: string): ImportKind | null {
  const first = splitCsv(text)[0];
  if (!first) return null;
  const lower = first.map((h) => h.toLowerCase());
  if (lower.includes('sessionid') && lower.includes('turbidity_ntu')) return 'nep';
  if (lower.includes('temp_c') || lower.includes('windspeed_ms') || lower.includes('pressure_hpa')) return 'met';
  if (lower.includes('sessionid')) return 'nep';
  return null;
}
