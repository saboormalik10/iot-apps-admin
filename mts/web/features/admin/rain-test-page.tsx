'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Download,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartFrame } from '@/components/charts/chart-frame';
import { SeriesChart, type BandMark } from '@/components/charts/series';
import {
  HOUR,
  MIN,
  RAIN_MESSAGES,
  THREE_DAY_RULE,
  hourlyRain,
  runRainRule,
  type RainEvent,
} from '@/lib/rain-sim/engine';
import { expectedCsv, fileBase, hourlyCsv, sydneyStamp, tipsCsv } from '@/lib/rain-sim/export';
import {
  EVENT_LABEL,
  LOGGER,
  SCENARIOS,
  SCENARIO_START,
  atToMs,
  msToAt,
  tipsFor,
} from '@/lib/rain-sim/scenarios';
import { cn } from '@/lib/utils';

/**
 * The 3-day rainfall rule, tested on screen (client, 2 Nov 2026: "build test cases,
 * especially on the 3 days rain — create a simulation — need test data").
 *
 * Pick a scenario and press Play: days of gauge tips replay in seconds through the
 * same engine `yarn test:rain` checks, and each expected event turns Pass or Fail
 * as the clock reaches it. The data behind each scenario downloads as CSV.
 */

const SPEEDS = [
  { label: '2 h / s', hoursPerSecond: 2 },
  { label: '6 h / s', hoursPerSecond: 6 },
  { label: '24 h / s', hoursPerSecond: 24 },
];
const TICK_MS = 100;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function hm(ms: number): string {
  const mins = Math.max(0, Math.round(ms / MIN));
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min`;
}

export function RainTestPage() {
  const [id, setId] = useState(SCENARIOS[2].id);
  const scenario = SCENARIOS.find((s) => s.id === id)!;
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  /** Minutes since the scenario started. */
  const [clock, setClock] = useState(0);
  const endMin = scenario.runH * 60;

  // The whole run is worked out once; playback only reveals it.
  const { tips, run, hourly } = useMemo(() => {
    const t = tipsFor(scenario);
    const to = SCENARIO_START + scenario.runH * HOUR;
    return {
      tips: t,
      run: runRainRule(t, THREE_DAY_RULE, SCENARIO_START, to),
      hourly: hourlyRain(t, SCENARIO_START, to),
    };
  }, [scenario]);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setClock((c) => {
        const next = Math.min(endMin, c + (SPEEDS[speed].hoursPerSecond * 60 * TICK_MS) / 1000);
        if (next >= endMin) setPlaying(false);
        return next;
      });
    }, TICK_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, endMin]);

  const choose = (next: string) => {
    setId(next);
    setPlaying(false);
    setClock(0);
  };

  const now = SCENARIO_START + Math.floor(clock) * MIN;
  const seen = run.events.filter((e) => e.t <= now);
  const sample = [...run.samples].reverse().find((x) => x.t <= now) ?? run.samples[0];
  const lastCountdown = [...seen].reverse().find((e) => e.kind === 'countdown');
  const rainLastHour =
    Math.round(
      tips.filter((x) => x.t > now - HOUR && x.t <= now).reduce((a, x) => a + x.mm, 0) * 10,
    ) / 10;
  const finished = clock >= endMin;

  const totalPoints = run.samples.map((x) => ({ t: x.t, v: x.t <= now ? x.totalMm : null }));
  const rainPoints = hourly.map((h) => ({
    t: h.t,
    v: h.t + HOUR <= now ? h.mm : h.t < now ? 0 : null,
  }));
  const bands = bandsUpTo(seen, now);

  // Expected against what has happened so far, in order.
  const checks = scenario.expected.map((e, i) => {
    const a: RainEvent | undefined = seen[i];
    const due = atToMs(e.at) <= now;
    const status = a
      ? a.kind === e.kind && a.t === atToMs(e.at)
        ? 'pass'
        : 'fail'
      : due
        ? 'fail'
        : 'pending';
    return { e, a, status };
  });
  const unexpected = seen.slice(scenario.expected.length);
  const allPass = finished && checks.every((c) => c.status === 'pass') && !unexpected.length;
  const anyFail = checks.some((c) => c.status === 'fail') || unexpected.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The 3-day rule:{' '}
        <b className="text-foreground">
          alert at ≥ {THREE_DAY_RULE.thresholdMm} mm of rain in any {THREE_DAY_RULE.windowHours}{' '}
          hours
        </b>
        , a {THREE_DAY_RULE.vigilanceHours}-hour vigilance countdown once the total falls back
        below, restarted if it reaches {THREE_DAY_RULE.thresholdMm} mm again, then the all-clear.
        Each scenario replays simulated rain on the Marrickville gauge ({LOGGER}, 0.2 mm per tip)
        and checks what the system does against the expected result.
      </p>

      {/* The scenarios */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => choose(s.id)}
            aria-pressed={s.id === id}
            className={cn(
              'rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50',
              s.id === id && 'border-primary ring-1 ring-primary',
            )}
          >
            <span className="block text-[11px] font-semibold text-muted-foreground">{s.id}</span>
            <span className="block text-sm font-semibold">{s.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{s.proves}</span>
          </button>
        ))}
      </div>

      {/* Playback */}
      <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <Button
          size="sm"
          onClick={() => (finished ? (setClock(0), setPlaying(true)) : setPlaying(!playing))}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? 'Pause' : finished ? 'Play again' : clock ? 'Resume' : 'Play'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => (setPlaying(false), setClock(0))}>
          <RotateCcw className="h-4 w-4" /> Restart
        </Button>
        <Button size="sm" variant="outline" onClick={() => (setPlaying(false), setClock(endMin))}>
          <SkipForward className="h-4 w-4" /> Jump to end
        </Button>
        <div className="flex gap-1" role="group" aria-label="Speed">
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setSpeed(i)}
              aria-pressed={speed === i}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs',
                speed === i
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={endMin}
          step={10}
          value={clock}
          onChange={(e) => (setPlaying(false), setClock(Number(e.target.value)))}
          aria-label="Simulation time"
          className="min-w-[160px] flex-1"
        />
        <span className="tabular text-xs text-muted-foreground">
          +{msToAt(now)} · {sydneyStamp(now)}
        </span>
      </section>

      {/* Where it stands */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="3-day total"
          value={`${sample.totalMm.toFixed(1)} mm`}
          tone={sample.totalMm >= THREE_DAY_RULE.thresholdMm ? 'alert' : undefined}
        />
        <Tile label="Rain in the last hour" value={`${rainLastHour.toFixed(1)} mm`} />
        <Tile
          label="Rule state"
          value={
            sample.state === 'alert'
              ? 'ALERT active'
              : sample.state === 'vigilance'
                ? 'Vigilance'
                : 'Normal'
          }
          tone={
            sample.state === 'alert'
              ? 'alert'
              : sample.state === 'vigilance'
                ? 'warning'
                : undefined
          }
        />
        <Tile
          label="Countdown left"
          value={
            sample.state === 'vigilance' && lastCountdown?.endsAt
              ? hm(lastCountdown.endsAt - now)
              : '—'
          }
          tone={sample.state === 'vigilance' ? 'warning' : undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <ChartFrame
            title="3-day rainfall total"
            unit="mm"
            footnote="Red: alert active · amber: 48-hour vigilance countdown"
            hideSyntheticMark
          >
            <SeriesChart
              series={[
                {
                  key: 'total',
                  label: '3-day total',
                  points: totalPoints,
                  parameter: 'rainfall',
                  kind: 'area',
                },
              ]}
              thresholds={[
                {
                  value: THREE_DAY_RULE.thresholdMm,
                  label: `≥ ${THREE_DAY_RULE.thresholdMm} mm in 3 days`,
                  tone: 'critical',
                },
              ]}
              bands={bands}
              markers={seen.map((e) => ({
                t: e.t,
                label: EVENT_LABEL[e.kind],
                tone: e.kind === 'all-clear' ? 'info' : 'alert',
              }))}
              height={260}
              syncId="rain-test"
            />
          </ChartFrame>
          <ChartFrame title="Rain per hour" unit="mm" hideSyntheticMark>
            <SeriesChart
              series={[
                {
                  key: 'rain',
                  label: 'Rain',
                  points: rainPoints,
                  parameter: 'rainfall',
                  kind: 'bar',
                },
              ]}
              height={140}
              xFormat="day"
            />
          </ChartFrame>
        </div>

        <div className="min-w-0 space-y-4">
          {/* Expected against actual */}
          <section className="rounded-lg border bg-card">
            <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <h2 className="text-sm font-semibold">Test result</h2>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  allPass
                    ? 'bg-sev-normal-tint text-sev-normal-strong'
                    : anyFail
                      ? 'bg-sev-alert-tint text-sev-alert-strong'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {allPass ? 'PASS' : anyFail ? 'FAIL' : 'Running…'}
              </span>
            </header>
            <ol className="divide-y text-sm">
              {checks.map(({ e, a, status }, i) => (
                <li key={i} className="flex gap-2 px-3 py-2">
                  {status === 'pass' ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-sev-normal"
                      aria-label="Pass"
                    />
                  ) : status === 'fail' ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-sev-alert" aria-label="Fail" />
                  ) : (
                    <Circle
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-label="Not reached yet"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {EVENT_LABEL[e.kind]} at +{e.at}
                    </span>
                    <span className="block text-xs text-muted-foreground">{e.why}</span>
                    {a && status === 'fail' ? (
                      <span className="block text-xs text-sev-alert-strong">
                        Got: {EVENT_LABEL[a.kind]} at +{msToAt(a.t)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
              {unexpected.map((a, i) => (
                <li key={`u${i}`} className="flex gap-2 px-3 py-2">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-sev-alert" aria-label="Fail" />
                  <span className="text-xs text-sev-alert-strong">
                    Unexpected: {EVENT_LABEL[a.kind]} at +{msToAt(a.t)}
                  </span>
                </li>
              ))}
              {!scenario.expected.length && !unexpected.length ? (
                <li className="flex gap-2 px-3 py-2">
                  {finished ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-sev-normal"
                      aria-label="Pass"
                    />
                  ) : (
                    <Circle
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-label="Running"
                    />
                  )}
                  <span className="text-sm">No alert expected</span>
                </li>
              ) : null}
            </ol>
            {scenario.mustNot ? (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">{scenario.mustNot}</p>
            ) : null}
          </section>

          {/* What the system sent */}
          <section className="rounded-lg border bg-card">
            <h2 className="border-b px-3 py-2 text-sm font-semibold">Messages sent</h2>
            {seen.length ? (
              <ol className="divide-y">
                {[...seen].reverse().map((e, i) => (
                  <li key={i} className="px-3 py-2 text-xs">
                    <span className="tabular block font-semibold">
                      {EVENT_LABEL[e.kind]} · {sydneyStamp(e.t)} · 3-day total{' '}
                      {e.totalMm.toFixed(1)} mm
                    </span>
                    <span className="block text-muted-foreground">{RAIN_MESSAGES[e.kind]}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-3 py-3 text-xs text-muted-foreground">Nothing yet.</p>
            )}
          </section>

          {/* Test data */}
          <section className="space-y-2 rounded-lg border bg-card p-3">
            <h2 className="text-sm font-semibold">Test data for {scenario.id}</h2>
            <p className="text-xs text-muted-foreground">
              {tips.length} gauge tips, {(tips.length * 0.2).toFixed(1)} mm in all, over{' '}
              {scenario.runH} hours.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(`${fileBase(scenario)}-tips.csv`, tipsCsv(scenario))}
              >
                <Download className="h-4 w-4" /> Gauge tips
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(`${fileBase(scenario)}-hourly.csv`, hourlyCsv(scenario))}
              >
                <Download className="h-4 w-4" /> Hourly totals
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  download(`${fileBase(scenario)}-expected.csv`, expectedCsv(scenario))
                }
              >
                <Download className="h-4 w-4" /> Expected events
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Red while the alert is active, amber while the countdown runs — up to the playback clock. */
function bandsUpTo(events: RainEvent[], now: number): BandMark[] {
  const bands: BandMark[] = [];
  let open: { from: number; tone: 'alert' | 'warning' } | null = null;
  const close = (t: number) => {
    if (open) bands.push({ from: open.from, to: t, tone: open.tone });
    open = null;
  };
  for (const e of events) {
    close(e.t);
    if (e.kind === 'alert' || e.kind === 'retrigger') open = { from: e.t, tone: 'alert' };
    if (e.kind === 'countdown') open = { from: e.t, tone: 'warning' };
  }
  close(now);
  return bands;
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'alert' | 'warning';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-l-4 bg-card px-3 py-2',
        tone === 'alert'
          ? 'border-l-sev-alert'
          : tone === 'warning'
            ? 'border-l-sev-warning'
            : 'border-l-border',
      )}
    >
      <p className="tabular text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
