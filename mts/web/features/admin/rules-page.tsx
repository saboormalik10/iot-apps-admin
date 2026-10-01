'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { AlertRule } from '@/lib/api/types';
import { PARAMETER_LABELS, createRule, currentRuleVersion, listRules, saveRule, setRuleEnabled } from '@/lib/api/endpoints';
import { LoadingState } from '@/components/screen-states';
import { StatusPill, severityTone } from '@/components/status/status-pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useDemoClock } from '@/lib/demo-clock';
import { fmtRelative } from '@/lib/format';
import { CHANNELS } from '@/lib/mock/seed/rules';
import { RECIPIENT_GROUPS } from '@/lib/mock/seed/people';
import { STATIONS, STATIONS_BY_ID } from '@/lib/mock/seed/stations';
import { toast } from '@/lib/hooks/use-toast';
import { cn } from '@/lib/utils';
import { RuleDryRun } from './rule-dry-run';
import { RuleHistory } from './rule-history';

/**
 * The rules engine, as a settings screen.
 *
 * This is the screen that proves the central claim of the proposal — that every
 * threshold, timer, severity and word of an alert is configuration MTS controls,
 * not code we control. So the drawer shows the whole rule, and the message preview
 * renders exactly what a controller would receive, which is the thing the client
 * will actually check for correctness.
 */

const GROUPS = ['all', 'rainfall', 'flood', 'temperature', 'wind'] as const;

export function RulesPage() {
  const now = useDemoClock();
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    listRules().then((r) => {
      setRules(r);
      setEditing((cur) => (cur ? r.find((x) => x.id === cur.id) ?? null : null));
    });
  }, []);
  useEffect(load, [load]);

  if (!rules) return <LoadingState label="Loading rules…" />;

  const shown = rules.filter(
    (r) => (group === 'all' || r.group === group) && (!q || r.name.toLowerCase().includes(q.toLowerCase())),
  );
  const enabled = rules.filter((r) => r.enabled).length;
  const head = currentRuleVersion();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The rules-based engine: thresholds, timers, severities and recipients — not code. MTS administrators can add,
        edit, enable or disable any rule.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            setCreating(true);
            setEditing(blankRule());
          }}
        >
          <Plus className="h-4 w-4" /> New rule
        </Button>
        <div className="flex flex-wrap gap-1">
          {GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              aria-pressed={group === g}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                group === g ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:ml-auto sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search rules…"
            aria-label="Search rules"
            className="h-9 w-full pl-8 sm:w-56"
          />
        </div>
      </div>

      <div className={cn('grid gap-4', editing ? 'xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]' : '')}>
        <div className="min-w-0 space-y-4">
        <section className="min-w-0 rounded-lg border bg-card">
          {/* On a phone each rule is a card: a six-column table there showed the
              rule names and nothing else without scrolling sideways. */}
          <ul className="divide-y md:hidden">
            {shown.map((r) => (
              <li key={r.id} className={cn('space-y-2 px-4 py-3', editing?.id === r.id && 'bg-accent/40')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{PARAMETER_LABELS[r.parameter]}</p>
                  </div>
                  <StatusPill tone={severityTone(r.severity)} size="sm" />
                </div>
                <p className="text-sm">{r.condition ?? `≥ ${r.value} ${r.unit} ${r.window !== 'instant' ? `/ ${windowLabel(r.window)}` : ''}`}</p>
                <p className="text-xs text-muted-foreground">
                  {r.vigilance ? `Vigilance ${r.vigilance}${r.resetOnRetrigger ? ' · reset on re-trigger' : ''}` : r.dwell ?? 'Immediate'}
                  {r.schedule ? ` · scheduled ${r.schedule.from.slice(5)} → ${r.schedule.to.slice(5)}` : ''}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={r.enabled}
                      onCheckedChange={(v) => setRuleEnabled(r.id, v).then(load)}
                      aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`}
                    />
                    {r.enabled ? 'Enabled' : 'Disabled'}
                  </label>
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="scroll-x-hint hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-header text-header-foreground">
                <tr>
                  {['Rule / parameter', 'Trigger condition', 'Dwell / vigilance', 'Severity', 'On', ''].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.id}
                    className={cn('border-b last:border-0 hover:bg-muted/40', editing?.id === r.id && 'bg-accent/40')}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{PARAMETER_LABELS[r.parameter]}</p>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {r.condition ?? `≥ ${r.value} ${r.unit} ${r.window !== 'instant' ? `/ ${windowLabel(r.window)}` : ''}`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {r.vigilance ? `Vigilance ${r.vigilance}${r.resetOnRetrigger ? ' · reset' : ''}` : r.dwell ?? 'Immediate'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={severityTone(r.severity)} size="sm" />
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={(v) => setRuleEnabled(r.id, v).then(load)}
                        aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`}
                      />
                      {r.schedule ? (
                        <span className="mt-1 block whitespace-nowrap text-[11px] text-muted-foreground">
                          scheduled {r.schedule.from.slice(5)} → {r.schedule.to.slice(5)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              All changes are validated, version-controlled and logged. Last change: {head.by} ·{' '}
              {fmtRelative(head.at, now)} · rule set v{head.version}
            </span>
            <span>
              {rules.length} rules · {enabled} enabled
            </span>
          </footer>
        </section>
        <RuleHistory />
        </div>

        {editing ? (
          <RuleDrawer
            rule={editing}
            rules={rules}
            isNew={creating}
            onClose={() => {
              setEditing(null);
              setCreating(false);
            }}
            onSaved={() => {
              setCreating(false);
              load();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** A new rule starts from the shape of a real one, with nothing filled in. */
function blankRule(): AlertRule {
  return {
    id: 'rule-new',
    name: '',
    group: 'rainfall',
    parameter: 'rainfall',
    operator: 'gte',
    value: 0,
    unit: 'mm/hr',
    window: 'instant',
    severity: 'warning',
    enabled: false,
    appliesTo: [],
    recipients: [],
    channels: ['screen', 'email'],
    message: '',
    draftWording: true,
    resetOnRetrigger: false,
  };
}

function RuleDrawer({
  rule,
  rules,
  isNew,
  onClose,
  onSaved,
}: {
  rule: AlertRule;
  rules: AlertRule[];
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(rule);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => setDraft(rule), [rule]);
  /* Below xl the drawer is a sheet over the page. Without this it rendered a
     screen and a half below the table, and clicking Edit looked like it had
     done nothing at all. */
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [rule.id]);

  const set = <K extends keyof AlertRule>(key: K, value: AlertRule[K]) => setDraft({ ...draft, [key]: value });

  /* A rule with no name, no threshold or no locations cannot fire; a negative
     rainfall threshold would fire forever. Saying so beats saving it. */
  const errors = {
    name: draft.name.trim() ? undefined : 'Give the rule a name.',
    value: Number.isFinite(draft.value) && draft.value > 0 ? undefined : 'The threshold must be greater than zero.',
    message: draft.message.trim() ? undefined : 'Write the message a controller will receive.',
    appliesTo: draft.appliesTo.length ? undefined : 'Choose at least one location.',
  };
  const invalid = Object.values(errors).some(Boolean);

  /* Not an error, an advisory: a warning set at or above its own alert would
     only ever fire after the alert, which is almost certainly a typo. */
  const siblings = rules.filter(
    (r) => r.id !== draft.id && !r.condition && !draft.condition && r.parameter === draft.parameter && r.window === draft.window && r.operator === draft.operator,
  );
  const clash =
    draft.severity === 'warning'
      ? siblings.find((r) => r.severity === 'alert' && r.value <= draft.value)
      : draft.severity === 'alert'
        ? siblings.find((r) => r.severity === 'warning' && r.value >= draft.value)
        : undefined;

  return (
    <aside
      ref={ref}
      className="fixed inset-x-0 bottom-0 z-40 max-h-[88vh] overflow-y-auto rounded-t-lg border bg-card shadow-2xl xl:static xl:max-h-none xl:overflow-visible xl:rounded-lg xl:shadow-none">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{isNew ? 'New rule' : `Edit rule — ${rule.name}`}</h2>
        <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-4 p-4">
        <Section title="Trigger">
          <Labelled label="Rule name" error={touched ? errors.name : undefined}>
            <Input
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Rainfall — intensity"
              className="h-9"
            />
          </Labelled>
          <div className="grid grid-cols-2 gap-3">
            {draft.group === 'wind' ? (
              /* §5.4: "gust-or-mean thresholds" — the 3-second gust and the
                 2-minute mean are both computed; each rule says which it judges. */
              <Labelled label="Statistic">
                <select
                  value={draft.parameter}
                  onChange={(e) => set('parameter', e.target.value as AlertRule['parameter'])}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="wind_gust">3-second gust</option>
                  <option value="wind_mean">2-minute mean</option>
                </select>
              </Labelled>
            ) : (
              <Labelled label="Parameter">
                <Input value={PARAMETER_LABELS[draft.parameter]} readOnly className="h-9 bg-muted/50" />
              </Labelled>
            )}
            <Labelled label="Severity">
              <select
                value={draft.severity}
                onChange={(e) => set('severity', e.target.value as AlertRule['severity'])}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {['alert', 'warning', 'information'].map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Labelled>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Labelled label="Value" error={touched ? errors.value : undefined}>
              <Input
                type="number"
                min={0}
                value={draft.value}
                onChange={(e) => set('value', Number(e.target.value))}
                className="tabular h-9"
              />
            </Labelled>
            <Labelled label="Unit">
              <Input value={draft.unit} readOnly className="h-9 bg-muted/50" />
            </Labelled>
            <Labelled label="Window">
              <select
                value={draft.window}
                onChange={(e) => set('window', e.target.value as AlertRule['window'])}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {(['instant', '1h-rolling', '3h-rolling', '3d-rolling'] as const).map((w) => (
                  <option key={w} value={w}>
                    {windowLabel(w)}
                  </option>
                ))}
              </select>
            </Labelled>
          </div>
          {clash ? (
            <p className="rounded-md border border-sev-warning/40 bg-sev-warning-tint px-2 py-1.5 text-xs text-sev-warning-strong">
              {draft.severity === 'warning' ? 'At or above' : 'At or below'} “{clash.name}” ({clash.severity}, {clash.operator === 'gte' ? '≥' : '≤'}{' '}
              {clash.value} {clash.unit}) — the {draft.severity === 'warning' ? 'warning would only fire after the alert' : 'alert would fire before its warning'}.
              Check the value.
            </p>
          ) : null}
        </Section>

        <Section title="Timing">
          <div className="grid grid-cols-2 gap-3">
            <Labelled label="Dwell">
              <Input
                value={draft.dwell ?? ''}
                placeholder="Immediate"
                onChange={(e) => set('dwell', e.target.value)}
                className="h-9"
              />
            </Labelled>
            <Labelled label="Vigilance">
              <Input
                value={draft.vigilance ?? ''}
                placeholder="None"
                onChange={(e) => set('vigilance', e.target.value)}
                className="h-9"
              />
            </Labelled>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={draft.resetOnRetrigger} onCheckedChange={(v) => set('resetOnRetrigger', v)} />
            Reset the countdown if more qualifying rain falls
          </label>
        </Section>

        <Section title="Schedule">
          <div className="flex flex-wrap gap-1.5">
            {(['always', 'dates'] as const).map((mode) => {
              const on = mode === 'dates' ? Boolean(draft.schedule) : !draft.schedule;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set(
                      'schedule',
                      mode === 'always' ? undefined : draft.schedule ?? { from: '2026-12-01', to: '2027-02-28' },
                    )
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    on ? 'border-primary bg-primary/10 font-medium text-primary-strong' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {mode === 'always' ? 'Always active' : 'Between dates'}
                </button>
              );
            })}
          </div>
          {draft.schedule ? (
            <div className="grid grid-cols-2 gap-3">
              <Labelled label="From">
                <Input
                  type="date"
                  value={draft.schedule.from}
                  onChange={(e) => set('schedule', { ...draft.schedule!, from: e.target.value })}
                  className="h-9"
                />
              </Labelled>
              <Labelled label="To">
                <Input
                  type="date"
                  value={draft.schedule.to}
                  onChange={(e) => set('schedule', { ...draft.schedule!, to: e.target.value })}
                  className="h-9"
                />
              </Labelled>
            </div>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            For seasonal rules (heat in summer) or temporary ones during track works. Outside the dates the rule is
            dormant but kept.
          </p>
        </Section>

        <Section title="Applies to">
          {touched && errors.appliesTo ? <FieldError>{errors.appliesTo}</FieldError> : null}
          <div className="flex flex-wrap gap-1.5">
            {STATIONS.map((s) => {
              const on = draft.appliesTo.includes(s.id);
              /* A rule can only read a sensor that is there. Offering Canterbury
                 for a rain rule would save a rule that can never fire. */
              const base = draft.group === 'rainfall' ? 'rainfall' : draft.parameter;
              const fitted = s.sensors.some((x) => x.parameter === base);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!fitted && !on}
                  title={fitted ? undefined : `No ${PARAMETER_LABELS[base].toLowerCase()} sensor at ${s.name}`}
                  onClick={() =>
                    set('appliesTo', on ? draft.appliesTo.filter((x) => x !== s.id) : [...draft.appliesTo, s.id])
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    !fitted && 'cursor-not-allowed border-dashed opacity-60',
                    on ? 'border-primary bg-primary/10 font-medium text-primary-strong' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {s.name}
                  {!fitted ? <span className="sr-only"> — no sensor fitted</span> : null}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Where the rule reads its sensor. Dashed locations have no{' '}
            {PARAMETER_LABELS[draft.group === 'rainfall' ? 'rainfall' : draft.parameter].toLowerCase()} sensor; the section an
            action covers is stated in the message. If a sensor fails, the rule falls back to its designated alternate
            source (§7.4).
          </p>
        </Section>

        <Section title="Test against the last 24 hours">
          <RuleDryRun rule={draft} />
        </Section>

        <Section title="Alert message">
          <textarea
            value={draft.message}
            onChange={(e) => set('message', e.target.value)}
            rows={4}
            aria-label="Alert message"
            className="w-full rounded-md border bg-background p-2 text-sm"
          />
          {touched && errors.message ? <FieldError>{errors.message}</FieldError> : null}
          {draft.draftWording ? (
            <p className="rounded bg-muted px-2 py-1 text-[11px] uppercase text-muted-foreground">
              draft wording — pending MTS confirmation
            </p>
          ) : null}
          {/* What a controller will actually receive. This is the line the client
              checks for correctness, so it is rendered rather than described. */}
          <div className="rounded-md border border-sev-warning/40 bg-sev-warning-tint p-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sev-warning-strong">Preview</p>
            <p className="text-xs text-sev-warning-strong">
              <strong>
                {draft.severity.toUpperCase()} — {draft.appliesTo.map((l) => STATIONS_BY_ID[l].name)[0] ?? 'Location'}:
              </strong>{' '}
              {draft.condition ?? `${draft.parameter.replace('_', ' ')} ≥ ${draft.value} ${draft.unit}`}. {draft.message}
            </p>
          </div>
        </Section>

        <Section title="Recipients & channels">
          <div className="flex flex-wrap gap-1.5">
            {RECIPIENT_GROUPS.map((g) => {
              const on = draft.recipients.includes(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() =>
                    set('recipients', on ? draft.recipients.filter((x) => x !== g.id) : [...draft.recipients, g.id])
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    on ? 'border-primary bg-primary/10 font-medium text-primary-strong' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {CHANNELS.map((c) => {
              const on = draft.channels.includes(c.id);
              return (
                <button
                  key={c.id}
                  disabled={!c.available}
                  title={c.reason}
                  onClick={() => set('channels', on ? draft.channels.filter((x) => x !== c.id) : [...draft.channels, c.id])}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    !c.available && 'cursor-not-allowed opacity-50 line-through',
                    on && c.available
                      ? 'border-primary bg-primary/10 font-medium text-primary-strong'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            SMS is out of scope — web push reaches the recipient without the portal being open (Rev B §10).
          </p>
        </Section>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <span className="text-xs italic text-muted-foreground">Pending MTS confirmation</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setTouched(true);
              if (invalid) {
                toast({
                  variant: 'error',
                  title: 'That rule cannot be saved yet',
                  description: 'Three fields below need attention.',
                });
                return;
              }
              setSaving(true);
              if (isNew) await createRule(draft);
              else await saveRule(rule.id, draft);
              setSaving(false);
              toast({
                variant: 'success',
                title: isNew ? 'Rule created (simulated)' : 'Rule saved (simulated)',
                description: `${draft.name} · ${draft.severity} · ${draft.appliesTo.length} location${draft.appliesTo.length === 1 ? '' : 's'}`,
              });
              onSaved();
              onClose();
            }}
          >
            {saving ? 'Saving…' : isNew ? 'Create rule' : 'Save changes'}
          </Button>
        </div>
      </footer>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Labelled({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
      {error ? <FieldError>{error}</FieldError> : null}
    </label>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-sev-alert-strong">{children}</p>;
}

function windowLabel(w: AlertRule['window']): string {
  return { instant: 'Immediate', '1h-rolling': '1 hour (rolling)', '3h-rolling': '3 hours (rolling)', '3d-rolling': '3 days (rolling)' }[w];
}
