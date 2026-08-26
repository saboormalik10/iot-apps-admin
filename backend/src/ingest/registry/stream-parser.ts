import { ParsedMetFile } from '../met-csv/parse-met-csv';
import { ColumnSpec } from './column-spec';

/**
 * What every stream parser must produce.
 *
 * Deliberately the SHAPE THE MET PARSER ALREADY RETURNS rather than a new
 * abstraction invented for the occasion. The whole ingest pipeline — day
 * records, `availableSensors`, alert evaluation, the unit code — is built on
 * these fields, so a parser that returned something else would need all of that
 * rewritten to accept it. Widening this is a deliberate act, not a side effect
 * of adding a sensor.
 */
export type ParsedStreamFile = ParsedMetFile;

export interface ParseOptions {
  /**
   * Skip the trailing-newline completeness check.
   *
   * True for an admin upload, where the file is known-complete; false for the
   * SFTP agent, where a missing terminator means the logger was still writing.
   */
  assumeComplete?: boolean;
}

/**
 * A registered way of turning a file into readings.
 *
 * `key` is what `StationAccount.streamType` stores, so it is a stable identifier
 * — renaming one orphans every station pointing at it.
 */
export interface StreamParser {
  key: string;
  /** Shown in the admin UI when choosing a stream type. */
  label: string;
  /** What a file of this type looks like, for the operator registering one. */
  description: string;
  /** Filename patterns this parser expects, for the preview screen (M22 W3-4). */
  filenameHint?: RegExp;
  /**
   * The stream's columns, as data.
   *
   * Published so the admin UI can show an operator which header cells a stream
   * understands BEFORE they point a station at it — the alternative is finding
   * out from a quarantine folder.
   */
  columns?: readonly ColumnSpec[];
  parse(content: string, options?: ParseOptions): ParsedStreamFile;
}

/**
 * The registry.
 *
 * A Map rather than a switch so a stream type can be added by REGISTERING rather
 * than by editing the ingest path — which is the entire point of M22: when the
 * client's water-quality or air-quality files finally arrive, onboarding them
 * should be a registry entry plus a column spec, not a month of surgery through
 * `ingest.service`.
 */
const parsers = new Map<string, StreamParser>();

export function registerStreamParser(parser: StreamParser): void {
  if (parsers.has(parser.key)) {
    // Silently replacing one would make two modules disagree about how a
    // customer's files are read, with the load order deciding.
    throw new Error(`A stream parser is already registered for "${parser.key}"`);
  }
  parsers.set(parser.key, parser);
}

export function getStreamParser(key: string): StreamParser | null {
  return parsers.get(key) ?? null;
}

export function listStreamParsers(): StreamParser[] {
  return [...parsers.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Test-only: lets a spec register and clean up without leaking into others. */
export function unregisterStreamParser(key: string): void {
  parsers.delete(key);
}

export type { ColumnSpec } from './column-spec';
