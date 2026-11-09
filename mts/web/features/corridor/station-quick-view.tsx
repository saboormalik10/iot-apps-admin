'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AlertEvent, PumpStationLive, StationLive } from '@/lib/api/types';
import { PARAMETER_LABELS, getPumpStation, listEvents } from '@/lib/api/endpoints';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusDot, StatusPill, stationTone } from '@/components/status/status-pill';
import { fmtDateTime, fmtSigned, fmtTime, fmtValue } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A station at a glance, over the map (client, 9 Nov 2026: clicking a station
 * "will jump to another tab — do you think it looks better if a new window pops
 * up?"). The map stays where it was; "Open station page" goes on to the charts
 * and the pump log. A panel from the right on a desk, the full screen on a phone.
 */

const SILENT_MS = 15 * 60_000;

export function StationQuickView({ station, now, onClose }: { station: StationLive | null; now: number; onClose: () => void }) {
  const [alerts, setAlerts] = useState<AlertEvent[] | null>(null);
  const [pump, setPump] = useState<PumpStationLive | null>(null);
  const id = station?.location.id;
  const hasPump = Boolean(station?.location.pumpStation);

  useEffect(() => {
    if (!id) return;
    let live = true;
    setAlerts(null);
    listEvents({ locationId: id, withinDays: 7, pageSize: 3 }).then((p) => live && setAlerts(p.items));
    if (hasPump) getPumpStation().then((p) => live && setPump(p));
    return () => {
      live = false;
    };
  }, [id, hasPump]);

  return (
    <Dialog open={station !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="left-auto right-0 top-0 h-full max-h-none w-full max-w-md translate-x-0 translate-y-0 content-start gap-0 overflow-y-auto rounded-none p-0 sm:rounded-none">
        {station ? (
          <>
            <DialogHeader className="space-y-1 border-b p-4 pr-12 text-left">
              <div className="flex items-start justify-between gap-2">
                <DialogTitle className="text-lg">
                  <span className="text-muted-foreground">{station.location.ordinal}.</span> {station.location.name}
                </DialogTitle>
                <StatusPill tone={stationTone(station.status)} size="sm" className="mt-1 shrink-0" />
              </div>
              <DialogDescription>
                {station.location.chainage.label} · updated {fmtTime(station.updatedAt)}
              </DialogDescription>
            </DialogHeader>

            <section className="border-b p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live readings</h3>
              <dl className="space-y-1.5 text-sm">
                {station.readings.map((r) => (
                  <div key={r.sensorId + r.parameter} className="flex items-baseline justify-between gap-3">
                    <dt className="min-w-0">
                      {PARAMETER_LABELS[r.parameter]}
                      {r.thresholdLabel ? <span className="block text-[11px] text-muted-foreground">{r.thresholdLabel}</span> : null}
                    </dt>
                    <dd
                      className={cn(
                        'tabular shrink-0 font-semibold',
                        r.status === 'alert' && 'text-sev-alert-strong',
                        r.status === 'warning' && 'text-sev-warning-strong',
                      )}
                    >
                      {r.parameter === 'float_switch'
                        ? r.value === 1
                          ? 'WET'
                          : 'DRY'
                        : `${r.parameter === 'water_level' ? fmtSigned(r.value) : fmtValue(r.value)} ${r.unit}`}
                      {r.status === 'alert' ? ' ▲' : ''}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {hasPump && pump ? (
              <section className="border-b p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pumps</h3>
                <ul className="space-y-1.5 text-sm">
                  {pump.pumps.map((p) => {
                    const on = p.state === 'running';
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3">
                        <span>
                          {p.role === 'duty' ? 'Duty pump' : 'Standby pump'}
                          {on && p.since ? <span className="block text-[11px] text-muted-foreground">since {fmtTime(p.since)}</span> : null}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-semibold',
                            on ? 'bg-op-running text-white' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {on ? 'ON' : 'OFF'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section className="border-b p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last connected</h3>
              <ul className="space-y-1 text-sm">
                {station.location.loggers.map((l) => {
                  const quiet = now - l.lastSeen > SILENT_MS;
                  return (
                    <li key={l.id} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{l.id}</span>
                      <span className={cn('tabular', quiet && 'font-medium text-sev-warning-strong')}>
                        {quiet ? `No data since ${fmtDateTime(l.lastSeen)}` : fmtDateTime(l.lastSeen)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="border-b p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest alerts — 7 days</h3>
              {alerts === null ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : alerts.length ? (
                <ul className="space-y-2">
                  {alerts.map((e) => (
                    <li key={e.id} className="flex gap-2 text-xs">
                      <StatusDot
                        tone={e.severity === 'alert' ? 'alert' : e.severity === 'warning' ? 'warning' : e.severity === 'cleared' ? 'cleared' : 'information'}
                        className="mt-1 shrink-0"
                      />
                      <span className="min-w-0">
                        <Link href={`/alerts/${e.id}`} className="font-medium hover:text-primary hover:underline">
                          {e.message}
                        </Link>
                        <span className="tabular block text-muted-foreground">{fmtDateTime(e.t)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No alerts in the last 7 days.</p>
              )}
            </section>

            <div className="p-4">
              <Button asChild className="w-full">
                <Link href={`/stations/${station.location.id}`}>
                  Open station page <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
