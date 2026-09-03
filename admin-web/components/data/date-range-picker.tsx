'use client';

import { RANGE_PRESETS, type RangePreset } from '@/lib/hooks/use-scope';
import {
  Select,
  SelectContent,
  SelectItem,
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
};

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
        {RANGE_PRESETS.map((p) => (
          <SelectItem key={p.key} value={p.key}>
            {RANGE_LABELS[p.key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
