'use client';

import Link from 'next/link';
import { ArrowDown, ArrowRight, Cloud, Database, Mail, Monitor, Network, Radio, Smartphone, MessageSquareOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MaintenanceWindow, User } from '@/lib/api/types';
import type { PipelineStats } from '@/lib/api/endpoints';
import { listUsers, maintenanceWindows, pipelineStats } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { SeriesChart } from '@/components/charts/series';
import { LoadingState } from '@/components/screen-states';
import { useDemoClock } from '@/lib/demo-clock';
import { fmtDate, fmtDateTime, fmtTime, sydneyMidnight } from '@/lib/format';
import { SERIES } from '@/lib/viz/roles';
import { cn } from '@/lib/utils';
import { HealthTabs } from './health-tabs';

/**
 * The central software, as Figure 11 draws it — five modules in sequence, the
 * time-series database, and the channels it publishes to — with each module's
 * work for today counted.
 *
 * The proposal describes the pipeline in prose (§8.2). Drawn and counted, it
 * answers the questions an IT reviewer actually asks: is anything queueing, is
 * validation rejecting much, and did every alert get out in time?
 */
export function PipelinePage() {
  const now = useDemoClock();
  const [s, setS] = useState<PipelineStats | null>(null);
  const [users, setUsers] = useState<User[] | null>(null);
  const [windows, setWindows] = useState<MaintenanceWindow[] | null>(null);
  const tenMin = Math.floor(now / 600_000);
  useEffect(() => {
    if (!now) return;
    pipelineStats().then(setS);
    listUsers().then(setUsers);
    maintenanceWindows().then(setWindows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenMin]);

  if (!now || !s) return <LoadingState label="Counting the pipeline…" />;
  const n = (x: number) => x.toLocaleString('en-AU');

  const modules = [
    {
      no: 1,
      name: 'Data ingest',
      role: 'Receives every logger message over 4G/5G, timestamps and buffers it, and reconciles store-and-forward backlogs.',
      stats: [
        ['Messages today', n(s.messagesToday)],
        ['Event-triggered', n(s.eventSendsToday)],
      ],
    },
    {
      no: 2,
      name: 'Data validation',
      role: 'Range and rate-of-change limits, sensor status flags, radar-against-float cross-checks.',
      stats: [
        ['Readings checked', n(s.readingsToday)],
        ['Quarantined', n(s.quarantinedToday)],
      ],
    },
    {
      no: 3,
      name: 'Data processing',
      role: 'Calibration, rolling totals, and every threshold, dwell timer and vigilance countdown.',
      stats: [
        ['Rule evaluations', n(s.rulesEvaluatedToday)],
        ['Alerts raised', n(s.alertsToday)],
      ],
    },
    {
      no: 4,
      name: 'Data logging',
      role: 'Every raw reading, processed value and event, permanently — the history and the audit trail.',
      stats: [
        ['Readings stored', n(s.readingsToday)],
        ['Retained since', fmtDate(s.storedSince)],
      ],
    },
    {
      no: 5,
      name: 'Data dissemination',
      role: 'Per-channel routing and formatting; delivery is confirmed and retried on failure.',
      stats: [
        ['Deliveries today', n(s.deliveriesToday)],
        ['In time', `${s.deliveredInTime}/${s.deliveriesToday}`],
      ],
    },
  ];

  const series = [
    { key: 'routine', label: 'Routine (every 5 min)', points: s.bins.map((b) => ({ t: b.t, v: b.routine, status: 'normal' as const })), color: SERIES[0], kind: 'bar' as const, stackId: 'm' },
    { key: 'fast', label: 'Fast reporting (every minute)', points: s.bins.map((b) => ({ t: b.t, v: b.fast, status: 'normal' as const })), color: SERIES[1], kind: 'bar' as const, stackId: 'm' },
    { key: 'event', label: 'Event-triggered', points: s.bins.map((b) => ({ t: b.t, v: b.event, status: 'normal' as const })), color: SERIES[2], kind: 'bar' as const, stackId: 'm' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">System health</h1>
        <p className="text-sm text-muted-foreground">From the logger in the field to the alert on a screen — every stage, counted for today.</p>
      </div>
      <HealthTabs />

      <section className="rounded-lg border bg-card p-4">
        <header className="mb-4">
          <h2 className="text-sm font-semibold">Data and alert flow</h2>
          <p className="text-xs text-muted-foreground">
            §4.1 and Figure 11. Safety-critical detection and pump control run on the logger itself, so they continue
            if the cellular link or the server is lost; data is buffered and forwarded on restoration.
          </p>
        </header>

        <div className="flex flex-col items-stretch gap-2 xl:flex-row xl:items-center">
          <Node icon={Radio} title="Field — 8 × OMC-048" body="1-minute logging, local alert and pump logic, store-and-forward" />
          <Arrow />
          <Node icon={Radio} title="4G / 5G cellular" body="Every 5 min, every minute above half the warning level, immediately on a breach" />
          <Arrow />
          <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {modules.map((m) => (
              <article key={m.no} className="flex min-w-0 flex-col rounded-md border border-primary/30 bg-primary/5 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">{m.no}</span>
                  {m.name}
                </p>
                <p className="mt-1 flex-1 text-[11px] leading-snug text-muted-foreground">{m.role}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-2 border-t pt-2 text-xs">
                  {m.stats.map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[11px] text-muted-foreground">{k}</dt>
                      <dd className="font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <Arrow />
          <div className="grid gap-1.5 sm:grid-cols-5 xl:w-44 xl:grid-cols-1">
            <Out icon={Monitor} label="On screen" />
            <Out icon={Smartphone} label="Web push" />
            <Out icon={Mail} label="Email" />
            <Out icon={Network} label="Other connected systems" sub="operational displays, third-party interfaces — scoped at design" />
            <Out icon={MessageSquareOff} label="SMS — Rev B, not in scope" off />
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Database className="h-3.5 w-3.5" aria-hidden /> Central time-series database — every reading since commissioning, behind the History
          screen and the audit trail. {s.backfilledLast30d} buffered readings forwarded after outages in the last 30 days; none lost.
        </p>
      </section>

      <Blue2Map />

      <HostingPanel now={now} users={users} windows={windows} />

      <ChartFrame
        as="h2"
        title="Messages received — last 24 hours"
        unit="per 30 min"
        footnote="Stacked by why each was sent. As the water rose the flood loggers switched to one-minute reporting (§5.2), and every breach went immediately (§4)."
        table={{
          head: ['30 minutes to', 'Routine', 'Fast reporting', 'Event-triggered'],
          rows: s.bins.filter((b) => b.fast || b.event).map((b) => [fmtTime(b.t), b.routine, b.fast, b.event]),
        }}
      >
        <SeriesChart height={220} series={series} />
      </ChartFrame>
    </div>
  );
}

function Node({ icon: Icon, title, body }: { icon: typeof Radio; title: string; body: string }) {
  return (
    <article className="rounded-md border bg-muted/40 p-3 xl:w-44">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden /> {title}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{body}</p>
    </article>
  );
}

function Arrow() {
  return (
    <span className="flex justify-center text-muted-foreground" aria-hidden>
      <ArrowDown className="h-4 w-4 xl:hidden" />
      <ArrowRight className="hidden h-4 w-4 xl:block" />
    </span>
  );
}

function Out({ icon: Icon, label, sub, off }: { icon: typeof Radio; label: string; sub?: string; off?: boolean }) {
  return (
    <span
      className={cn(
        'flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs',
        off ? 'border-dashed text-muted-foreground' : 'bg-card font-medium',
      )}
    >
      <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        {label}
        {sub ? <span className="block text-[10px] font-normal leading-tight text-muted-foreground">{sub}</span> : null}
      </span>
    </span>
  );
}

/**
 * §3.1: Observator's four Blue2 building blocks, and where each one shows up
 * in this portal — so the framework in the proposal is a map, not a slogan.
 */
function Blue2Map() {
  const blocks = [
    { name: 'Blue2Scan', role: 'Sensor technology', what: 'WindSonic 75, GMX300, RIMCO 7499, YGRD-65-D radar and RSF80 float at seven locations.', href: '/stations/belmore', where: 'Station → equipment' },
    { name: 'Blue2Link', role: 'Data transport & storage', what: 'OMC-048 loggers and 4G/5G telemetry: gather, buffer, transmit; local pump and alert logic.', href: '/health', where: 'Health → availability' },
    { name: 'Blue2Cast', role: 'Data publishing', what: 'This server and portal: map, dashboards, alerts and history.', href: '/', where: 'Corridor, Trends, Alerts' },
    { name: 'Blue2Care', role: 'Uncompromised support', what: 'Commissioning, preventive and corrective maintenance, calibration, emergency management.', href: '/health', where: 'Health → work orders' },
  ];
  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold">The Blue2 delivery framework</h2>
        <p className="text-xs text-muted-foreground">§3.1 — the four building blocks, and where each appears in the portal.</p>
      </header>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {blocks.map((b, i) => (
          <li key={b.name} className="flex min-w-0 flex-col rounded-md border p-3">
            <p className="text-sm font-semibold">
              <span className="tabular mr-1.5 text-muted-foreground">{i + 1}</span>
              {b.name} <span className="font-normal text-muted-foreground">— {b.role}</span>
            </p>
            <p className="mt-1 flex-1 text-[11px] leading-snug text-muted-foreground">{b.what}</p>
            <Link href={b.href} className="mt-2 text-xs font-medium text-primary-strong hover:underline">
              {b.where} →
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * §8.1: where the server lives and what that buys — cloud hosting with the
 * provider's failover, automated backups, 48 hours' notice of maintenance, and
 * the 20 named logins. The region is MTS's call and is left open (§15).
 */
function HostingPanel({ now, users, windows }: { now: number; users: User[] | null; windows: MaintenanceWindow[] | null }) {
  const lastBackup = sydneyMidnight(now) + 2 * 3_600_000 <= now ? sydneyMidnight(now) + 2 * 3_600_000 : sydneyMidnight(now) - 22 * 3_600_000;
  const active = users?.filter((u) => u.status === 'active').length ?? 0;
  const invited = users?.filter((u) => u.status === 'invited').length ?? 0;
  const next = windows?.[0];
  const facts: [string, string][] = [
    ['Hosting', 'AWS (or Google Cloud) — region, availability zones and data residency confirmed with MTS at design (§15)'],
    ['High availability', 'Redundant compute, storage and network with automatic failover, provided by the host — no MTS hardware'],
    ['Backups', `Automated and durable · last completed ${fmtDateTime(lastBackup)}`],
    ['Portal maintenance', 'None scheduled · always notified at least 48 h ahead (§8.1)'],
    ['Field maintenance', next ? `${fmtDateTime(next.from)} → ${fmtTime(next.to)} · ${next.possession} (§9, 36 h a year)` : '—'],
    ['Named logins', users ? `${active + invited} of 20 allocated — ${active} active, ${invited} invited` : '—'],
    ['Health refresh', 'Every 10 minutes, as required'],
    ['Retention', 'Every reading and event since commissioning — no expiry'],
  ];
  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Cloud className="h-4 w-4 text-muted-foreground" aria-hidden /> Hosting and availability
        </h2>
        <p className="text-xs text-muted-foreground">
          §8.1 — stable and uninterrupted through revenue hours, with nothing for MTS to buy, house or refresh.
        </p>
      </header>
      <dl className="grid gap-x-6 gap-y-2.5 text-xs sm:grid-cols-2 xl:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
