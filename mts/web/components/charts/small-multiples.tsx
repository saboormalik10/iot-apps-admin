'use client';

import Link from 'next/link';
import { AlertTriangle, CircleDot } from 'lucide-react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { Reading } from '@/lib/api/types';
import { fmtTime, fmtValue } from '@/lib/format';
import { CHROME } from '@/lib/viz/roles';
import { cn } from '@/lib/utils';

/**
 * One measurement at every location, side by side, on the SAME scale.
 *
 * The shared y-axis is the whole point. Seven auto-scaled charts would each
 * fill their own box and look equally alarming; on one scale a +40 mm tunnel
 * sits flat along the bottom while Marrickville climbs through the rail foot,
 * and the eye goes straight to it. Position says which place, so every panel
 * wears the same colour; the panel that is in alert says so in a word and an
 * icon as well as its border.
 */
export interface Panel {
  id: string;
  label: string;
  href?: string;
  points: Reading[];
  unit: string;
  tone: 'normal' | 'warning' | 'alert';
}

export function SmallMultiples({
  panels,
  color,
  threshold,
  thresholdLabel,
  domainMax,
}: {
  panels: Panel[];
  color: string;
  threshold?: number;
  thresholdLabel?: string;
  domainMax: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {panels.map((p) => {
        const last = p.points[p.points.length - 1]?.v ?? null;
        const body = (
          <>
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="min-w-0 text-xs font-medium leading-tight">{p.label}</p>
              <p className="shrink-0 text-sm font-semibold">
                {fmtValue(last, 0)}
                <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">{p.unit}</span>
              </p>
            </div>
            <div className="h-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={p.points} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  <YAxis hide domain={[0, domainMax]} />
                  {threshold !== undefined ? (
                    <ReferenceLine y={threshold} stroke={CHROME.threshold} strokeDasharray="4 3" strokeWidth={1.2} />
                  ) : null}
                  <Tooltip
                    cursor={{ stroke: CHROME.axis }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded border bg-popover px-2 py-1 text-[11px] shadow">
                          <span className="tabular font-semibold">{fmtValue(payload[0].value as number, 0)} {p.unit}</span>{' '}
                          <span className="text-muted-foreground">{fmtTime((payload[0].payload as Reading).t)}</span>
                        </div>
                      ) : null
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={color}
                    fill={color}
                    fillOpacity={0.1}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p
              className={cn(
                'mt-1 flex items-center gap-1 text-[11px]',
                p.tone === 'alert' ? 'text-sev-alert-strong' : p.tone === 'warning' ? 'text-sev-warning-strong' : 'text-muted-foreground',
              )}
            >
              {p.tone === 'alert' ? <AlertTriangle className="h-3 w-3" aria-hidden /> : p.tone === 'warning' ? <CircleDot className="h-3 w-3" aria-hidden /> : null}
              {p.tone === 'alert' ? 'Over threshold' : p.tone === 'warning' ? 'Approaching' : 'Within limits'}
            </p>
          </>
        );
        const cls = cn(
          'block rounded-md border bg-card p-2.5 transition-shadow',
          p.tone === 'alert' && 'border-sev-alert/60 ring-1 ring-sev-alert/30',
          p.tone === 'warning' && 'border-sev-warning/60',
          p.href && 'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        );
        return p.href ? (
          <Link key={p.id} href={p.href} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={p.id} className={cls}>
            {body}
          </div>
        );
      })}
      {threshold !== undefined ? (
        <p className="col-span-full flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" stroke={CHROME.threshold} strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          {thresholdLabel} · every panel on the same 0–{domainMax} scale
        </p>
      ) : null}
    </div>
  );
}
