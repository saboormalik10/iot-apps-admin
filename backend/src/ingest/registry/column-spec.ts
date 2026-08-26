/**
 * Declarative column specifications, shared by every stream type.
 *
 * A stream's format is described as DATA — a list of columns with their aliases
 * — rather than as parsing code. Adding a sensor to an existing stream is then
 * one entry in an array; adding a whole stream is one array. That is the M22
 * deliverable: when the client's water-quality or air-quality files arrive,
 * onboarding is configuration, not a month of discovery through `ingest.service`.
 *
 * Generic over the field name so each stream keeps its OWN vocabulary and its
 * own alias index. A single global map would mean one stream's `temperature`
 * silently claimed another's.
 */

/** Speed units the MET stream understands. Other streams may ignore this. */
export type FixedUnit = 'kmh' | 'ms' | 'kn' | 'mph';

export interface ColumnSpec<TField extends string = string> {
  /** Canonical field this column feeds. `__`-prefixed names are internal. */
  field: TField;
  /**
   * Header cells that map to this column, matched EXACTLY (case-insensitively).
   *
   * Exact, never substring: `direction` is a prefix of `direction_deg`, and a
   * substring match made the shorter alias swallow the longer column — which is
   * how a real file's `direction_deg` ended up read as `direction`.
   */
  aliases: string[];
  numeric: boolean;
  /**
   * The unit this column is always in, when the name says so
   * (`windspeed_kmh`). Overrides any per-row unit column.
   */
  fixedUnit?: FixedUnit;
}

export interface ColumnIndex<TField extends string = string> {
  /** Exact, case-insensitive lookup. Null for an unrecognised header cell. */
  specForHeader(cell: string): ColumnSpec<TField> | null;
  /** Canonical fields a caller can expect stored — excludes the `__` internals. */
  storedFields: readonly TField[];
  /** Every alias, for the preview screen and for diagnostics. */
  aliases: readonly string[];
}

/**
 * Build the alias index for one stream's columns.
 *
 * Collisions THROW at construction, not at parse time. Two columns claiming the
 * same alias is a programming error in a spec, and discovering it while reading
 * a customer's file means silently attributing their readings to the wrong
 * field — so it fails when the module loads instead.
 */
export function createColumnIndex<TField extends string>(
  columns: readonly ColumnSpec<TField>[],
): ColumnIndex<TField> {
  const map = new Map<string, ColumnSpec<TField>>();

  for (const spec of columns) {
    for (const alias of spec.aliases) {
      const key = alias.trim().toLowerCase();
      if (!key) throw new Error(`Column "${spec.field}" has an empty alias`);
      const existing = map.get(key);
      if (existing && existing.field !== spec.field) {
        throw new Error(`Column alias "${alias}" is claimed by both ${existing.field} and ${spec.field}`);
      }
      map.set(key, spec);
    }
  }

  return {
    specForHeader: (cell: string) => map.get(cell.trim().toLowerCase()) ?? null,
    storedFields: Object.freeze(
      [...new Set(columns.map((c) => c.field))].filter((f) => !f.startsWith('__')),
    ) as readonly TField[],
    aliases: Object.freeze([...map.keys()]),
  };
}
