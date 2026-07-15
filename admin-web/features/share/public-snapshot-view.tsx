'use client';

import { useState } from 'react';
import { Waves, FileText, Lock, Clock } from 'lucide-react';
import { TimeSeriesChart, type SeriesDef } from '@/components/charts/time-series-chart';
import { LoadingState } from '@/components/screen-states';
import { formatDateTime, formatDate } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { PublicNepSnapshot, PublicMetSnapshot } from '@/lib/api/types';
import { usePublicSnapshot } from './use-share';

const TURBIDITY: SeriesDef = { key: 'turbidity', label: 'Turbidity (NTU)', role: 'chart-1' };
const TEMPERATURE: SeriesDef = { key: 'temperature', label: 'Temperature (°C)', role: 'chart-8' };

/**
 * The unauthenticated public snapshot (plan §Month 11 / §17 Q4) — a static,
 * read-only, `noindex` view of ONE shared session or record. No realtime, no auth
 * UI, no mutation paths: it renders exactly the fields the backend snapshot returns.
 */
export function PublicSnapshotView({ token }: { token: string }) {
  const { data, isLoading, isError } = usePublicSnapshot(token);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-6 flex items-center justify-between">
        <span className="text-sm font-semibold">ObservatorNepLink</span>
        <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> Read-only shared view
        </span>
      </header>

      {isLoading ? (
        <LoadingState label="Loading shared view…" />
      ) : isError || !data ? (
        <NotFoundCard />
      ) : data.resourceType === 'nepSession' ? (
        <NepSnapshot snap={data} />
      ) : (
        <MetSnapshot snap={data} />
      )}
    </div>
  );
}

function NotFoundCard() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-20 text-center">
      <Lock className="h-8 w-8 text-muted-foreground" />
      <h1 className="text-lg font-medium">This link isn&apos;t available</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The shared link is invalid, has been revoked, or has expired. Ask the sender for a new link.
      </p>
    </div>
  );
}

function SnapshotFooter({ sharedAt, expiresAt }: { sharedAt: string; expiresAt: string | null }) {
  return (
    <footer className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Snapshot shared {formatDate(sharedAt)}</span>
      {expiresAt ? <span>Link expires {formatDate(expiresAt)}</span> : null}
      <span className="ml-auto">Point-in-time snapshot · not live</span>
    </footer>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PhotoGrid({ photos }: { photos: { url: string; filename: string }[] }) {
  if (photos.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Photos</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary secure_url; CSP img-src allows it.
          <img key={p.url} src={p.url} alt={p.filename} loading="lazy" className="aspect-square w-full rounded-md border object-cover" />
        ))}
      </div>
    </section>
  );
}

const num = (v: number | null, dp = 1) => (v == null ? '—' : v.toFixed(dp));

function NepSnapshot({ snap }: { snap: PublicNepSnapshot }) {
  const s = snap.session;
  const [view, setView] = useState<'turbidity' | 'temperature'>('turbidity');
  const hasTemp = snap.trend.some((p) => p.temperature != null);
  const rows = snap.trend.map((p) => ({ t: p.t, turbidity: p.turbidity, temperature: p.temperature }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Waves className="h-5 w-5 text-muted-foreground" /> {s.deviceName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(s.startTimestamp)}
          {s.endTimestamp ? ` – ${formatDateTime(s.endTimestamp)}` : ''} · {s.sampleCount.toLocaleString()} samples
          {s.probeRange ? ` · ${s.probeRange}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Avg turbidity" value={`${num(s.turbidityAvg)} NTU`} />
        <Card label="Min turbidity" value={`${num(s.turbidityMin)} NTU`} />
        <Card label="Max turbidity" value={`${num(s.turbidityMax)} NTU`} />
        <Card label="Avg temp" value={s.temperatureAvg == null ? '—' : `${num(s.temperatureAvg)} °C`} />
      </div>

      {rows.length > 0 ? (
        <section className="space-y-2">
          <div className="flex gap-1">
            {(['turbidity', 'temperature'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                disabled={v === 'temperature' && !hasTemp}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs capitalize transition-colors disabled:opacity-40',
                  view === v ? 'border-primary bg-primary/10' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <TimeSeriesChart
            data={rows}
            series={view === 'turbidity' ? [TURBIDITY] : [TEMPERATURE]}
            xKey="t"
            title="Session trend"
            unit={view === 'turbidity' ? 'NTU' : '°C'}
            exportName="shared-session-trend"
          />
        </section>
      ) : null}

      {s.comment ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">Comment</h2>
          <p className="rounded-lg border bg-muted/30 p-3 text-sm">{s.comment}</p>
        </section>
      ) : null}

      <PhotoGrid photos={snap.photos} />
      <SnapshotFooter sharedAt={snap.sharedAt} expiresAt={snap.expiresAt} />
    </div>
  );
}

function MetSnapshot({ snap }: { snap: PublicMetSnapshot }) {
  const r = snap.record;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FileText className="h-5 w-5 text-muted-foreground" /> {r.deviceName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(r.dateStart)}
          {r.dateEnd ? ` – ${formatDateTime(r.dateEnd)}` : ''} · {r.measureCount.toLocaleString()} measures
        </p>
      </div>

      {r.comment ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">Comment</h2>
          <p className="rounded-lg border bg-muted/30 p-3 text-sm">{r.comment}</p>
        </section>
      ) : null}

      <PhotoGrid photos={snap.photos} />
      <SnapshotFooter sharedAt={snap.sharedAt} expiresAt={snap.expiresAt} />
    </div>
  );
}
