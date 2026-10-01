'use client';

import Link from 'next/link';
import { ArrowDown, ArrowRight, Check, Minus, MonitorSmartphone, Server, Radio, MessageSquareOff } from 'lucide-react';
import { STATIONS } from '@/lib/mock/seed/stations';
import { RESPONSE_OBLIGATIONS } from '@/lib/mock/seed/incidents';
import { cn } from '@/lib/utils';
import { ProgrammeGantt } from './programme-gantt';

/**
 * The system this portal belongs to, and the contract it is delivered under.
 *
 * Most of the proposal is about things that are not screens — the sensor mix per
 * location, how it was built and commissioned, who maintains it and how fast,
 * the safety and governance obligations. An operator rarely needs them; an
 * administrator, an auditor or a new engineer does, and today they would go
 * looking for a 52-page PDF. So the facts live here, next to the configuration
 * they explain, and the sensor matrix is computed from the station list itself
 * so it cannot drift from what the rest of the portal shows.
 */

const SECTIONS = [
  { id: 'glance', label: 'At a glance' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'sensors', label: 'Sensors by location' },
  { id: 'programme', label: 'Programme' },
  { id: 'support', label: 'Support' },
  { id: 'safety', label: 'Safety & compliance' },
  { id: 'governance', label: 'Governance' },
];

export function SystemPage() {
  const loggers = STATIONS.reduce((n, s) => n + s.loggers.length, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">System and contract</h2>
          <p className="text-sm text-muted-foreground">
            What is installed, how it was delivered, and who keeps it running — from proposal OBS-MTS-M1-WX-2026-01.
          </p>
        </div>
        <Link href="/coverage" className="text-sm font-medium text-primary-strong hover:underline">
          Requirements coverage →
        </Link>
      </div>

      <nav aria-label="On this page" className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            {s.label}
          </a>
        ))}
      </nav>

      {/* §2 — Solution at a glance */}
      <Card id="glance" title="Solution at a glance" source="§2">
        <dl className="divide-y text-sm">
          {[
            ['Weather stations', `${STATIONS.length} autonomous stations, ${loggers} OMC-048 loggers — Marrickville, Marrickville–Dulwich Hill, Canterbury, Campsie, Belmore triangle, Lady Game Drive tunnel (two units), Windsor Road. Each fitted only with the sensors its location needs.`],
            ['Sensors', 'Gill WindSonic 75 (wind, 0–75 m/s), Gill GMX300 (temperature, humidity, pressure), RIMCO 7499 (rainfall, BOM standard), YGRD-65-D radar and RS PRO RSF80 float with manual staff gauges at flood points.'],
            ['Flood pumps', 'Integration to the existing Marrickville pumps: the OMC-048 starts and stops them from the radar, with the float as an independent backup, and reads run and fault status. The pumps themselves are not supplied.'],
            ['Telemetry', 'One OMC-048 per station: 1-minute logging, local pump and alert logic, 4G/5G cellular, store-and-forward, autonomous solar power.'],
            ['Alerting', 'Configurable threshold engine; weather alerts within 5 minutes, system faults within 30; automatic fallback and self-diagnostics.'],
            ['Portal', 'This portal — map, laptop and phone, 10-minute health refresh, interrogation and acknowledgement, history and export.'],
            ['Service', 'Blue2Care preventive and corrective maintenance, calibration certificates and lifecycle support from the Australian office.'],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="font-medium">{k}</dt>
              <dd className="text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          One accountable supplier across sensors, telemetry, server and service · ISO 9001:2015 · Blue2Green sustainability programme.
        </p>
      </Card>

      {/* §4 / Figure 1 */}
      <Card id="architecture" title="End-to-end architecture" source="§4, Figure 1">
        <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
          <Block icon={Radio} title={`Field stations × ${STATIONS.length}`} lines={['WindSonic 75 — wind', 'GMX300 — temperature, RH, pressure', 'RIMCO 7499 — rainfall', 'YGRD-65-D — radar level', 'RSF80 — float (backup)', 'OMC-048 logger · solar + battery', 'Pumps → existing panel (Marrickville)']} />
          <Flow label="4G / 5G · store and forward" />
          <Block icon={Server} title="Central server" lines={['Map visualisation', 'Alert engine', 'Historical storage']} tone="primary" />
          <Flow label="≤ 5 min weather · ≤ 30 min faults" />
          <div className="grid gap-1.5 lg:w-48">
            <Out icon={MonitorSmartphone} label="Portal — 20 named logins" />
            <Out icon={MonitorSmartphone} label="Screen pop-up · email · web push" />
            <Out icon={Server} label="MTS OCC operations" />
            <Out icon={MessageSquareOff} label="SMS — replaced by web push (Rev B)" off />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Safety-critical detections — water above the rail foot, a pump start — are acted on by the logger at once and sent
          immediately, independent of the 5-minute cycle and of the cellular link. Module-level detail on the{' '}
          <Link href="/health/pipeline" className="text-primary-strong hover:underline">
            data pipeline
          </Link>
          .
        </p>
      </Card>

      {/* §4.3 / §6 — the per-location matrix, computed */}
      <Card id="sensors" title="Sensors by location" source="§4.3, §6">
        <div className="scroll-x-hint overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-header text-header-foreground">
              <tr>
                {['Location', 'Chainage', 'Logger', 'Rain gauge (DI1)', 'Radar level (RS-485)', 'Float switch (DI2)', 'GMX300 (SDI-12)', 'WindSonic (COM1)', 'Pumps (RO1–2)'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((s) => {
                const count = (p: string) => s.sensors.filter((x) => x.parameter === p).length;
                const cells = [count('rainfall'), count('water_level'), count('float_switch'), count('temperature'), count('wind_mean'), s.pumpStation ? 1 : 0];
                return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link href={`/stations/${s.id}`} className="font-medium hover:text-primary hover:underline">
                        {s.ordinal}. {s.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs italic text-muted-foreground">{s.chainage.label}</td>
                    <td className="tabular whitespace-nowrap px-3 py-2 text-xs">{s.loggers.map((l) => l.id).join(', ')}</td>
                    {cells.map((n, i) => (
                      <td key={i} className="px-3 py-2">
                        {n ? (
                          <span className="inline-flex items-center gap-0.5 font-medium text-sev-normal-strong">
                            <Check className="h-4 w-4" aria-label="fitted" />
                            {n > 1 ? <span className="text-xs">×{n}</span> : null}
                          </span>
                        ) : (
                          <Minus className="h-4 w-4 text-muted-foreground" aria-label="not required" />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          ✓ fitted · – not required at that location. Lady Game Drive carries two radar and float pairs, one per tunnel, each on
          its own logger with its own panel and battery: the two points are far apart, a shared logger would mean a long cable
          through the tunnel and a single point of failure. Kilometrages and GPS positions are provisional until MTS confirms
          them on site visits (§15).
        </p>
      </Card>

      {/* §10 — Figure 16 and the site rules */}
      <section id="programme" className="scroll-mt-20 space-y-3">
        <ProgrammeGantt />
        <Card title="Installation and site works" source="§10.2">
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              ['Access and possessions', 'Only in Engineering Hours or agreed weekend possessions, observing the NDI-TAL access windows; restricted-access requests at least two weeks ahead (T-minus guideline).'],
              ['Siting', 'Outside transit space and beyond overhead-wire safe approach distances; inaccessible to the public; at the flood points of interest; clear of obstructions for wind.'],
              ['Height access', 'Licensed operators, with the height-access schedule approved in writing by the Principal before work.'],
              ['Competency', 'RIW cards, MTS inductions, Electrical Safety Rules awareness and site-specific training for every person on site.'],
              ['Storage and housekeeping', 'Materials stored only with written approval; work areas left clean, surplus removed after each activity.'],
              ['Safe work method statement', 'Submitted at least 15 days before site works; each contract plan kept to five pages (§13.1).'],
            ].map(([k, v]) => (
              <li key={k} className="rounded-md border p-2.5">
                <p className="font-medium">{k}</p>
                <p className="text-xs text-muted-foreground">{v}</p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* §11 — Blue2Care */}
      <Card id="support" title="Maintenance and support — Blue2Care" source="§11">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Response times (§11.2)</h4>
            <table className="w-full text-sm">
              <tbody>
                {[
                  ['Corrective maintenance — terminal system fault', `Response ≤ ${RESPONSE_OBLIGATIONS.responseH} h`],
                  ['On-site investigation and proposed remediation', `Within ${RESPONSE_OBLIGATIONS.investigationH} h`],
                  ['On-site repair, including fault remediation', `Within ${RESPONSE_OBLIGATIONS.repairH} h`],
                  ['System inoperable — maximum time to repair (from start of remediation)', `Within ${RESPONSE_OBLIGATIONS.maxRepairH} h`],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b last:border-0 align-top">
                    <td className="py-1.5 pr-3 text-muted-foreground">{k}</td>
                    <td className="tabular whitespace-nowrap py-1.5 font-semibold">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Link href="/health" className="mt-2 inline-block text-xs font-medium text-primary-strong hover:underline">
              Open work orders against these clocks →
            </Link>
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preventive maintenance (§11.1)</h4>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>To Observator&apos;s Technical Maintenance Plans — statutory obligations, OEM specifications and industry standards.</li>
              <li>In Engineering Hours or possessions, inside the single 36-hour planned window a year (§9).</li>
              <li>
                Every instrument calibrated by a recognised laboratory, labelled, and listed with certificates submitted annually —{' '}
                <Link href="/health" className="text-primary-strong hover:underline">
                  calibration schedule
                </Link>
                .
              </li>
              <li>Resourced from the Australian office in Melbourne.</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* §12 */}
      <Card id="safety" title="Safety, environment and compliance" source="§12">
        <ul className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {[
            ['Work Health and Safety', 'SWMS and task risk assessments; notifiable incidents actioned within 24 h; written reports on incidents and observations.'],
            ['Rail Safety National Law', 'Safe railway operations agreed with the Principal, OpCo and Sydney Metro; drug and alcohol programme; AQF-aligned competency; cooperation with ONRSR.'],
            ['Environment (POEO Act)', 'Environmental management systems; pollution incidents reported to the Principal (and 000 for major ones); compliance records kept.'],
            ['Modern Slavery Act', 'Annual statutory declaration; supply-chain due diligence; the Principal’s audit rights.'],
            ['Physical security', 'Rail-industry and Principal standards; anti-vandal mounting for the Southwest corridor; prompt reporting of breaches.'],
            ['Information / OT security', 'OT Supplier Security Management Standard SMCSWTS2-MTS-1NL-IT-PRO-005862; no unauthorised access to Principal or third-party equipment and data.'],
          ].map(([k, v]) => (
            <li key={k} className="flex gap-2 rounded-md border p-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-sev-normal-strong" aria-hidden />
              <span>
                <span className="font-medium">{k}</span>
                <span className="block text-xs text-muted-foreground">{v}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          EMC: equipment is selected and installed so as not to interfere with rolling stock or infrastructure; evidence is
          provided during design (§8.5).
        </p>
      </Card>

      {/* §13 */}
      <Card id="governance" title="Governance and contract management" source="§13">
        <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
          {[
            ['Representatives', 'A Contract Management Representative within 15 days of the Agreement as single point of contact; a Project Manager day to day.'],
            ['Meetings', 'Safety tool-box, fortnightly, monthly performance review and emergency meetings, with delegated authority to act.'],
            ['Incident management', 'Allocated incidents responded to within the agreed times, with analysis, impact assessment and cooperation with other contractors.'],
            ['Variations', 'Additional services quoted against the Schedule of Rates; written variation proposals within five business days.'],
            ['Configuration management', 'Under the Principal’s Configuration Management Plan: like-for-like replacement is maintenance; non-like-for-like and portal changes go to the CCB.'],
            ['Audit and reporting', 'Random audits supported at no extra cost; corrective actions closed; performance reporting on the agreed schedule.'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="font-medium">{k}</dt>
              <dd className="text-xs text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Summary of compliance (§14).</span> The proposal addresses the full
          scope of the Statement of Requirements; items still to confirm are limited to those in §15 — each is flagged where it
          appears, and listed on{' '}
          <Link href="/coverage" className="text-primary-strong hover:underline">
            requirements coverage
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}

function Card({ id, title, source, children }: { id?: string; title: string; source: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-lg border bg-card p-4" aria-labelledby={id ? `${id}-h` : undefined}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={id ? `${id}-h` : undefined} className="text-sm font-semibold">
          {title}
        </h3>
        <span className="text-[11px] text-muted-foreground">{source}</span>
      </header>
      {children}
    </section>
  );
}

function Block({ icon: Icon, title, lines, tone }: { icon: typeof Radio; title: string; lines: string[]; tone?: 'primary' }) {
  return (
    <article className={cn('min-w-0 flex-1 rounded-md border p-3', tone === 'primary' ? 'border-primary/40 bg-primary/5' : 'bg-muted/30')}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden /> {title}
      </p>
      <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </article>
  );
}

function Flow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center text-[10px] text-muted-foreground lg:w-28" aria-hidden>
      <ArrowDown className="h-4 w-4 lg:hidden" />
      <ArrowRight className="hidden h-4 w-4 lg:block" />
      <span>{label}</span>
    </div>
  );
}

function Out({ icon: Icon, label, off }: { icon: typeof Radio; label: string; off?: boolean }) {
  return (
    <span className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs', off ? 'border-dashed text-muted-foreground' : 'bg-card font-medium')}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> {label}
    </span>
  );
}
