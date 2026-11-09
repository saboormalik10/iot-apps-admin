'use client';

import { useState } from 'react';
import type { PumpRun, PumpStationLive } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { fmtDateTime, fmtDuration, fmtSigned, fmtTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The Marrickville pumps, monitored only (client, 9 Nov 2026): "The pump control
 * will not be part of the system … You will be given a signal … When the
 * signal/status is ON, you show a green color. Record the pump activity, always a
 * start time and end time … record the water level when the pump starts and stops."
 *
 * So there are no controls here: each pump is ON (green) or OFF from its run
 * signal, and every run is logged with its times and the water level at each end.
 */

const NAME: Record<PumpRun['pump'], string> = { duty: 'Duty pump', standby: 'Standby pump' };

export function PumpStatusCard({ pump, now }: { pump: PumpStationLive; now: number }) {
  const anyOn = pump.pumps.some((p) => p.state === 'running');
  return (
    <section className="rounded-lg border bg-card p-3">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Pump station</h2>
          <p className="text-xs text-muted-foreground">Status from the pump panel&apos;s run signal</p>
        </div>
        <OnOff on={anyOn} label={anyOn ? 'RUNNING' : 'ALL OFF'} />
      </header>
      <ul className="space-y-2">
        {pump.pumps.map((p) => {
          const on = p.state === 'running';
          return (
            <li
              key={p.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md border px-3 py-2',
                on && 'border-op-running/40 bg-op-running-tint',
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{NAME[p.role]}</p>
                <p className="tabular text-xs text-muted-foreground">
                  {on && p.since
                    ? `ON since ${fmtTime(p.since)} · running ${fmtDuration(now - p.since)}`
                    : p.lastRun
                      ? `OFF · last stopped ${fmtDateTime(p.lastRun)}`
                      : 'OFF'}
                </p>
                <p className="tabular text-xs text-muted-foreground">
                  Today: {p.runHoursToday} h · {p.starts} {p.starts === 1 ? 'start' : 'starts'}
                </p>
              </div>
              <OnOff on={on} />
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        The portal shows the pumps&apos; status only. They are started and stopped by the pump panel on site.
      </p>
    </section>
  );
}

const PAGE = 8;

export function PumpRunLog({ runs, now }: { runs: PumpRun[]; now: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? runs : runs.slice(0, PAGE);
  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Pump run log — last 7 days</h2>
        <p className="text-xs text-muted-foreground">Every run, with the water level when it started and stopped.</p>
      </header>
      {runs.length ? (
        <div className="scroll-x-hint overflow-x-auto">
          <table className="w-full min-w-[460px] text-xs">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                {['Pump', 'Started', 'Stopped', 'Ran for', 'Level at start', 'Level at stop'].map((h) => (
                  <th key={h} className="px-2 py-2 align-bottom font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {shown.map((r) => (
                <tr key={`${r.pump}-${r.start}`} className="border-t">
                  <td className="whitespace-nowrap px-2 py-2">
                    <span className="font-medium">{r.pump === 'duty' ? 'Duty' : 'Standby'}</span>
                    {r.exercise ? <span className="block text-[11px] text-muted-foreground">weekly exercise</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{fmtDateTime(r.start)}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {r.stop !== undefined ? fmtDateTime(r.stop) : <OnOff on label="Running" />}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{fmtDuration((r.stop ?? now) - r.start)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{fmtSigned(r.levelStartMm)} mm</td>
                  <td className="whitespace-nowrap px-2 py-2">{r.levelStopMm !== undefined ? `${fmtSigned(r.levelStopMm)} mm` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-3 py-4 text-xs text-muted-foreground">No pump runs in the last 7 days.</p>
      )}
      {runs.length > PAGE ? (
        <footer className="border-t px-3 py-2">
          <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show all ${runs.length} runs`}
          </Button>
        </footer>
      ) : null}
    </section>
  );
}

/** Green when the run signal is ON, grey when OFF — always with the word, never colour alone. */
function OnOff({ on, label }: { on: boolean; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
        on ? 'bg-op-running text-white' : 'bg-muted text-muted-foreground',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', on ? 'bg-white' : 'bg-muted-foreground')} aria-hidden />
      {label ?? (on ? 'ON' : 'OFF')}
    </span>
  );
}
