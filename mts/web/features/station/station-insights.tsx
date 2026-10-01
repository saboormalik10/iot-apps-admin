'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LocationId, PowerTrail, Pump, PumpDay, PumpProtection } from '@/lib/api/types';
import { chargeController, powerTrails, pumpHistory, pumpProtection } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { Meter } from '@/components/charts/meter';
import { SeriesChart } from '@/components/charts/series';
import { fmtDay } from '@/lib/format';
import { THRESHOLDS } from '@/lib/mock/seed/thresholds';
import { PARAM_COLOR, SERIES } from '@/lib/viz/roles';
import { cn } from '@/lib/utils';
import { PumpLogicDiagram } from './pump-logic';

/**
 * §5.7 and §8.6: the solar power system, displayed live and "alarmed as a
 * leading indicator of failure". A week of state of charge shows the thing a
 * single percentage cannot — whether the battery is recovering each day or
 * slowly losing ground — and the autonomy figure turns it into the question a
 * maintainer actually has: how long could this station run with no sun at all?
 */
export function PowerPanel({ locationId, minuteKey }: { locationId: LocationId; minuteKey: number }) {
  const [trails, setTrails] = useState<PowerTrail[] | null>(null);
  useEffect(() => {
    powerTrails(7).then((all) => setTrails(all.filter((p) => p.locationId === locationId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, Math.floor(minuteKey / 10)]);

  if (!trails) return <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />;
  const multi = trails.length > 1;

  return (
    <ChartFrame
      title="Power — last 7 days"
      unit="%"
      footnote={`Battery state of charge · 400 W panel, 2 × 55 Ah LiFePO₄ · alarmed below ${THRESHOLDS.power.lowBatteryPct} %`}
      rows={trails.flatMap((p) => [
        { label: `${p.label} — state of charge (%)`, points: p.soc },
        { label: `${p.label} — solar input (W)`, points: p.pv },
      ])}
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        {trails.map((p) => (
          <div key={p.loggerId} className="grid grid-cols-3 gap-2 rounded-md border p-2 text-xs">
            {multi ? <p className="col-span-3 font-medium">{p.label.split(' — ')[1] ?? p.label}</p> : null}
            <Stat label="Battery" value={`${p.voltage.toFixed(2)} V`} />
            <Stat label={p.chargeW >= 0 ? 'Charging' : 'Discharging'} value={`${Math.abs(p.chargeW)} W`} />
            <Stat
              label="Autonomy, no sun"
              value={`${p.autonomyDays.toFixed(1)} days`}
              warn={p.autonomyDays < 2}
            />
            {/* §8.6: the controller's fault flags, every one, raised or clear. */}
            <ul className="col-span-3 flex flex-wrap gap-1 border-t pt-2" aria-label="Charge controller flags">
              {chargeController(p.loggerId).flags.map((f) => (
                <li
                  key={f.id}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]',
                    f.active ? 'bg-sev-warning-tint font-medium text-sev-warning-strong' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', f.active ? 'bg-sev-warning' : 'bg-sev-normal')} aria-hidden />
                  {f.label}
                  <span className="sr-only">{f.active ? ' raised' : ' clear'}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <SeriesChart
        height={180}
        domain={[0, 100]}
        series={trails.map((p, i) => ({
          key: p.loggerId,
          label: multi ? (p.label.split(' — ')[1] ?? p.label) : 'State of charge',
          points: p.soc,
          color: PARAM_COLOR.battery,
          dashed: i > 0,
          kind: multi ? undefined : ('area' as const),
        }))}
        thresholds={[{ value: THRESHOLDS.power.lowBatteryPct, label: `low battery ${THRESHOLDS.power.lowBatteryPct} %`, tone: 'critical' }]}
        xFormat="day"
      />
    </ChartFrame>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold', warn && 'text-sev-warning-strong')}>{value}</p>
    </div>
  );
}

/**
 * The pump plant, as §5.6 describes it: lead/lag alternating each cycle to
 * equalise wear, and anti-cycling protection. Run time per physical pump shows
 * whether the alternation is doing its job; the starts-per-hour meter shows how
 * close the plant is to the motor-protection limit.
 */
export function PumpHistoryPanel({ minuteKey }: { minuteKey: number }) {
  const [data, setData] = useState<{ days: PumpDay[]; totals: { pump1H: number; pump2H: number } } | null>(null);
  useEffect(() => {
    pumpHistory(14).then(setData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(minuteKey / 10)]);

  if (!data) return <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />;
  const toPoints = (key: 'pump1Min' | 'pump2Min') => data.days.map((d) => ({ t: d.day, v: d[key], status: 'normal' as const }));
  const p1 = toPoints('pump1Min');
  const p2 = toPoints('pump2Min');

  return (
    <ChartFrame
      title="Pump run time — last 14 days"
      unit="min/day"
      footnote={`Pump 1 ${data.totals.pump1H} h · Pump 2 ${data.totals.pump2H} h. Lead and lag swap every cycle; the weekly exercise runs both.`}
      table={{
        head: ['Day', 'Pump 1 (min)', 'Pump 2 (min)', 'Starts'],
        rows: data.days.filter((d) => d.pump1Min + d.pump2Min > 0).map((d) => [fmtDay(d.day), d.pump1Min, d.pump2Min, d.starts]),
      }}
    >
      <SeriesChart
        height={200}
        xFormat="day"
        series={[
          { key: 'p1', label: 'Pump 1', points: p1, color: SERIES[0], kind: 'bar' },
          { key: 'p2', label: 'Pump 2', points: p2, color: SERIES[1], kind: 'bar' },
        ]}
      />
    </ChartFrame>
  );
}

export function PumpProtectionPanel({ minuteKey, pumps, rainMm }: { minuteKey: number; pumps?: Pump[]; rainMm?: number | null }) {
  const [p, setP] = useState<PumpProtection | null>(null);
  useEffect(() => {
    pumpProtection().then(setP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(minuteKey / 2)]);

  if (!p) return <div className="h-48 animate-pulse rounded-lg border bg-muted/40" />;
  const agree = p.radarFloatAgreement === 'agree';
  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold">Local control logic — OMC-048</h2>
        <p className="text-xs text-muted-foreground">
          Runs on the logger itself, independent of the cellular link (§5.6). All values are configuration, pending MTS.
        </p>
      </header>

      <PumpLogicDiagram p={p} pumps={pumps} rainMm={rainMm} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <Fact label="L-start (lead pump)" value={`+${p.lStartMm} mm`} />
        <Fact label="L-lag / high-high" value={`+${p.lLagMm} mm`} />
        <Fact label="L-stop" value={`+${p.lStopMm} mm`} />
        <Fact label="Dead-band" value={`${p.deadBandMm} mm`} />
        <Fact label="Minimum run / rest" value={`${p.minRunMin} / ${p.minRestMin} min`} />
        <Fact label="Lead this cycle" value={`Pump ${p.leadPump}`} />
        <Fact label="Start debounce" value={`${p.debounceS} s sustained`} />
        <Fact label="Run-dry inhibit" value={`below +${p.lStopMm} mm`} />
        <Fact label="Standby cut-in" value="duty trip or lost run feedback" />
      </dl>

      <div className="mt-4">
        <Meter label="Starts in the last hour" sublabel="anti-cycling limit" value={p.startsLastHour} limit={p.maxStartsPerHour} unit="starts" digits={0} compact />
      </div>

      {/* §5.6 "immediate alarms": each one transmitted at once, outside the
          routine cycle. Listed with its state, so "no alarm" is a statement. */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Immediate alarms</p>
        <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          {[
            { label: 'Pump fail / motor-protection trip', on: false },
            { label: 'No-flow while running', on: false },
            { label: 'Radar / float discrepancy', on: !agree },
            { label: `High-high level (+${p.lLagMm} mm)`, on: p.levelMm >= p.lLagMm },
            { label: 'Panel or power fault', on: false },
            { label: 'Pump start / stop (event)', on: false, info: true },
          ].map((a) => (
            <li key={a.label} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
              <span>{a.label}</span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 text-[11px] font-semibold',
                  a.on ? 'bg-sev-alert-tint text-sev-alert-strong' : 'bg-muted text-muted-foreground',
                )}
              >
                {a.info ? 'logged' : a.on ? 'ACTIVE' : 'clear'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div
        className={cn(
          'mt-4 flex items-start gap-2 rounded-md border p-2.5 text-xs',
          agree ? 'border-sev-normal/30 bg-sev-normal-tint' : 'border-sev-alert/40 bg-sev-alert-tint',
        )}
      >
        {agree ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sev-normal-strong" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sev-alert-strong" aria-hidden />
        )}
        <div className={agree ? 'text-sev-normal-strong' : 'text-sev-alert-strong'}>
          <p className="font-semibold">
            Radar and float {agree ? 'agree' : 'disagree'} · control source: {p.controlSource === 'radar' ? 'radar (primary)' : 'float switch (backup)'}
          </p>
          <p>
            {agree
              ? `The float trips at +${p.floatTripMm} mm and confirms the radar. If the radar fails, control moves to the float and MTS is told.`
              : 'A persistent disagreement raises a sensor-discrepancy alarm. The logic assumes water is present and pumps.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}
