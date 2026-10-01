'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Camera, ChevronLeft, Printer } from 'lucide-react';
import type { AlertEvent } from '@/lib/api/types';
import { acknowledgeEvent, buildSeries, getEvent } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { SeriesChart } from '@/components/charts/series';
import { EmptyState, LoadingState } from '@/components/screen-states';
import { StatusPill, severityTone } from '@/components/status/status-pill';
import { Button } from '@/components/ui/button';
import { PtzDialog } from './ptz-dialog';
import { Annotations, DeliveryRecord } from './event-extras';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { THRESHOLDS, THRESHOLD_LABELS } from '@/lib/mock/seed/thresholds';

/**
 * One event, in full.
 *
 * This is what the hyperlink in an alert opens — from the ticker, from an email, or
 * from a push notification tapped at 2 a.m. — so it has to stand alone: what
 * happened, where (with track, rail and kilometrage, which the Statement of
 * Requirements puts on every alert), what the reading was doing around it, and the
 * one action the reader is there to take.
 */
export function EventPage({ id }: { id: string }) {
  const now = useDemoClock();
  const [event, setEvent] = useState<AlertEvent | null | undefined>(undefined);
  const [camera, setCamera] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () => getEvent(id).then(setEvent);
  const revision = useDataRevision();
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, revision]);

  if (event === undefined) return <LoadingState label="Loading the event…" />;
  if (!event) return <EmptyState title="That event is not in the log" body="It may have been cleared." />;

  const link = typeof window === 'undefined' ? `/alerts/${id}` : `${window.location.origin}/alerts/${id}`;

  const parameter =
    event.category === 'rainfall' ? 'rainfall' : event.category === 'wind' ? 'wind_gust' : event.category === 'temperature' ? 'temperature' : 'water_level';
  const series = buildSeries(parameter, event.locationId, event.t - 90 * 60_000, Math.min(now, event.t + 90 * 60_000), 100);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/alerts" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3 w-3" /> Alerts
      </Link>

      <header className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <StatusPill tone={severityTone(event.severity)} />
          <time className="tabular text-sm text-muted-foreground">{fmtDateTime(event.t)}</time>
        </div>
        <h1 className="text-lg font-semibold">{event.message}</h1>
        {event.detail ? <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p> : null}
        {event.draftWording ? (
          <p className="mt-2 inline-block rounded bg-muted px-2 py-0.5 text-[11px] uppercase text-muted-foreground">
            draft wording — pending MTS confirmation
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-4 text-sm sm:grid-cols-4">
          <Fact label="Location" value={event.locationName} />
          <Fact label="Kilometrage" value={event.chainageLabel} provisional />
          <Fact label="Track" value={trackLabel(event.track)} />
          <Fact label="Rail" value={trackLabel(event.rail)} />
        </dl>

        {/* §7.1: every alert carries a direct hyperlink to its event. This is that
            link — the one in the email and the push notification — shown so the
            client can see what their recipients are actually sent. */}
        <div className="mt-4 border-t pt-4">
          <p className="mb-1 text-xs text-muted-foreground">Direct link — included in every notification</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border bg-muted/50 px-2 py-1 text-xs">{link}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>

        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          {event.acknowledgement ? (
            <p className="text-sm text-sev-normal-strong">
              ✓ Acknowledged by {event.acknowledgement.by} at {fmtTime(event.acknowledgement.at)}
            </p>
          ) : event.autoCleared ? (
            <p className="text-sm text-sev-cleared-strong">Cleared automatically — no acknowledgement required.</p>
          ) : (
            <Button onClick={() => acknowledgeEvent(event.id).then(load)}>Acknowledge this alert</Button>
          )}
          {event.cameraUrl ? (
            <Button variant="outline" onClick={() => setCamera(true)}>
              <Camera className="h-4 w-4" /> View live PTZ feed
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href={`/stations/${event.locationId}`}>Open the station</Link>
          </Button>
          {/* For the post-event review: the page prints as a one-event report — facts, chart, delivery record and notes. */}
          <Button variant="outline" onClick={() => window.print()} className="print:hidden">
            <Printer className="h-4 w-4" /> Print incident report
          </Button>
        </div>
      </header>

      <ChartFrame
        title={`${label(parameter)} around the event`}
        unit={unit(parameter)}
        footnote={`90 minutes either side · raised ${fmtTime(event.t)}${event.acknowledgement ? ` · acknowledged ${fmtTime(event.acknowledgement.at)} by ${event.acknowledgement.by} (${Math.max(0, Math.round((event.acknowledgement.at - event.t) / 60_000))} min later)` : ''}`}
        rows={[{ label: label(parameter), points: series }]}
      >
        <SeriesChart
          height={240}
          series={[{ key: 'v', label: label(parameter), points: series, parameter: parameter as never, kind: 'area' }]}
          thresholds={thresholdsFor(parameter)}
          /* The two moments the review asks about: when it was raised, and when someone took it. */
          markers={[
            { t: event.t, label: `raised ${fmtTime(event.t)}`, tone: 'alert' },
            ...(event.acknowledgement && event.acknowledgement.at <= now
              ? [{ t: event.acknowledgement.at, label: `ack ${fmtTime(event.acknowledgement.at)}`, tone: 'info' as const }]
              : []),
          ]}
        />
      </ChartFrame>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <DeliveryRecord eventId={event.id} />
        <Annotations eventId={event.id} />
      </div>

      <PtzDialog event={camera ? event : null} onClose={() => setCamera(false)} onAcknowledge={(i) => acknowledgeEvent(i).then(load)} />
    </div>
  );
}

function Fact({ label, value, provisional }: { label: string; value: string; provisional?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={provisional ? 'italic text-muted-foreground' : 'font-medium capitalize'} title={provisional ? 'To be supplied by MTS' : undefined}>
        {value}
      </dd>
    </div>
  );
}

function trackLabel(t: string): string {
  return t === 'up' ? 'Up track' : t === 'down' ? 'Down track' : 'Both tracks';
}

function label(p: string): string {
  return { rainfall: 'Rainfall', wind_gust: 'Wind gust', temperature: 'Air temperature', water_level: 'Water level' }[p] ?? p;
}
function unit(p: string): string {
  return { rainfall: 'mm/hr', wind_gust: 'km/h', temperature: '°C', water_level: 'mm' }[p] ?? '';
}
function thresholdsFor(p: string) {
  if (p === 'rainfall') return [{ value: THRESHOLDS.rainfall.intensity.value, label: THRESHOLD_LABELS.rainIntensity, tone: 'critical' as const }];
  if (p === 'wind_gust') return [{ value: THRESHOLDS.wind.gustWarn.value, label: THRESHOLD_LABELS.windGust, tone: 'critical' as const }];
  if (p === 'temperature') return [{ value: THRESHOLDS.temperature.heat1.value, label: THRESHOLD_LABELS.tempHeat1, tone: 'critical' as const }];
  return [
    { value: THRESHOLDS.flood.railFootMm, label: THRESHOLD_LABELS.railFoot, tone: 'critical' as const },
    { value: THRESHOLDS.flood.pumpStartMm, label: THRESHOLD_LABELS.pumpStart, tone: 'setpoint' as const },
  ];
}
