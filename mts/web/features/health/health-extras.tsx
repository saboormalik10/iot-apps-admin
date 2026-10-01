'use client';

import { CalendarClock, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AvailabilityBudget, CalibrationItem, MaintenanceWindow, QualityFlag } from '@/lib/api/types';
import { availabilityBudgets, calibrationSchedule, maintenanceWindows, qualityFlags } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { Meter } from '@/components/charts/meter';
import { fmtDate, fmtDateTime, fmtDuration } from '@/lib/format';
import { STATIONS_BY_ID } from '@/lib/mock/seed/stations';
import { useDataRevision } from '@/lib/use-data';
import { cn } from '@/lib/utils';

/**
 * §9's two availability limits, per logger: no more than 24 hours unplanned
 * downtime in any 12 months, and no single outage longer than 12 hours in any 6.
 * A contract limit is a budget, so it is drawn as one — how much of it each
 * station has used — rather than as an uptime percentage, which reads 99.9 %
 * right up until the day it is breached.
 */
export function AvailabilityPanel() {
  const revision = useDataRevision();
  const [data, setData] = useState<AvailabilityBudget[] | null>(null);
  useEffect(() => {
    availabilityBudgets().then(setData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
  if (!data) return <div className="h-72 animate-pulse rounded-lg border bg-muted/40" />;
  return (
    <ChartFrame
      as="h2"
      title="Availability budget"
      footnote="§9: unplanned downtime ≤ 24 h in any 12 months, and no outage over 12 h in any 6. The annual 36-hour maintenance window is planned and excluded."
      table={{
        head: ['Logger', 'Unplanned, 12 months (h)', 'Longest, 6 months (h)', 'Outages'],
        rows: data.map((a) => [a.label, a.hours12m, a.longest6m, a.outages.filter((o) => !o.planned).length]),
      }}
    >
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        {data.map((a) => (
          <div key={a.loggerId} className="min-w-0 rounded-md border p-3">
            <p className="mb-2 text-sm font-medium leading-tight">{a.label}</p>
            <div className="space-y-2.5">
              <Meter label="12-month total" value={a.hours12m} limit={24} unit="h" compact />
              <Meter label="Longest single outage" sublabel="6 months" value={a.longest6m} limit={12} unit="h" compact />
            </div>
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}

/**
 * §9 "advise when re-calibration is required" and §11.1's annual certificates.
 * Sorted by due date, so the thing to do next is at the top.
 */
export function CalibrationPanel({ now }: { now: number }) {
  const revision = useDataRevision();
  const [items, setItems] = useState<CalibrationItem[] | null>(null);
  useEffect(() => {
    calibrationSchedule().then(setItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
  if (!items) return <div className="h-72 animate-pulse rounded-lg border bg-muted/40" />;
  const overdue = items.filter((i) => i.state === 'overdue').length;
  const soon = items.filter((i) => i.state === 'due-soon').length;
  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Calibration</h2>
        <p className="text-xs text-muted-foreground">
          {items.length} instruments · {overdue} overdue · {soon} due within 45 days. Certificates are submitted annually for approval (§11.1).
        </p>
      </header>
      {/* Four columns, not six: in half a row the old table wrapped the
          instrument name one word per line and cut the certificate off. */}
      <div className="scroll-x-hint max-h-[26rem] overflow-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
            <tr>
              {['Status', 'Instrument', 'Due', 'Certificate'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.sensorId} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                      i.state === 'overdue' && 'bg-sev-alert-tint text-sev-alert-strong',
                      i.state === 'due-soon' && 'bg-sev-warning-tint text-sev-warning-strong',
                      i.state === 'current' && 'bg-sev-normal-tint text-sev-normal-strong',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        i.state === 'overdue' ? 'bg-sev-alert' : i.state === 'due-soon' ? 'bg-sev-warning' : 'bg-sev-normal',
                      )}
                    />
                    {i.state === 'overdue' ? 'Overdue' : i.state === 'due-soon' ? 'Due soon' : 'Current'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <p className="leading-tight">{i.instrument.replace(/\s*\(.*\)$/, '')}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {STATIONS_BY_ID[i.locationId].name} · <span className="tabular">{i.sensorId}</span>
                  </p>
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2">
                  {fmtDate(i.dueAt)}
                  <span className="block text-[11px] text-muted-foreground">
                    {i.dueAt < now ? `${fmtDuration(now - i.dueAt)} late` : `in ${fmtDuration(i.dueAt - now)}`} · last {fmtDate(i.lastCalibrated)}
                  </span>
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-muted-foreground">{i.certificate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const RULE_WORD: Record<QualityFlag['rule'], string> = {
  range: 'Out of range',
  'rate-of-change': 'Rate of change',
  frozen: 'Frozen value',
  'cross-check': 'Cross-check failed',
};

/**
 * §8.2's validation module: readings that failed a range, rate-of-change,
 * frozen-value or cross-check test, and were quarantined (kept out of the
 * alert engine) or flagged. Operators are "never shown misleading values", and
 * this is where they can see which values were withheld and why.
 */
export function QualityPanel() {
  const revision = useDataRevision();
  const [flags, setFlags] = useState<QualityFlag[] | null>(null);
  useEffect(() => {
    qualityFlags().then(setFlags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Data quality — readings withheld</h2>
        <p className="text-xs text-muted-foreground">
          Failed a validation check (§8.2) and kept out of the alert engine. The raw value is retained for review.
        </p>
      </header>
      {!flags ? (
        <div className="m-4 h-24 animate-pulse rounded bg-muted/60" />
      ) : (
        <ul className="divide-y">
          {flags.map((f) => (
            <li key={f.id} className="flex gap-3 px-4 py-3">
              <ShieldAlert className={cn('mt-0.5 h-4 w-4 shrink-0', f.action === 'quarantined' ? 'text-sev-warning-strong' : 'text-sev-info-strong')} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{RULE_WORD[f.rule]}</span> · {STATIONS_BY_ID[f.locationId].name}
                  <span className="text-muted-foreground"> · {f.sensorId}</span>
                </p>
                <p className="text-xs text-muted-foreground">{f.detail}</p>
                <p className="tabular mt-0.5 text-[11px] text-muted-foreground">
                  {fmtDateTime(f.t)} · {f.action === 'quarantined' ? 'Quarantined' : 'Flagged, still used'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** §8.1: maintenance is notified at least 48 hours ahead; §9: one 36-hour window a year. */
export function MaintenanceNotice({ now }: { now: number }) {
  const revision = useDataRevision();
  const [w, setW] = useState<MaintenanceWindow[] | null>(null);
  useEffect(() => {
    maintenanceWindows().then(setW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
  const next = w?.find((x) => x.to > now);
  if (!next) return null;
  return (
    <section className="flex items-start gap-3 rounded-lg border border-sev-info/30 bg-sev-info-tint p-4">
      <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-sev-info-strong" aria-hidden />
      <div className="text-sm text-sev-info-strong">
        <p className="font-semibold">Planned maintenance — {fmtDateTime(next.from)} to {fmtDateTime(next.to)} (36 h)</p>
        <p>
          {next.scope}. {next.possession}. Notified {fmtDateTime(next.notifiedAt)}, {fmtDuration(next.from - next.notifiedAt)} ahead — the
          minimum is 48 hours.
        </p>
      </div>
    </section>
  );
}
