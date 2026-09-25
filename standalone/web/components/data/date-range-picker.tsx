'use client';

import { RANGE_PRESETS, type RangePreset } from '@/lib/hooks/use-scope';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Exported so other surfaces name the range exactly as the picker does. */
export const RANGE_LABELS: Record<RangePreset, string> = {
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
  today: 'Today',
  yesterday: 'Yesterday',
  last7days: 'Last 7 days',
};

/**
 * Which family a preset belongs to, spelled out for the reader.
 *
 * Rolling and calendar presets can name the same span — "Last 7 days" means both
 * "the last 168 hours" and "the last 7 calendar days", and they are genuinely
 * different windows. The group heading is what tells them apart, so it is not
 * decoration: without it the menu offers the same words twice.
 */
const GROUPS: { kind: 'rolling' | 'day'; heading: string; hint: string }[] = [
  { kind: 'rolling', heading: 'Rolling', hint: 'counted back from right now' },
  { kind: 'day', heading: 'Calendar days', hint: 'your local midnight' },
];

/**
 * DateRangePicker — the quick-preset range control used by the Scope Bar. The
 * preset keys are exactly the ones the scope hook understands; the resolved
 * epoch-ms window is derived from the key (see `rangeWindow`).
 */
export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: RangePreset;
  onChange: (range: RangePreset) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RangePreset)}>
      <SelectTrigger className={className} aria-label="Date range">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GROUPS.map(({ kind, heading, hint }) => {
          const presets = RANGE_PRESETS.filter((p) => p.kind === kind);
          if (presets.length === 0) return null;
          return (
            <SelectGroup key={kind}>
              <SelectLabel>
                {heading} <span className="normal-case opacity-70">· {hint}</span>
              </SelectLabel>
              {presets.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {RANGE_LABELS[p.key]}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
