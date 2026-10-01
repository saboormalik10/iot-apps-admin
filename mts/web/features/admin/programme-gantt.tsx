'use client';

import { ChartFrame } from '@/components/charts/chart-frame';
import { HoverTip, TipRow, useHoverTip } from '@/components/charts/hover-tip';
import { cn } from '@/lib/utils';

/**
 * Figure 16, the implementation programme, in weeks from contract award (§10.1).
 *
 * Kept on the system page because it is the record of how the system came to be
 * — design approval, factory and site acceptance, handover — and the dates a
 * reviewer asks for when something about the installation is questioned later.
 * The colour carries one job, the stage type the client's figure distinguishes:
 * off-corridor work (front-loaded to retire risk), on-corridor work (bound to
 * possessions) and handover. Milestones are diamonds in ink.
 */
type Kind = 'off' | 'on' | 'handover';

const STAGES: { no: number; name: string; from: number; to: number | null; kind: Kind; detail: string }[] = [
  { no: 1, name: 'Initiation and mobilisation', from: 1, to: 2, kind: 'off', detail: 'Kick-off; project management, WHS and quality plans; access/possession strategy; baseline programme and risk register.' },
  { no: 2, name: 'Detailed design and site surveys', from: 2, to: 6, kind: 'off', detail: 'Site surveys at all seven locations; detailed design; threshold and alert configuration; design approval (hold point).' },
  { no: 3, name: 'Procurement, build and FAT', from: 5, to: 12, kind: 'off', detail: 'Long-lead items; enclosures assembled and wired; loggers configured; factory acceptance test per station.' },
  { no: 4, name: 'Server build and staging', from: 8, to: 12, kind: 'off', detail: 'Central server, portal and alert engine stood up; station-to-server comms proven in staging.' },
  { no: 5, name: 'Site installation', from: 12, to: 18, kind: 'on', detail: 'Masts, enclosures, sensors, solar/battery and the Marrickville pump integration; each site made safe each shift.' },
  { no: 6, name: 'Commissioning and SAT', from: 15, to: 19, kind: 'on', detail: 'Power-up, integration and a per-location site acceptance test against the server; ITP sign-off with MTS.' },
  { no: 7, name: 'Handover and training', from: 19, to: 20, kind: 'handover', detail: 'As-builts, O&M manuals and certificates; operator and maintenance training; practical completion.' },
  { no: 8, name: 'Warranty and support', from: 20, to: null, kind: 'handover', detail: 'Remote monitoring, preventive maintenance and defect rectification under Blue2Care (§11). Ongoing.' },
];

const MILESTONES = [
  { week: 6, label: 'Design approval' },
  { week: 12, label: 'FAT sign-off' },
  { week: 19, label: 'SAT sign-off · system live' },
  { week: 20, label: 'Practical completion' },
];

const KIND: Record<Kind, { label: string; cls: string; swatch: string }> = {
  off: { label: 'Off-corridor', cls: 'bg-chart-1', swatch: 'hsl(var(--chart-1))' },
  on: { label: 'On-corridor (possessions)', cls: 'bg-chart-2', swatch: 'hsl(var(--chart-2))' },
  handover: { label: 'Handover and support', cls: 'bg-chart-6', swatch: 'hsl(var(--chart-6))' },
};

const WEEKS = 21;

export function ProgrammeGantt() {
  const { ref, tip, bind } = useHoverTip();
  /* Week w starts at (w-1)/WEEKS of the track; a stage "W5–12" runs to the end of week 12. */
  const left = (w: number) => `${((w - 1) / WEEKS) * 100}%`;
  const width = (a: number, b: number) => `${((b - a + 1) / WEEKS) * 100}%`;

  return (
    <ChartFrame
      as="h3"
      title="Implementation programme"
      unit="weeks from contract award"
      footnote="Figure 16 / §10.1 — indicative durations, driven by rail access windows; confirmed with MTS at initiation."
      hideSyntheticMark
      table={{
        head: ['Stage', 'Weeks', 'Type', 'Activities'],
        rows: STAGES.map((s) => [`${s.no} ${s.name}`, s.to ? `W${s.from}–${s.to}` : `W${s.from} →`, KIND[s.kind].label, s.detail]),
      }}
    >
      <div ref={ref} className="relative">
        <div>
          <div>
            {/* week ruler */}
            <div className="grid grid-cols-1 gap-2 text-[10px] text-muted-foreground sm:grid-cols-[minmax(0,14.5rem)_1fr]">
              <span className="hidden sm:block" />
              <div className="relative h-4">
                {[1, 4, 8, 12, 16, 20].map((w) => (
                  <span key={w} className="tabular absolute -translate-x-1/2" style={{ left: `calc(${left(w)} + ${100 / WEEKS / 2}%)` }}>
                    W{w}
                  </span>
                ))}
              </div>
            </div>
            <ol className="space-y-1">
              {STAGES.map((s) => (
                <li key={s.no} className="grid grid-cols-1 items-center gap-0.5 sm:grid-cols-[minmax(0,14.5rem)_1fr] sm:gap-2">
                  <span className="truncate text-xs">
                    <span className="tabular mr-1 text-muted-foreground">{s.no}</span>
                    {s.name}
                  </span>
                  <div className="relative h-6 rounded bg-muted/50">
                    {/* faint week grid */}
                    {Array.from({ length: WEEKS - 1 }).map((_, i) => (
                      <span key={i} className="absolute inset-y-0 border-l border-border/60" style={{ left: left(i + 2) }} aria-hidden />
                    ))}
                    <span
                      className={cn(
                        'absolute inset-y-1 flex items-center rounded px-1.5 text-[10px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        KIND[s.kind].cls,
                        !s.to && 'rounded-r-none',
                      )}
                      style={{ left: left(s.from), width: s.to ? width(s.from, s.to) : `calc(100% - ${left(s.from)})` }}
                      {...bind(
                        <>
                          <p className="mb-1 font-semibold">
                            {s.no}. {s.name}
                          </p>
                          <TipRow swatch={KIND[s.kind].swatch} value={s.to ? `W${s.from}–${s.to}` : `from W${s.from}`} label={KIND[s.kind].label} />
                          <p className="mt-1 text-muted-foreground">{s.detail}</p>
                        </>,
                      )}
                    >
                      <span className="truncate [text-shadow:0_0_2px_rgb(0_0_0/0.5)]">{s.to ? `W${s.from}–${s.to}` : 'ongoing →'}</span>
                    </span>
                  </div>
                </li>
              ))}
              {/* milestones */}
              <li className="grid grid-cols-1 items-start gap-1 pt-1 sm:grid-cols-[minmax(0,14.5rem)_1fr] sm:gap-2">
                <span className="text-xs font-semibold">Milestones</span>
                <div className="relative h-5 sm:h-12">
                  {MILESTONES.map((m, i) => (
                    <span
                      key={m.week}
                      /* Near the end of the track the label reads leftwards from its
                         diamond, or W19 and W20 — a week apart — print over each other. */
                      className={cn(
                        'absolute flex flex-col outline-none',
                        m.week >= 16 ? '-translate-x-[calc(100%-5px)] items-end' : '-translate-x-1/2 items-center',
                      )}
                      style={{ left: `calc(${left(m.week)} + ${100 / WEEKS}%)`, top: i % 2 ? 22 : 0 }}
                      {...bind(<TipRow value={`end of W${m.week}`} label={m.label} />)}
                    >
                      <span className="h-2.5 w-2.5 rotate-45 bg-foreground" aria-hidden />
                      <span className="mt-0.5 hidden whitespace-nowrap text-[10px] text-muted-foreground sm:block">{m.label}</span>
                    </span>
                  ))}
                </div>
              </li>
            </ol>
          </div>
        </div>
        {/* On a phone the four labels do not fit under their diamonds; they are listed instead. */}
        <ol className="mt-1 space-y-0.5 text-[11px] text-muted-foreground sm:hidden">
          {MILESTONES.map((m) => (
            <li key={m.week} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rotate-45 bg-foreground" aria-hidden />
              <span className="tabular font-medium text-foreground">end W{m.week}</span> {m.label}
            </li>
          ))}
        </ol>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-3.5 rounded-sm', KIND[k].cls)} aria-hidden />
              {KIND[k].label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 rotate-45 bg-foreground" aria-hidden /> milestone
          </li>
        </ul>
        <HoverTip tip={tip} width={640} />
      </div>
    </ChartFrame>
  );
}
