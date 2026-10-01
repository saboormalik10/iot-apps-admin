'use client';

import { useMemo, useState } from 'react';
import type { AlertRule, LocationId, RuleSimulation } from '@/lib/api/types';
import { simulateRule } from '@/lib/api/endpoints';
import { SeriesChart } from '@/components/charts/series';
import { useDemoClock } from '@/lib/demo-clock';
import { fmtTime, fmtValue } from '@/lib/format';
import { STATIONS_BY_ID } from '@/lib/mock/seed/stations';
import { THRESHOLDS } from '@/lib/mock/seed/thresholds';
import { cn } from '@/lib/utils';

/**
 * "Test against the last 24 hours" — the validation §7.3 promises, made visible.
 *
 * An administrator raising a threshold wants to know one thing before saving:
 * would this have fired yesterday, and when? So the draft — not the saved rule —
 * is run over a day of stored readings at every location it covers, and the
 * answer is drawn: the reading, the line, when it would have been raised, how
 * long it stayed in force and the vigilance that followed. It re-runs as the
 * value, window, dwell or vigilance is edited, which turns the drawer from a form
 * into an instrument.
 */
export function RuleDryRun({ rule }: { rule: AlertRule }) {
  const now = useDemoClock();
  const tick = Math.floor(now / 300_000);
  const [picked, setPicked] = useState<LocationId | null>(null);

  const runs = useMemo(
    () => (tick ? rule.appliesTo.map((id) => simulateRule(rule, id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rule, tick],
  );

  if (!rule.appliesTo.length) {
    return <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Choose a location to test this rule against its readings.</p>;
  }
  if (!runs.length) return null;

  /* Open on the location where it fires — that is the one worth looking at. */
  const sim =
    runs.find((r) => r.locationId === picked) ??
    runs.find((r) => r.fires.length || r.inForce.length || r.armedAt !== undefined) ??
    runs[0];
  const isFalling = rule.parameter === 'water_level' && rule.operator === 'lte';
  const op = rule.operator === 'gte' ? '≥' : '≤';

  const values = sim.points.flatMap((p) => (p.v === null ? [] : [p.v]));
  const line = isFalling ? THRESHOLDS.flood.railFootMm : rule.value;
  const lo = values.length ? Math.min(...values, line) : 0;
  const hi = values.length ? Math.max(...values, line) : line;
  const domain = niceDomain(rule.parameter === 'temperature' ? lo - 2 : Math.min(0, lo), rule.parameter === 'temperature' ? hi + 2 : hi * 1.12);
  const dormant = rule.schedule && !inSchedule(rule.schedule, now);
  const tone: 'alert' | 'warning' = rule.severity === 'alert' ? 'alert' : 'warning';

  return (
    <div className="space-y-2">
      {/* Every location the draft covers, with what it would have done there. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Location tested">
        {runs.map((r) => {
          const n = r.fires.length + (r.inForce[0]?.from === r.from ? 1 : 0);
          const on = r.locationId === sim.locationId;
          return (
            <button
              key={r.locationId}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked(r.locationId)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                on ? 'border-primary bg-primary/10 font-medium text-primary-strong' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  r.note && !r.points.length
                    ? 'bg-sev-offline'
                    : n
                      ? tone === 'alert'
                        ? 'bg-sev-alert'
                        : 'bg-sev-warning'
                      : r.armedAt !== undefined
                        ? 'bg-sev-warning'
                        : 'bg-sev-normal',
                )}
                aria-hidden
              />
              {STATIONS_BY_ID[r.locationId].name}
              <span className="tabular text-muted-foreground">
                {r.note && !r.points.length ? 'n/a' : n ? `×${n}` : r.armedAt !== undefined ? 'armed' : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {sim.points.length ? (
        <>
          <SeriesChart
            series={[{ key: 'v', label: sim.metric, parameter: sim.parameter, points: sim.points, kind: 'area' }]}
            thresholds={[
              {
                value: line,
                label: isFalling ? `rail foot +${line} mm (arms the rule)` : `${op} ${rule.value} ${sim.unit}`,
                tone: rule.severity === 'alert' || isFalling ? 'critical' : 'setpoint',
              },
            ]}
            bands={[
              ...sim.inForce.map((b) => ({ ...b, tone })),
              ...sim.vigilance.map((b) => ({ ...b, tone: 'warning' as const })),
            ]}
            markers={[
              ...sim.fires.map((t) => ({ t, label: `raised ${fmtTime(t)}`, tone: 'alert' as const })),
              ...sim.resets.map((t) => ({ t, label: 'reset', tone: 'info' as const })),
            ]}
            domain={domain}
            height={180}
          />
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <li className="flex items-center gap-1">
              <span className={cn('h-2.5 w-3.5 rounded-sm', tone === 'alert' ? 'bg-band-alert' : 'bg-band-warning')} aria-hidden /> in force
            </li>
            {sim.vigilanceHours ? (
              <li className="flex items-center gap-1">
                <span className="h-2.5 w-3.5 rounded-sm bg-band-warning" aria-hidden /> vigilance ({sim.vigilanceHours} h)
              </li>
            ) : null}
            <li className="flex items-center gap-1">
              <span className="h-3 w-px bg-sev-alert" aria-hidden /> raised
            </li>
          </ul>
        </>
      ) : null}

      <p className="text-xs" aria-live="polite">
        {verdict(sim, rule, isFalling)}
      </p>
      {sim.note ? <p className="text-[11px] text-muted-foreground">{sim.note}</p> : null}
      {dormant ? (
        <p className="text-[11px] text-muted-foreground">
          Scheduled {rule.schedule!.from} → {rule.schedule!.to}: dormant today, so it would not have fired at all. Tested as
          though active.
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {timing(sim)} Dry run against stored readings — nothing is sent, and the saved rule is unchanged until you save.
      </p>
    </div>
  );
}

function verdict(sim: RuleSimulation, rule: AlertRule, isFalling: boolean): React.ReactNode {
  const where = STATIONS_BY_ID[sim.locationId].name;
  if (!sim.points.length) return <span className="text-muted-foreground">Not tested at {where}.</span>;
  const carried = sim.inForce[0]?.from === sim.from;
  const last = sim.inForce[sim.inForce.length - 1];
  const stillOn = last && last.to >= sim.to;
  const vig = sim.vigilance[sim.vigilance.length - 1];

  if (!sim.fires.length && !carried) {
    if (isFalling && sim.armedAt !== undefined)
      return (
        <span>
          <strong>Armed</strong> — the line has been blocked at {where} since {fmtTime(sim.armedAt)} (water over the rail foot). This
          fires once the level has fallen for 10 minutes.
        </span>
      );
    if (isFalling) return <span>The line was not blocked at {where} in the last 24 h, so this rule was never armed.</span>;
    if (!sim.peak) return <span>No readings at {where} in the last 24 h.</span>;
    const gap = Math.abs(rule.value - sim.peak.v);
    return (
      <span>
        <strong>Would not have fired</strong> at {where} in the last 24 h. Highest {fmtValue(sim.peak.v)} {sim.unit} at {fmtTime(sim.peak.t)} —{' '}
        {fmtValue(gap)} {sim.unit} short of the line.
      </span>
    );
  }
  return (
    <span>
      <strong>
        {carried && !sim.fires.length
          ? 'Already in force'
          : `Would have raised ${sim.fires.length} ${rule.severity}${sim.fires.length === 1 ? '' : 's'}`}
      </strong>{' '}
      at {where}
      {sim.fires.length ? ` — ${sim.fires.map(fmtTime).join(', ')}` : ' when the window opens'}.
      {stillOn ? ' Still in force now.' : last ? ` Stood down ${fmtTime(last.to)}.` : ''}
      {vig && !stillOn ? (vig.to >= sim.to ? ' Vigilance running now.' : ` Vigilance ended ${fmtTime(vig.to)}.`) : ''}
      {sim.resets.length ? ` ${sim.resets.length} re-trigger${sim.resets.length === 1 ? '' : 's'} restarted the countdown.` : ''}
      {sim.peak && !isFalling ? ` Peak ${fmtValue(sim.peak.v)} ${sim.unit} at ${fmtTime(sim.peak.t)}.` : ''}
    </span>
  );
}

function timing(sim: RuleSimulation): string {
  const parts = [
    sim.dwellMin ? `held ${sim.dwellMin} min before raising` : 'raised on the first qualifying reading',
    sim.clearDwellMin ? `${sim.clearDwellMin} min clear before standing down` : '',
    sim.vigilanceHours ? `${sim.vigilanceHours} h vigilance after` : '',
  ].filter(Boolean);
  return `Tested: ${sim.metric.toLowerCase()}, 5-minute steps, ${parts.join(', ')}.`;
}

/** Axis ends on round numbers, so the ticks between them are round too. */
function niceDomain(lo: number, hi: number): [number, number] {
  const span = Math.max(1, hi - lo);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? 10 * mag;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

/** Whether a "between dates" rule is live on the given day (Sydney date). */
function inSchedule(schedule: { from: string; to: string }, t: number): boolean {
  const day = new Date(t).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  return day >= schedule.from && day <= schedule.to;
}
