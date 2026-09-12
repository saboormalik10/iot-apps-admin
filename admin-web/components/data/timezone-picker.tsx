'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select';

/**
 * Every IANA zone the runtime knows, from the runtime itself.
 *
 * `Intl.supportedValuesOf` is the engine's own tz database (418 zones today), so
 * the list cannot drift out of date the way a hardcoded one would — zones are
 * added and renamed most years. Engines without it fall back to a short list
 * covering the regions this platform is deployed in.
 */
export function allTimeZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  if (typeof supported === 'function') {
    try {
      const zones = supported('timeZone');
      // The engine lists GEOGRAPHIC zones only — no `UTC`, no `Etc/*`. But `UTC`
      // is this platform's own default and what the server stores when none is
      // given, so leaving it out would make an existing customer's value
      // unselectable and render the field blank for them.
      if (zones.length) return zones.includes('UTC') ? zones : ['UTC', ...zones];
    } catch {
      /* fall through */
    }
  }
  return [
    'UTC',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Brisbane',
    'Australia/Perth',
    'Pacific/Auckland',
    'Asia/Karachi',
    'Asia/Singapore',
    'Asia/Dubai',
    'Europe/London',
    'Europe/Amsterdam',
    'America/New_York',
    'America/Los_Angeles',
  ];
}

/** "GMT+10" for a zone right now — DST-aware, because it asks at today's date. */
export function offsetLabel(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** The viewer's own zone, offered first as a convenience. */
export function detectedTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** `Australia/Sydney` → `Australia`; bare zones like `UTC` group under "Other". */
const regionOf = (tz: string) => (tz.includes('/') ? tz.split('/')[0] : 'Other');

/**
 * Search text → comparable text.
 *
 * `/` and `_` become spaces so "new york" finds `America/New_York` — nobody
 * types the underscore, and requiring it would make the box look broken.
 */
const norm = (s: string) => s.toLowerCase().replace(/[_/]+/g, ' ');

/**
 * Does this zone match what was typed?
 *
 * Pure and exported so the matching is tested directly: driving a Radix Select's
 * portalled listbox in jsdom proves very little about whether "syd" finds
 * Sydney.
 *
 * Terms are ANDed, so "aus syd" narrows rather than widens. The OFFSET label is
 * searched too — "+10" is a perfectly reasonable way to look for a zone when you
 * know the offset but not the city.
 */
export function zoneMatches(tz: string, label: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const haystack = `${norm(tz)} ${norm(label)}`;
  return norm(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/**
 * TimeZonePicker — a dropdown of every IANA zone, grouped by region.
 *
 * Replaces a free-text box, where a typo did not fail loudly: ingest falls back
 * to `UTC` for an unknown zone, so a customer's days would be cut on the wrong
 * boundary and only look wrong much later — long after the records were written
 * with that boundary baked in.
 *
 * A Select rather than a search popover on purpose: this sits inside a modal
 * dialog, and the repo's Popover is built on the Dialog primitive. Radix Select
 * carries its own type-ahead, so typing "aus" still jumps to Australia.
 */
export function TimeZonePicker({
  id,
  value,
  onChange,
  className,
  'aria-invalid': ariaInvalid,
}: {
  id?: string;
  value: string;
  onChange: (tz: string) => void;
  className?: string;
  'aria-invalid'?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const detected = useMemo(detectedTimeZone, []);

  /**
   * Keep focus in the search box, and clear it on close.
   *
   * Two separate thefts to survive, both by Radix's roving focus:
   *
   *  1. ON OPEN it focuses the selected item, so the focus call is deferred a
   *     frame to land after it.
   *  2. ON EVERY KEYSTROKE the filtered items unmount and remount, and Radix
   *     moves focus to an item again. Without re-running this, exactly ONE
   *     character reached the box and the rest vanished into the listbox's
   *     type-ahead — typing "karachi" filtered on "k".
   *
   * Keyed on `query` rather than on a general re-render, so arrow-keying out of
   * the box and down into the list is not yanked back.
   */
  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const id = requestAnimationFrame(() => {
      const el = searchRef.current;
      if (el && document.activeElement !== el) el.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, query]);

  /**
   * Labels are built ONCE, not per render.
   *
   * `offsetLabel` constructs an `Intl.DateTimeFormat`, and there are 418 zones —
   * doing that on every render made the containing dialog so slow its tests
   * timed out, which is the same cost a user would have paid on every keystroke
   * in the form around it. Offsets only move at a DST boundary, so computing
   * them once per mount is accurate enough and effectively free.
   */
  const valueLabel = useMemo(() => {
    if (!value) return '';
    const off = offsetLabel(value);
    return off ? `${value} · ${off}` : value;
  }, [value]);

  const { groups, common } = useMemo(() => {
    const label = (tz: string) => {
      const off = offsetLabel(tz);
      return off ? `${tz} · ${off}` : tz;
    };

    const byRegion = new Map<string, { tz: string; text: string }[]>();
    for (const tz of allTimeZones()) {
      const region = regionOf(tz);
      const entry = { tz, text: label(tz) };
      const list = byRegion.get(region);
      if (list) list.push(entry);
      else byRegion.set(region, [entry]);
    }

    return {
      groups: [...byRegion.entries()].sort(([a], [b]) => a.localeCompare(b)),
      // Deduped: if the viewer IS in UTC, offer it once, not twice.
      common: [...new Set([detected, 'UTC'].filter((tz): tz is string => Boolean(tz)))].map((tz) => ({
        tz,
        text: label(tz),
      })),
    };
  }, [detected]);

  // Filtering the PREBUILT groups, so the expensive `offsetLabel` work is never
  // redone as the user types — only the cheap string match runs per keystroke.
  const visible = useMemo(() => {
    if (!query.trim()) return { common, groups };
    return {
      /**
       * No "Common" shortcut while searching.
       *
       * Those entries are deliberate duplicates of a zone that also appears in
       * its region, which is right for scanning and wrong for a filtered list:
       * searching "karachi" for a viewer already in Karachi returned the same
       * row twice, which reads as a bug. Someone who is searching has no use for
       * a shortcut, and nothing is lost — the zone still appears under its region.
       */
      common: [],
      groups: groups
        .map(([region, zones]) => [region, zones.filter(({ tz, text }) => zoneMatches(tz, text, query))] as const)
        .filter(([, zones]) => zones.length > 0),
    };
  }, [common, groups, query]);

  const empty = visible.common.length === 0 && visible.groups.length === 0;

  return (
    <Select open={open} onOpenChange={setOpen} value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={ariaInvalid} className={className}>
        {/* The label is rendered here rather than by `SelectValue`, which reads
            the mounted item registry — and the items below are deliberately not
            mounted until the list opens. */}
        <span className={value ? undefined : 'text-muted-foreground'}>
          {value ? valueLabel : 'Select a timezone'}
        </span>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {/* Built only while open.
            There are 418 zones, and creating that many elements on every render
            of the surrounding form was enough to make it visibly slow — its
            tests timed out, which is the same cost a user pays per keystroke.
            Closed, this list costs nothing. */}
        {!open ? null : (
          <>
        {/* Sticky so it stays reachable while scrolling 418 rows.
            `stopPropagation` on keydown is load-bearing: Radix Select runs its own
            type-ahead on the content, and without this every keystroke would be
            swallowed by it — the box would look focused and accept nothing. */}
        <div
          className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 border-b bg-popover px-2 py-2"
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city, region or offset…"
              aria-label="Search timezones"
              className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {empty ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No timezone matches “{query}”.
          </p>
        ) : null}

        {/* The likely answers first: the viewer's own zone (otherwise hundreds of
            rows down an alphabetical list) and UTC. Both also appear in their
            region below, so the list stays complete either way. */}
        {visible.common.length > 0 ? (
          <SelectGroup>
            <SelectLabel>Common</SelectLabel>
            {visible.common.map(({ tz, text }) => (
              <SelectItem key={`common-${tz}`} value={tz}>
                {text}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}

        {visible.groups.map(([region, zones]) => (
          <SelectGroup key={region}>
            <SelectLabel>{region}</SelectLabel>
            {zones.map(({ tz, text }) => (
              <SelectItem key={tz} value={tz}>
                {text}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}
