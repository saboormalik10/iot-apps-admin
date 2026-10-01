import { ArrowDown, ArrowRight } from 'lucide-react';
import type { Pump, PumpProtection } from '@/lib/api/types';
import { fmtSigned, fmtValue } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Figure 5, live: the Marrickville control logic as the OMC-048 runs it.
 *
 * The client's figure is a static block diagram — inputs, the scriptable logic,
 * the existing panel and pumps, the alarms out to the server. Drawn with the
 * live values in it, it explains *why* the pumps are doing what they are doing:
 * each set point says whether it is met, so "standby running" reads as the
 * consequence of "+216 mm ≥ L-lag +180", not as a fact on its own.
 */

type Tone = 'active' | 'alarm' | 'armed' | 'idle';

export function PumpLogicDiagram({ p, pumps, rainMm }: { p: PumpProtection; pumps?: Pump[]; rainMm?: number | null }) {
  const lvl = p.levelMm;
  const running = pumps?.some((x) => x.state === 'running') ?? lvl >= p.lStartMm;
  const radarOk = p.controlSource === 'radar';

  const rules: { label: string; detail: string; tone: Tone; state: string }[] = [
    {
      label: `L-start +${p.lStartMm} mm`,
      detail: 'start lead duty pump',
      tone: lvl >= p.lStartMm ? 'active' : 'idle',
      state: lvl >= p.lStartMm ? 'met' : 'not met',
    },
    {
      label: `L-lag +${p.lLagMm} mm`,
      detail: 'start standby / assist pump',
      tone: lvl >= p.lLagMm ? 'active' : 'idle',
      state: lvl >= p.lLagMm ? 'met' : 'not met',
    },
    {
      label: `L-stop +${p.lStopMm} mm`,
      detail: `stop pumps (min run ${p.minRunMin} min)`,
      tone: running ? 'armed' : 'idle',
      state: running ? 'armed' : 'met',
    },
    {
      label: `L-HH +${p.lLagMm} mm`,
      detail: 'high-high alarm',
      tone: lvl >= p.lLagMm ? 'alarm' : 'idle',
      state: lvl >= p.lLagMm ? 'ALARM' : 'clear',
    },
    {
      label: 'Fallback',
      detail: 'radar invalid → float-only control',
      tone: radarOk ? 'idle' : 'alarm',
      state: radarOk ? 'standing by' : 'IN USE',
    },
    {
      label: 'Fail-safe',
      detail: 'float wet + radar low → pump on',
      tone: p.floatWet && lvl < p.lStartMm ? 'alarm' : 'idle',
      state: p.floatWet && lvl < p.lStartMm ? 'ACTIVE' : 'clear',
    },
  ];

  const alarms = [
    { label: 'start / stop', on: running, event: true },
    { label: 'fail', on: pumps?.some((x) => x.state === 'fault') ?? false },
    { label: 'discrepancy', on: p.radarFloatAgreement !== 'agree' },
    { label: 'high-high', on: lvl >= p.lLagMm },
  ];

  return (
    <figure className="mb-4 space-y-2" aria-label="Pump control logic, live">
      {/* Alarms leave the logger at once, outside the 5-minute cycle (§5.6). */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-md border border-sev-warning/40 bg-sev-warning-tint/60 px-2 py-1.5 text-[11px]">
        <span className="font-semibold text-sev-warning-strong">Alarms → central server</span>
        {alarms.map((a) => (
          <span
            key={a.label}
            className={cn(
              'rounded-full px-1.5 py-px',
              a.on && 'event' in a ? 'bg-sev-info-tint font-semibold text-sev-info-strong ring-1 ring-sev-info/40' : a.on ? 'bg-sev-alert font-semibold text-white' : 'bg-card text-muted-foreground',
            )}
          >
            {a.label}
          </span>
        ))}
      </div>

      <div className="grid items-center gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.35fr)_auto_minmax(0,1fr)]">
        {/* inputs */}
        <div className="space-y-1.5">
          <Box title="YGRD-65-D radar" value={`${fmtSigned(lvl)} mm`} sub="level above datum, ±1 mm" tone="input" />
          <Box title="RSF80 float switch" value={p.floatWet ? 'WET' : 'dry'} sub={`trips at +${p.floatTripMm} mm`} tone="input" />
          <Box
            title="RIMCO 7499 rain"
            value={rainMm === undefined || rainMm === null ? '–' : `${fmtValue(rainMm)} mm / 1 h`}
            sub="alerts only — not a pump input"
            tone="muted"
          />
        </div>
        <Arrow />

        {/* the logic */}
        <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-2">
          <p className="mb-1.5 text-center text-xs font-semibold text-primary-strong">OMC-048 — scriptable pump logic</p>
          <ul className="space-y-1">
            {rules.map((r) => (
              <li
                key={r.label}
                className={cn(
                  'flex items-center justify-between gap-2 rounded border bg-card px-2 py-1 text-[11px]',
                  r.tone === 'active' && 'border-op-running/60 bg-op-running-tint',
                  r.tone === 'alarm' && 'border-sev-alert/60 bg-sev-alert-tint',
                  r.tone === 'armed' && 'border-sev-info/50 bg-sev-info-tint',
                )}
              >
                <span className="min-w-0">
                  <span className="tabular font-semibold">{r.label}</span> <span className="text-muted-foreground">→ {r.detail}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[10px] font-semibold uppercase',
                    r.tone === 'active' && 'text-sev-normal-strong',
                    r.tone === 'alarm' && 'text-sev-alert-strong',
                    r.tone === 'armed' && 'text-sev-info-strong',
                    r.tone === 'idle' && 'text-muted-foreground',
                  )}
                >
                  {r.state}
                </span>
              </li>
            ))}
            <li className="rounded border border-dashed px-2 py-1 text-center text-[11px] text-muted-foreground">
              Anti-cycle · run-dry inhibit · duty alternation (lead: pump {p.leadPump})
            </li>
          </ul>
        </div>
        <Arrow />

        {/* outputs */}
        <div className="space-y-1.5">
          <Box title="Existing pump control panel" value="240 V" sub="OMC-048 switches the control circuit" tone="input" />
          {(pumps ?? []).map((x) => (
            <Box
              key={x.id}
              title={`${x.role === 'duty' ? 'Duty' : 'Standby'} — 60 L/s`}
              value={x.state === 'running' ? `RUNNING · ${fmtValue(x.flowLps, 0)} L/s` : x.state.toUpperCase()}
              sub={x.id}
              tone={x.state === 'running' ? 'running' : x.state === 'fault' ? 'fault' : 'muted'}
            />
          ))}
          <Box title="Outfall" value="existing PVC pipe" tone="muted" />
        </div>
      </div>
      <figcaption className="text-[11px] text-muted-foreground">
        After the client&apos;s Figure 5, with live values. All set points are configuration held on the logger, pending
        MTS confirmation; the logic keeps running if the cellular link or the server is lost.
      </figcaption>
    </figure>
  );
}

function Box({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone: 'input' | 'muted' | 'running' | 'fault' }) {
  return (
    <div
      className={cn(
        'rounded-md border px-2 py-1.5 text-[11px]',
        tone === 'input' && 'border-primary/40 bg-card',
        tone === 'muted' && 'border-dashed bg-muted/30',
        tone === 'running' && 'border-op-running/60 bg-op-running-tint',
        tone === 'fault' && 'border-op-fault/60 bg-op-fault-tint',
      )}
    >
      <p className="font-semibold leading-tight">{title}</p>
      <p className={cn('tabular font-medium', tone === 'running' && 'font-semibold')}>{value}</p>
      {sub ? <p className="text-[10px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center text-muted-foreground" aria-hidden>
      <ArrowRight className="hidden h-4 w-4 md:block" />
      <ArrowDown className="h-4 w-4 md:hidden" />
    </div>
  );
}
