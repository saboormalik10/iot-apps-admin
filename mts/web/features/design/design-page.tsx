'use client';

import { AlertTriangle, CheckCircle2, CircleDot, Info, WifiOff } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { contrast, validate, validateOrdinal, type CheckResult } from '@/lib/viz/checks.mjs';
import { cn } from '@/lib/utils';

/**
 * How the portal uses colour — and proof that it is doing so safely.
 *
 * This page reads the colour tokens the rest of the portal is actually drawn
 * with, in whichever theme is showing, and runs the same checks the build runs
 * (`yarn validate-palette`) against them, live. It cannot drift from the product:
 * change a token and this page, and every chart, change with it.
 *
 * It is here for the review. A rail operator is entitled to ask whether a
 * colour-blind controller can tell rainfall from water level, and "yes" should
 * come with its working.
 */

const SERIES_ROLES = [
  'Water level',
  'Air temperature',
  'Rainfall',
  'Battery & solar',
  'Humidity',
  'Float switch',
  'Wind (gust dashed)',
  'Held back — reads as an alarm',
];

function hslToHex(triplet: string): string {
  const m = triplet.trim().match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) return '#000000';
  const h = +m[1];
  const s = +m[2] / 100;
  const l = +m[3] / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

interface Tokens {
  mode: 'light' | 'dark';
  surface: string;
  card: string;
  series: string[];
  seq: string[];
  ord: string[];
  div: { neg: string; mid: string; pos: string };
  status: { id: string; label: string; base: string; strong: string; tint: string }[];
  op: { id: string; label: string; base: string }[];
}

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string) => hslToHex(cs.getPropertyValue(`--${name}`));
  const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  return {
    mode,
    surface: get('chart-surface'),
    card: get('card'),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => get(`chart-${i}`)),
    seq: [1, 2, 3, 4, 5, 6, 7].map((i) => get(`seq-${i}`)),
    ord: [1, 2, 3, 4, 5].map((i) => get(`ord-${i}`)),
    div: { neg: get('div-neg'), mid: get('div-mid'), pos: get('div-pos') },
    status: [
      ['alert', 'Alert'],
      ['warning', 'Warning'],
      ['info', 'Information'],
      ['normal', 'Normal'],
      ['cleared', 'Cleared'],
      ['offline', 'Offline'],
    ].map(([id, label]) => ({ id, label, base: get(`sev-${id}`), strong: get(`sev-${id}-strong`), tint: get(`sev-${id}-tint`) })),
    op: [
      ['running', 'Running'],
      ['ready', 'Ready'],
      ['fault', 'Fault'],
      ['manual', 'Manual'],
    ].map(([id, label]) => ({ id, label, base: get(`op-${id}`) })),
  };
}

export function DesignPage() {
  const { resolvedTheme } = useTheme();
  const [t, setT] = useState<Tokens | null>(null);

  useEffect(() => {
    // After the theme attribute has landed, so the computed values are the new ones.
    const id = requestAnimationFrame(() => setT(readTokens()));
    return () => cancelAnimationFrame(id);
  }, [resolvedTheme]);

  if (!t) return null;

  const checks: { title: string; result: CheckResult; what: string }[] = [
    {
      title: 'Series palette — neighbours',
      what: 'Lines, bars and stacks: every pair of adjacent slots, under normal vision and simulated protanopia and deuteranopia.',
      result: validate(t.series, { mode: t.mode, surface: t.surface, pairs: 'adjacent' }),
    },
    {
      title: 'Series slots 1–3 — every pair',
      what: 'Small multiples and scatter, where any two colours can sit side by side.',
      result: validate(t.series.slice(0, 3), { mode: t.mode, surface: t.surface, pairs: 'all' }),
    },
    {
      title: 'Ordinal ramp — wind-rose speeds',
      what: 'One hue, lightness in order, every step visibly different from the next.',
      result: validateOrdinal(t.ord, { mode: t.mode, surface: t.surface }),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Colour &amp; chart system</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every colour on this portal does exactly one job. This page reads the colours the portal is drawn with — in
          the {t.mode} theme you are viewing — and runs the same checks as the build, live. Switch the theme in the
          header and it re-checks.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Identity', 'Which measurement is this?', 'A fixed slot per parameter, the same on every screen.'],
          ['Magnitude', 'How much?', 'One hue, light to dark — heatmaps.'],
          ['Order / polarity', 'Which band? Which side of zero?', 'An ordinal ramp; a two-pole diverging pair.'],
          ['Status', 'How bad is it?', 'Reserved. Never a series. Always with an icon and a word.'],
        ].map(([h, q, a]) => (
          <article key={h} className="rounded-lg border bg-card p-3">
            <h2 className="text-sm font-semibold">{h}</h2>
            <p className="text-xs text-muted-foreground">{q}</p>
            <p className="mt-1 text-xs">{a}</p>
          </article>
        ))}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Series palette — in its validated order</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          The order is the colour-blind safety mechanism for neighbouring series, so it never changes. Contrast is against
          the chart surface {t.surface}.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {t.series.map((hex, i) => {
            const cr = contrast(hex, t.surface);
            return (
              <li key={i} className={cn('flex items-center gap-3 rounded-md border p-2', i === 7 && 'opacity-60')}>
                <span className="h-10 w-10 shrink-0 rounded-md" style={{ background: hex }} aria-hidden />
                <div className="min-w-0 text-xs">
                  <p className="font-medium">
                    {i + 1}. {SERIES_ROLES[i]}
                  </p>
                  <p className="tabular text-muted-foreground">
                    {hex} · {cr.toFixed(2)}:1{cr < 3 ? ' — table view required' : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Checks, run now against the {t.mode} theme</h2>
        {checks.map((c) => (
          <article key={c.title} className="rounded-lg border bg-card">
            <header className="flex items-start justify-between gap-3 border-b px-4 py-2.5">
              <div>
                <h3 className="text-sm font-medium">{c.title}</h3>
                <p className="text-xs text-muted-foreground">{c.what}</p>
              </div>
              <Verdict ok={c.result.ok} />
            </header>
            <ul className="divide-y text-xs">
              {c.result.report.map(([name, state, detail]) => {
                const pass = state === true || state === 'pass';
                const warn = state === 'floor' || state === 'relief';
                return (
                  <li key={name} className="flex gap-3 px-4 py-1.5">
                    <span
                      className={cn(
                        'w-12 shrink-0 font-semibold',
                        pass ? 'text-sev-normal-strong' : warn ? 'text-sev-warning-strong' : 'text-sev-alert-strong',
                      )}
                    >
                      {pass ? 'PASS' : warn ? 'NOTE' : 'FAIL'}
                    </span>
                    <span className="w-28 shrink-0 sm:w-44">{name}</span>
                    {/* break-all: a contrast detail is one long run of hex codes with no spaces. */}
                    <span className="min-w-0 break-all text-muted-foreground sm:break-words">
                      {typeof detail === 'string' ? detail : JSON.stringify(detail)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
        <p className="text-xs text-muted-foreground">
          A NOTE on contrast means those slots sit under 3:1 on the surface; the rule then requires a second way to read
          the value, which is why every chart on the portal has a “Show the numbers” table view.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Ramp title="Sequential — magnitude" note="Heatmaps. Flipped in dark mode so “nothing” sinks into the surface." colours={t.seq} />
        <Ramp title="Ordinal — ordered bands" note="Wind-rose speed bands: darker is stronger (lighter in dark mode)." colours={t.ord} />
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Diverging — polarity</h2>
          <p className="mb-3 text-xs text-muted-foreground">Rate of rise. Two opposite poles; the middle is nothing, not a third colour.</p>
          <div className="flex h-8 overflow-hidden rounded-md">
            <span className="flex-1" style={{ background: t.div.neg }} />
            <span className="flex-1" style={{ background: t.div.mid }} />
            <span className="flex-1" style={{ background: t.div.pos }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>▼ falling</span>
            <span>0</span>
            <span>▲ rising</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Status — how bad is it?</h2>
          <p className="mb-3 text-xs text-muted-foreground">Text ink measured against its own tint and the card (WCAG, 4.5:1 for text).</p>
          <ul className="space-y-1.5">
            {t.status.map((s) => {
              const Icon = s.id === 'alert' ? AlertTriangle : s.id === 'warning' ? CircleDot : s.id === 'offline' ? WifiOff : s.id === 'info' ? Info : CheckCircle2;
              const onTint = contrast(s.strong, s.tint);
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5" style={{ background: s.tint, color: s.strong }}>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4" aria-hidden />
                    {s.label}
                  </span>
                  <span className="tabular text-xs">
                    {onTint.toFixed(2)}:1 {onTint >= 4.5 ? '✓' : '✗'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Operational — what is the plant doing?</h2>
          <p className="mb-3 text-xs text-muted-foreground">Pumps. Deliberately separate from status: a running pump is not an alert.</p>
          <ul className="grid grid-cols-2 gap-2">
            {t.op.map((o) => (
              <li key={o.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <span className="h-3 w-3 rounded-full" style={{ background: o.base }} aria-hidden />
                {o.label}
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-semibold">Chart rules</h3>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            <li>Dashes mean a threshold, and only a threshold. Gridlines are solid hairlines.</li>
            <li>A parameter wears the same colour on every screen; context series are grey.</li>
            <li>Two or more series always have a legend; every chart has a table view.</li>
            <li>One axis per chart. Different units get different charts.</li>
            <li>Text is never drawn in a series colour.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Ramp({ title, note, colours }: { title: string; note: string; colours: string[] }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{note}</p>
      <div className="flex h-8 overflow-hidden rounded-md">
        {colours.map((c) => (
          <span key={c} className="flex-1" style={{ background: c }} title={c} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>low</span>
        <span>high</span>
      </div>
    </div>
  );
}

function Verdict({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
        ok ? 'bg-sev-normal-tint text-sev-normal-strong ring-sev-normal/30' : 'bg-sev-alert-tint text-sev-alert-strong ring-sev-alert/30',
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <AlertTriangle className="h-3 w-3" aria-hidden />}
      {ok ? 'Passes' : 'Fails'}
    </span>
  );
}
