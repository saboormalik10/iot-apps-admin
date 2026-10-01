import { ArrowUp } from 'lucide-react';
import type { LiveReading, StationLocation } from '@/lib/api/types';
import { Sparkline } from '@/components/charts/series';
import { StatusPill, readingTone } from '@/components/status/status-pill';
import { fmtInt, fmtSigned, fmtValue } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * One live reading.
 *
 * Every card names exactly which instrument it is — at the tunnel there are two
 * of each, and "Water level" twice is two cards nobody can tell apart — and
 * carries the line a controller reads the number with: the threshold it is
 * judged against, and the context that goes with it (the rain windows, where
 * the wind is from, whether the pressure is falling).
 */
const LABEL: Record<string, string> = {
  rainfall: 'Rainfall (1-hour total)',
  water_level: 'Water level',
  float_switch: 'Flood float switch',
  temperature: 'Air temperature',
  humidity: 'Relative humidity',
  wind_mean: 'Wind speed',
  wind_gust: 'Wind gust',
  wind_dir: 'Wind direction',
  pressure: 'Barometric pressure',
};

export function pointLabel(sensorId: string): string | null {
  if (sensorId.includes('-UP-')) return 'Up tunnel';
  if (sensorId.includes('-DN-')) return 'Down tunnel';
  return null;
}

export function ReadingCard({ reading: r, station }: { reading: LiveReading; station: StationLocation }) {
  const where = pointLabel(r.sensorId);
  const model = station.sensors.find((s) => s.sensorId === r.sensorId && s.parameter === r.parameter)?.model;
  const isDir = r.parameter === 'wind_dir';
  return (
    <article className="flex min-w-0 flex-col rounded-lg border bg-card p-3">
      <header className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium leading-tight">
            {LABEL[r.parameter] ?? r.parameter}
            {where ? <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase">{where}</span> : null}
          </h3>
          <p className="truncate text-xs text-muted-foreground">{model}</p>
        </div>
        {isDir ? null : <StatusPill tone={readingTone(r.status)} size="sm" />}
      </header>
      <div className="flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold">
          {display(r.parameter, r.value)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{r.unit}</span>
        </p>
        {isDir && r.value !== null ? (
          /* An arrow pointing where the wind is GOING, labelled with where it is
             FROM — the convention a met reader expects and the one that makes
             "crosswind on the viaduct" obvious. */
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border" aria-hidden>
            <ArrowUp className="h-5 w-5 text-[hsl(var(--chart-7))]" style={{ transform: `rotate(${(r.value + 180) % 360}deg)` }} />
          </span>
        ) : (
          <div className="w-24 shrink-0">
            <Sparkline points={r.spark} parameter={r.parameter} tone={r.status === 'alert' ? 'alert' : undefined} />
          </div>
        )}
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {r.thresholdLabel ? <p>{r.thresholdLabel}</p> : null}
        {r.note ? (
          <p className={cn(r.note.includes('DISAGREE') && 'font-semibold text-sev-alert-strong')}>{r.note}</p>
        ) : null}
      </div>
    </article>
  );
}

function display(parameter: string, value: number | null): string {
  if (value === null) return '–';
  if (parameter === 'float_switch') return value === 1 ? 'WET' : 'DRY';
  if (parameter === 'water_level') return fmtSigned(value);
  if (parameter === 'temperature' || parameter === 'humidity' || parameter === 'pressure' || parameter === 'rainfall') return fmtValue(value, 1);
  return fmtInt(value);
}
