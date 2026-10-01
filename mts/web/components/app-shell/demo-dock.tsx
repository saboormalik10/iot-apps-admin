'use client';

import { Clock, FastForward, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { demoJumpTo, demoPause, demoReset, demoSetSpeed, demoState, storyPoints } from '@/lib/api/endpoints';
import { useDemoClock } from '@/lib/demo-clock';
import { fmtClock, fmtTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Demo time — a control for the review, not part of the product.
 *
 * The portal opens at 14:32, with the storm at its height. Everything the
 * proposal says happens afterwards — the rain vigilance counting down and the
 * all-clear (§7.2), the water trending down and the staged reinstatement (§7.3),
 * the pumps stopping at L-stop (§5.6), the standing-water pop-up at Canterbury
 * (§7.5) — only appears if time moves on. This plays it faster, or jumps straight
 * to each moment, which are read from the event log so they cannot drift from it.
 */
export function DemoDock() {
  const now = useDemoClock();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => ({ speed: 1, paused: false }));
  const [points, setPoints] = useState<{ t: number; label: string; id: string }[]>([]);

  useEffect(() => {
    if (open) setPoints(storyPoints());
  }, [open]);
  useEffect(() => {
    const s = demoState();
    setState({ speed: s.speed, paused: s.paused });
  }, [now]);

  if (!now) return null;

  return (
    <div className="fixed bottom-3 right-3 z-40 print:hidden">
      {open ? (
        <section
          aria-label="Demo time controls"
          className="w-[min(92vw,20rem)] rounded-lg border bg-card p-3 text-sm shadow-xl"
        >
          <header className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 font-semibold">
                <Clock className="h-4 w-4" aria-hidden /> Demo time
              </p>
              <p className="text-[11px] text-muted-foreground">Prototype control — not part of the portal.</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-muted" aria-label="Close demo time">
              <X className="h-4 w-4" />
            </button>
          </header>

          <p className="tabular mb-2 text-2xl font-semibold">
            {fmtClock(now)} <span className="text-xs font-normal text-muted-foreground">AEST {state.paused ? '· paused' : `· ×${state.speed}`}</span>
          </p>

          <div className="mb-3 grid grid-cols-4 gap-1" role="group" aria-label="Speed">
            <SpeedButton active={state.paused} onClick={demoPause} label="Pause">
              <Pause className="h-3.5 w-3.5" />
            </SpeedButton>
            {[1, 10, 60].map((x) => (
              <SpeedButton key={x} active={!state.paused && state.speed === x} onClick={() => demoSetSpeed(x)} label={`${x}× speed`}>
                {x === 1 ? <Play className="h-3.5 w-3.5" /> : <FastForward className="h-3.5 w-3.5" />}
                <span className="text-[11px]">×{x}</span>
              </SpeedButton>
            ))}
          </div>

          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Jump to</p>
          <ol className="max-h-56 space-y-0.5 overflow-y-auto">
            {points.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => demoJumpTo(p.t)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted',
                    p.t <= now && 'text-muted-foreground',
                  )}
                >
                  <span>{p.label}</span>
                  <span className="tabular">{fmtTime(p.t)}</span>
                </button>
              </li>
            ))}
          </ol>

          <button
            onClick={demoReset}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-xs hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Back to 14:32
          </button>
        </section>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-2 text-xs font-medium shadow-lg hover:bg-muted"
          aria-label="Open demo time controls"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden />
          <span className="tabular">{fmtTime(now)}</span>
          <span className="text-muted-foreground">{state.paused ? 'paused' : state.speed === 1 ? 'demo time' : `×${state.speed}`}</span>
        </button>
      )}
    </div>
  );
}

function SpeedButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex h-8 items-center justify-center gap-1 rounded border transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
