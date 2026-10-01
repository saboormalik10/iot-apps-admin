'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import type { StationLive } from '@/lib/api/types';
import { buildSeries, statusFor } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { HoverTip, TipRow, useHoverTip } from '@/components/charts/hover-tip';
import { fmtSigned, fmtTime } from '@/lib/format';
import { THRESHOLDS } from '@/lib/mock/seed/thresholds';
import { cn } from '@/lib/utils';

/**
 * Every water-level point on the line, now, against its own lines.
 *
 * The map answers "where"; the threshold timeline answers "when". This answers
 * the controller's first question in a flood — how close is each point to the
 * rail? — in one glance down a single scale: a bar for the level now, a tick for
 * the highest it reached in 24 hours, and the standing-water and rail-foot lines
 * drawn through all of them. Rate of rise beside each, because +60 mm and rising
 * fast is a different morning from +60 mm and falling.
 */
interface Point {
  key: string;
  locationId: string;
  label: string;
  level: number | null;
  peak: { t: number; v: number } | null;
  rateMmHr: number | null;
  pumps: boolean;
}

const F = THRESHOLDS.flood;

export function FloodPointsPanel({ stations, minuteKey }: { stations: StationLive[]; minuteKey: number }) {
  const { ref, tip, bind } = useHoverTip();

  const points: Point[] = useMemo(() => {
    const out: Point[] = [];
    for (const s of stations) {
      const sensors = s.location.sensors.filter((x) => x.parameter === 'water_level');
      for (const sensor of sensors) {
        const reading = s.readings.find((r) => r.parameter === 'water_level' && r.sensorId === sensor.sensorId);
        const now = s.updatedAt;
        const day = buildSeries('water_level', s.location.id, now - 24 * 3_600_000, now, 288, sensor.sensorId);
        const peak = day.reduce<Point['peak']>((m, p) => (p.v !== null && (!m || p.v > m.v) ? { t: p.t, v: p.v } : m), null);
        const recent = buildSeries('water_level', s.location.id, now - 10 * 60_000, now, 10, sensor.sensorId);
        const a = recent[0]?.v;
        const b = recent[recent.length - 1]?.v;
        const tunnel = sensor.sensorId.includes('-UP-') ? ' — up' : sensor.sensorId.includes('-DN-') ? ' — down' : '';
        out.push({
          key: sensor.sensorId,
          locationId: s.location.id,
          label: `${s.location.ordinal}. ${s.location.name.replace(' (tunnel)', '')}${tunnel}`,
          level: reading?.value ?? null,
          peak,
          rateMmHr: a === null || a === undefined || b === null || b === undefined ? null : Math.round((b - a) * 6),
          pumps: Boolean(s.location.pumpStation),
        });
      }
    }
    return out;
    // Re-read on the minute, with the stations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, minuteKey]);

  const max = Math.max(250, ...points.map((p) => Math.max(p.level ?? 0, p.peak?.v ?? 0) + 10));
  const x = (v: number) => `${(Math.max(0, Math.min(v, max)) / max) * 100}%`;
  const lines = [
    { v: F.standingWaterMm, label: `+${F.standingWaterMm}`, title: 'standing water', strong: false },
    { v: F.railFootMm, label: `+${F.railFootMm}`, title: 'rail foot — block the line', strong: true },
  ];

  return (
    <ChartFrame
      as="h2"
      title="Flood points — now"
      unit="mm above datum"
      footnote="Bar: level now · tick: highest in the last 24 h · arrow: change over the last 10 minutes"
      table={{
        head: ['Point', 'Now (mm)', 'Status', 'Peak 24 h (mm)', 'At', 'Rate (mm/hr)'],
        rows: points.map((p) => [
          p.label,
          p.level ?? '–',
          p.level === null ? 'no radar' : statusFor('water_level', p.level),
          p.peak?.v ?? '–',
          p.peak ? fmtTime(p.peak.t) : '–',
          p.rateMmHr ?? '–',
        ]),
      }}
    >
      <div ref={ref} className="relative">
        {/* the scale, once, above the rows */}
        <div className="mb-1 grid grid-cols-[minmax(0,9.5rem)_1fr_4.5rem] items-end gap-2 text-[10px] text-muted-foreground sm:grid-cols-[minmax(0,11rem)_1fr_5rem]">
          <span />
          <div className="relative h-4">
            {lines.map((l) => (
              <span key={l.v} className="tabular absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x(l.v) }}>
                {l.label}
              </span>
            ))}
          </div>
          <span />
        </div>

        <ul className="space-y-1.5">
          {points.map((p) => {
            const st = p.level === null ? 'offline' : statusFor('water_level', p.level);
            const color =
              st === 'alert' ? 'bg-sev-alert' : st === 'warning' ? 'bg-sev-warning' : st === 'offline' ? 'bg-sev-offline' : 'bg-sev-normal';
            const Rate = p.rateMmHr === null ? null : p.rateMmHr >= 6 ? ArrowUp : p.rateMmHr <= -6 ? ArrowDown : ArrowRight;
            return (
              <li
                key={p.key}
                className="grid grid-cols-[minmax(0,9.5rem)_1fr_4.5rem] items-center gap-2 rounded px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,11rem)_1fr_5rem]"
                {...bind(
                  <>
                    <p className="mb-1 font-semibold">{p.label}</p>
                    <TipRow value={p.level === null ? '–' : `${fmtSigned(p.level)} mm`} label={p.level === null ? 'radar not reporting' : `now · ${st}`} />
                    {p.peak ? <TipRow value={`${fmtSigned(p.peak.v)} mm`} label={`peak 24 h · ${fmtTime(p.peak.t)}`} /> : null}
                    {p.rateMmHr !== null ? <TipRow value={`${p.rateMmHr > 0 ? '+' : ''}${p.rateMmHr} mm/hr`} label="last 10 min" /> : null}
                    <TipRow value={`+${F.railFootMm - Math.max(0, p.level ?? 0)} mm`} label="to the rail foot" />
                  </>,
                )}
              >
                <Link href={`/stations/${p.locationId}`} className="truncate text-xs hover:text-primary hover:underline">
                  {p.label}
                </Link>
                <div className="relative h-5 overflow-hidden rounded bg-muted/60">
                  {/* the zones, quietly: approaching, standing water, over the rail */}
                  <span className="absolute inset-y-0 bg-band-warning/70" style={{ left: x(F.approachMm), width: `calc(${x(F.standingWaterMm)} - ${x(F.approachMm)})` }} />
                  <span className="absolute inset-y-0 bg-band-alert/70" style={{ left: x(F.standingWaterMm), width: `calc(${x(F.railFootMm)} - ${x(F.standingWaterMm)})` }} />
                  <span className="absolute inset-y-0 right-0 bg-sev-alert/25" style={{ left: x(F.railFootMm) }} />
                  {/* the bar: level now */}
                  {p.level !== null ? (
                    <span className={cn('absolute left-0 top-1/2 h-2.5 -translate-y-1/2 rounded-r-sm', color)} style={{ width: x(Math.max(1, p.level)) }} />
                  ) : (
                    <span className="absolute inset-0 flex items-center px-2 text-[10px] italic text-muted-foreground">radar not reporting — float switch live</span>
                  )}
                  {/* peak in 24 h */}
                  {p.peak ? <span className="absolute inset-y-0.5 w-0.5 rounded bg-foreground/70" style={{ left: x(p.peak.v) }} /> : null}
                  {/* the lines through every row */}
                  {lines.map((l) => (
                    <span
                      key={l.v}
                      className={cn('absolute inset-y-0 border-l border-dashed', l.strong ? 'border-threshold' : 'border-threshold-soft')}
                      style={{ left: x(l.v) }}
                    />
                  ))}
                  {p.pumps ? (
                    <span className="absolute inset-y-0 border-l border-dotted border-foreground/50" style={{ left: x(F.pumpStartMm) }} title={`pump start +${F.pumpStartMm}`} />
                  ) : null}
                </div>
                <span className="tabular flex items-center justify-end gap-0.5 text-xs font-medium">
                  {p.level === null ? '–' : fmtSigned(p.level)}
                  {Rate ? (
                    <Rate
                      className={cn('h-3.5 w-3.5', p.rateMmHr! >= F.rateOfRiseMmHr ? 'text-sev-alert-strong' : 'text-muted-foreground')}
                      aria-label={`${p.rateMmHr} mm/hr`}
                    />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>

        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-1">
            <span className="h-2.5 w-3.5 rounded-sm bg-band-warning" aria-hidden /> approaching (+{F.approachMm})
          </li>
          <li className="flex items-center gap-1">
            <span className="h-2.5 w-3.5 rounded-sm bg-band-alert" aria-hidden /> standing water (+{F.standingWaterMm}) — PTZ check
          </li>
          <li className="flex items-center gap-1">
            <span className="h-2.5 w-3.5 rounded-sm bg-sev-alert/40" aria-hidden /> over the rail foot (+{F.railFootMm}) — block the line
          </li>
          <li className="flex items-center gap-1">
            <span className="h-3 w-0.5 rounded bg-foreground/70" aria-hidden /> peak 24 h
          </li>
          <li className="flex items-center gap-1">
            <span className="h-3 border-l border-dotted border-foreground/60" aria-hidden /> pump start (Marrickville)
          </li>
        </ul>
        <HoverTip tip={tip} width={520} />
      </div>
    </ChartFrame>
  );
}
