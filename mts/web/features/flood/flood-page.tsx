'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AlertEvent, PumpStationLive } from '@/lib/api/types';
import { buildSeries, getPumpStation, listEvents } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { DivergingBars } from '@/components/charts/diverging-bars';
import { LevelGauge } from '@/components/charts/level-gauge';
import { SeriesChart } from '@/components/charts/series';
import { StatusDot, severityTone } from '@/components/status/status-pill';
import { LoadingState } from '@/components/screen-states';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import { fmtDuration, fmtSigned, fmtTime } from '@/lib/format';
import { THRESHOLDS, THRESHOLD_LABELS } from '@/lib/mock/seed/thresholds';
import { CONTEXT, PARAM_COLOR } from '@/lib/viz/roles';
import { STATIONS_BY_ID } from '@/lib/mock/seed/stations';
import { cn } from '@/lib/utils';
import { VicinityInset } from './vicinity-inset';

/**
 * A flood event across the Marrickville vicinity.
 *
 * The screen exists to answer one question — is the water still rising, and is
 * the plant coping? — so it is built as four answers to it:
 *
 *   • the level over time, Marrickville in the water colour and its neighbour as
 *     quiet context (emphasis, not two competing hues);
 *   • the sump right now, against every set point the logger acts on;
 *   • the rate of rise — the sign of the change, which is what "trending down"
 *     in §7.3 actually means and what starts the staged reinstatement;
 *   • the reinstatement itself, stage by stage.
 *
 * Every time on the page — the log, the pump panel, the banner — comes from the
 * alert log and the pump model, never from arithmetic done here, so this screen
 * cannot disagree with the Alerts or Station screens.
 */
export function FloodPage() {
  const now = useDemoClock();
  const revision = useDataRevision();
  const minute = Math.floor(now / 60_000);
  const from = now - 3 * 3_600_000;
  const F = THRESHOLDS.flood;

  const loc1 = useMemo(() => buildSeries('water_level', 'marrickville', from, now, 120), [minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const loc2 = useMemo(() => buildSeries('water_level', 'marrickville-dulwich-hill', from, now, 120), [minute]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Rate of rise on a 10-minute step: sampled coarse on purpose, so a bar is a
     trend and not the ripple of one radar reading. */
  const rate = useMemo(() => {
    const pts = buildSeries('water_level', 'marrickville', from, now, 18);
    return pts
      .slice(1)
      .map((p, i) => ({
        t: p.t,
        dt: p.t - pts[i].t,
        v: Math.round((((p.v ?? 0) - (pts[i].v ?? 0)) / ((p.t - pts[i].t) / 3_600_000)) * 10) / 10,
      }))
      // A sliver of a step (the last minute before "now") is noise, not a trend.
      .filter((r) => r.dt >= 5 * 60_000)
      .map(({ t, v }) => ({ t, v }));
  }, [minute]); // eslint-disable-line react-hooks/exhaustive-deps

  const [pump, setPump] = useState<PumpStationLive | null>(null);
  const [log, setLog] = useState<AlertEvent[] | null>(null);
  useEffect(() => {
    if (!now) return;
    getPumpStation().then(setPump);
    Promise.all([
      listEvents({ locationId: 'marrickville', from: now - 12 * 3_600_000, pageSize: 50 }),
      listEvents({ locationId: 'marrickville-dulwich-hill', from: now - 12 * 3_600_000, pageSize: 50 }),
    ]).then(([a, b]) => setLog([...a.items, ...b.items].sort((x, y) => x.t - y.t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, revision]);

  // After the hooks, never before: an early return above them changes the hook
  // order between renders, which React refuses.
  if (!now) return <LoadingState label="Loading the flood event…" />;

  const now1 = loc1[loc1.length - 1]?.v ?? 0;
  const now2 = loc2[loc2.length - 1]?.v ?? 0;
  const rising = (rate[rate.length - 1]?.v ?? 0) > 0;
  const aboveStart = [now1, now2].filter((v) => v >= F.pumpStartMm).length;
  const running = pump?.pumps.filter((p) => p.state === 'running') ?? [];
  const blocked = now1 >= F.railFootMm;
  const dutySince = pump?.pumps.find((p) => p.role === 'duty')?.since;

  /* The banner states what is true, from the numbers above. It used to say
     "above pump-start at 2 locations" while one of them read +66 mm. */
  const banner = [
    aboveStart === 0 ? 'Water below pump-start at both locations' : `Water above pump-start at ${aboveStart} of 2 locations`,
    running.length ? `trackside pumps RUNNING (${running.length} of 2)` : 'trackside pumps stopped',
    blocked ? 'block-line alert active' : null,
    rising ? 'level still rising' : 'level falling',
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Flood event</h1>
        <p className="text-sm text-muted-foreground">
          The Marrickville vicinity, its trackside pumps and the two adjacent locations on one axis.
        </p>
      </div>

      <div
        className={cn(
          'flex items-start gap-2 rounded-lg border px-4 py-3',
          blocked || aboveStart ? 'border-sev-alert/40 bg-sev-alert-tint' : 'border-sev-warning/40 bg-sev-warning-tint',
        )}
      >
        <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', blocked || aboveStart ? 'text-sev-alert' : 'text-sev-warning')} aria-hidden />
        <div>
          <p className={cn('text-sm font-semibold', blocked || aboveStart ? 'text-sev-alert-strong' : 'text-sev-warning-strong')}>
            FLOOD EVENT — Marrickville vicinity
          </p>
          <p className={cn('text-sm', blocked || aboveStart ? 'text-sev-alert-strong' : 'text-sev-warning-strong')}>
            {banner.join(' · ')}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ChartFrame
          as="h2"
          title="Water level — Marrickville vicinity"
          unit="mm"
          footnote="Marrickville highlighted; its neighbour shown for context on the same axis"
          nowLabel={`Marrickville ${fmtSigned(now1)} · Dulwich Hill ${fmtSigned(now2)} mm`}
          nowTone={blocked ? 'alert' : aboveStart ? 'warning' : 'normal'}
          rows={[
            { label: 'Marrickville (mm)', points: loc1 },
            { label: 'Marrickville–Dulwich Hill (mm)', points: loc2 },
          ]}
        >
          <SeriesChart
            height={300}
            series={[
              { key: 'loc1', label: 'Marrickville', points: loc1, color: PARAM_COLOR.water_level },
              { key: 'loc2', label: 'Marrickville–Dulwich Hill (context)', points: loc2, color: CONTEXT, dashed: true },
            ]}
            thresholds={[
              { value: F.railFootMm, label: THRESHOLD_LABELS.railFoot, tone: 'critical' },
              { value: F.highHighMm, label: THRESHOLD_LABELS.highHigh, tone: 'setpoint' },
              { value: F.pumpStartMm, label: THRESHOLD_LABELS.pumpStart, tone: 'setpoint' },
            ]}
            bands={dutySince ? [{ from: Math.max(dutySince, from), to: now, label: 'pumps running', tone: 'warning' }] : []}
          />
        </ChartFrame>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <ChartFrame
            as="h2"
            title="Sump level now"
            footnote="Against every set point the OMC-048 acts on (§5.6)"
            table={{
              head: ['Set point', 'mm', 'Passed'],
              rows: [
                ['L-stop — pumps stop', F.pumpStopMm, now1 >= F.pumpStopMm ? 'yes' : 'no'],
                ['Float trip', F.pumpStartMm - 5, now1 >= F.pumpStartMm - 5 ? 'yes' : 'no'],
                ['L-start — lead pump', F.pumpStartMm, now1 >= F.pumpStartMm ? 'yes' : 'no'],
                ['L-lag / high-high — second pump', F.highHighMm, now1 >= F.highHighMm ? 'yes' : 'no'],
                ['Rail foot — block the line', F.railFootMm, now1 >= F.railFootMm ? 'yes' : 'no'],
              ],
            }}
          >
            <LevelGauge
              level={now1}
              max={260}
              deadBand={[F.pumpStopMm, F.pumpStartMm]}
              setpoints={[
                { value: F.pumpStopMm, label: 'L-stop', tone: 'info' },
                { value: F.pumpStartMm - 5, label: 'float trip', tone: 'info' },
                { value: F.pumpStartMm, label: 'L-start', tone: 'action' },
                { value: F.highHighMm, label: 'L-lag / HH', tone: 'action' },
                { value: F.railFootMm, label: 'rail foot', tone: 'critical' },
              ]}
            />
          </ChartFrame>

          <section className="rounded-lg border bg-card p-3">
            <header className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Trackside pumps — Marrickville</h2>
                <p className="text-xs text-muted-foreground">Duty + standby, lead/lag alternating each cycle</p>
              </div>
              <Link href="/stations/marrickville" className="shrink-0 text-xs text-primary hover:underline">
                Pump station →
              </Link>
            </header>
            {pump ? (
              <ul className="space-y-2">
                {pump.pumps.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">{p.role} pump</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {p.state === 'running' && p.since ? `since ${fmtTime(p.since)} · run ${fmtDuration(now - p.since)}` : 'armed — not running'}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                        p.state === 'running' ? 'bg-op-running-tint text-op-running' : 'bg-op-ready-tint text-op-ready',
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', p.state === 'running' ? 'bg-op-running' : 'bg-op-ready')} />
                      {p.state.toUpperCase()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="h-24 animate-pulse rounded bg-muted/60" />
            )}
          </section>

          <section className="rounded-lg border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">Affected vicinity</h2>
            <VicinityInset
              points={[
                { label: 'Marrickville', km: STATIONS_BY_ID.marrickville.chainage.km + 0.1, level: now1, pump: { running: running.length } },
                { label: 'Dulwich Hill', km: STATIONS_BY_ID['marrickville-dulwich-hill'].chainage.km + 0.08, level: now2 },
              ]}
            />
          </section>
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <ChartFrame
          as="h2"
          title="Rate of rise — Marrickville"
          unit="mm/hr"
          footnote="Change in level over each 10 minutes. Below the line is falling water — the §7.3 “trending down” condition."
          nowLabel={`${rising ? '▲ rising' : '▼ falling'} ${Math.abs(rate[rate.length - 1]?.v ?? 0).toFixed(0)} mm/hr`}
          nowTone={rising ? 'warning' : 'normal'}
          table={{ head: ['Time', 'mm/hr'], rows: rate.map((r) => [fmtTime(r.t), r.v]) }}
        >
          <DivergingBars points={rate} unit="mm/hr" />
        </ChartFrame>

        <Reinstatement level={now1} rising={rising} log={log ?? []} />
      </div>

      <section className="rounded-lg border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Event log — last 12 hours</h2>
          <p className="text-xs text-muted-foreground">From the alert log, for these two locations. Select an event to open it.</p>
        </header>
        {!log ? (
          <div className="m-4 h-24 animate-pulse rounded bg-muted/60" />
        ) : (
          <ul className="divide-y">
            {log.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
                <time className="tabular w-12 shrink-0 text-sm text-muted-foreground">{fmtTime(e.t)}</time>
                <span className="w-44 shrink-0 text-sm">{e.locationName}</span>
                <Link
                  href={`/alerts/${e.id}`}
                  className={cn(
                    'min-w-0 text-sm hover:underline',
                    e.severity === 'alert' && 'font-medium text-sev-alert-strong',
                    e.severity === 'warning' && 'text-sev-warning-strong',
                  )}
                >
                  <StatusDot tone={severityTone(e.severity)} className="mr-1.5 align-middle" />
                  {e.message}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * §7.3's staged reinstatement: above the rail foot the line is blocked; once the
 * water is trending down come system checks and a track inspection, then 25 kph,
 * then 60 kph, then unrestricted. The first two transitions follow the water;
 * the rest follow a person signing them off, so the screen shows them as waiting
 * for that sign-off rather than inventing times for them.
 */
function Reinstatement({ level, rising, log }: { level: number; rising: boolean; log: AlertEvent[] }) {
  const F = THRESHOLDS.flood;
  const blockedAt = log.find((e) => e.id === 'evt-rail-foot')?.t;
  const clearedAt = log.find((e) => e.id === 'evt-rail-foot-clear')?.t;
  const current = level >= F.railFootMm ? 0 : blockedAt && !rising ? 1 : blockedAt ? 0 : -1;
  const stages = [
    { label: 'Line blocked', detail: `Water above the rail foot (+${F.railFootMm} mm)`, at: blockedAt },
    { label: 'Trending down — system checks and track inspection', detail: 'Starts automatically when the level falls back below the rail foot', at: clearedAt },
    { label: 'Reinstate at 25 kph', detail: 'After the inspection is signed off', at: undefined },
    { label: 'Reinstate at 60 kph', detail: 'After a monitored period at 25 kph', at: undefined },
    { label: 'Unrestricted', detail: 'Normal operations', at: undefined },
  ];
  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold">Staged reinstatement — Marrickville</h2>
        <p className="text-xs text-muted-foreground">
          §7.3. Stage timings after the inspection are MTS&apos;s to confirm — shown here as waiting for sign-off.
        </p>
      </header>
      {current === -1 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-sev-normal" aria-hidden /> The line has not been blocked in this event.
        </p>
      ) : (
        <ol className="relative space-y-3 border-l pl-5">
          {stages.map((s, i) => {
            const done = i < current;
            const active = i === current;
            const Icon = done ? CheckCircle2 : active ? CircleDot : Circle;
            return (
              <li key={s.label} className="relative">
                <Icon
                  className={cn(
                    'absolute -left-[27px] top-0.5 h-4 w-4 bg-card',
                    done ? 'text-sev-normal' : active ? (i === 0 ? 'text-sev-alert' : 'text-sev-warning') : 'text-muted-foreground',
                  )}
                  aria-hidden
                />
                <p className={cn('text-sm', active ? 'font-semibold' : done ? '' : 'text-muted-foreground')}>
                  {s.label}
                  {active ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase">now</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.at && (done || active) ? <span className="tabular">{fmtTime(s.at)} · </span> : null}
                  {s.detail}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
