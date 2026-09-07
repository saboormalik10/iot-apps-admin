'use client';

import { useMemo, useState } from 'react';
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
  const detected = useMemo(detectedTimeZone, []);

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
        {/* The likely answers first: the viewer's own zone (otherwise hundreds of
            rows down an alphabetical list) and UTC. Both also appear in their
            region below, so the list stays complete either way. */}
        {common.length > 0 ? (
          <SelectGroup>
            <SelectLabel>Common</SelectLabel>
            {common.map(({ tz, text }) => (
              <SelectItem key={`common-${tz}`} value={tz}>
                {text}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}

        {groups.map(([region, zones]) => (
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
