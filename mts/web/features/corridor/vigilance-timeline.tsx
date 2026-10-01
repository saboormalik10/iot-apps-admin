'use client';

import type { VigilanceRule } from '@/lib/api/types';
import { fmtDateTime, fmtDay, fmtTime, sydneyMidnight, wallClockTicks } from '@/lib/format';

/**
 * §7.2 as a picture: each rule's breach, the moment it fell back under the line,
 * the vigilance countdown that followed, and the all-clear.
 *
 * While a rule is still over its line the countdown has not started, so it is
 * drawn as an outline from "now" — "at least this long once the rain eases" —
 * which is exactly what the controller needs to plan patrols around: the 3-day
 * rule commits the network to 48 hours of vigilance however soon the rain stops.
 */
export function VigilanceTimeline({ rules, now }: { rules: VigilanceRule[]; now: number }) {
  const H = 3_600_000;
  const starts = rules.map((r) => r.firstBreachAt).filter((x): x is number => x !== undefined);
  if (!starts.length) {
    return (
      <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        No rule has been breached in the look-back, so there is nothing to count down.
      </p>
    );
  }
  const from = Math.min(...starts) - H;
  const ends = rules.map((r) => (r.state === 'breached' ? now + r.vigilanceHours * H : r.endsAt ?? now));
  const to = Math.max(now + 2 * H, ...ends) + H;
  const span = to - from;
  const x = (t: number) => `${((Math.max(from, Math.min(to, t)) - from) / span) * 100}%`;
  const w = (a: number, b: number) => `${(Math.max(0, Math.min(to, b) - Math.max(from, a)) / span) * 100}%`;
  const step = span > 48 * H ? 12 * H : span > 20 * H ? 6 * H : 2 * H;
  // Ticks on the Sydney clock face — midnight, midday — with the date at midnight.
  const ticks = wallClockTicks(from + 1, to - 1, step / 60_000);

  return (
    <div className="mt-3 border-t pt-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Vigilance timeline</p>
      <div className="space-y-1.5">
        {rules.map((r) => (
          <div key={r.id} className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{r.windowLabel}</span>
            <div className="relative h-4 rounded-sm bg-muted/60">
              {r.firstBreachAt !== undefined ? (
                <span
                  className="absolute inset-y-0 rounded-sm bg-sev-alert"
                  style={{ left: x(r.firstBreachAt), width: w(r.firstBreachAt, r.belowAt ?? now) }}
                  title={`Over the line ${fmtTime(r.firstBreachAt)}–${r.belowAt ? fmtTime(r.belowAt) : 'now'}`}
                />
              ) : null}
              {r.state === 'breached' ? (
                <span
                  className="absolute inset-y-0.5 rounded-sm border-2 border-dashed border-sev-warning"
                  style={{ left: x(now), width: w(now, now + r.vigilanceHours * H) }}
                  title={`At least ${r.vigilanceHours} h of vigilance once the total falls below ${r.thresholdMm} mm`}
                />
              ) : r.belowAt !== undefined && r.endsAt !== undefined ? (
                <span
                  className="absolute inset-y-0 rounded-sm bg-sev-warning"
                  style={{ left: x(r.belowAt), width: w(r.belowAt, r.endsAt), opacity: r.state === 'clear' ? 0.45 : 1 }}
                  title={`Vigilance ${fmtTime(r.belowAt)} → ${fmtDateTime(r.endsAt)}`}
                />
              ) : null}
              <span className="absolute -inset-y-1 w-px bg-foreground/70" style={{ left: x(now) }} aria-hidden />
              {r.clearedAt ? (
                <span className="absolute -top-0.5 text-[10px] text-sev-normal-strong" style={{ left: x(r.clearedAt) }} title="All-clear issued">
                  ✓
                </span>
              ) : null}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[4.5rem_1fr] gap-2">
          <span />
          <div className="relative h-4 text-[10px] text-muted-foreground">
            {ticks.map((t) => (
              <span key={t} className="tabular absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x(t) }}>
                {sydneyMidnight(t) === t ? fmtDay(t) : fmtTime(t)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
        <li className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-sev-alert" aria-hidden /> over the line
        </li>
        <li className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-sev-warning" aria-hidden /> vigilance
        </li>
        <li className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm border border-dashed border-sev-warning" aria-hidden /> vigilance still to come
        </li>
        <li>✓ all-clear · | now</li>
      </ul>
    </div>
  );
}
