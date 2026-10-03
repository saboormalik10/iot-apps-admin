'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Trash2, UserPlus } from 'lucide-react';
import type { ChannelId, NotifyPrefs, Organization, RoleId, Severity, User } from '@/lib/api/types';
import {
  DEMO_USER,
  createUser,
  listOrganisations,
  listUsers,
  removeUser,
  setUserStatus,
  updateUser,
} from '@/lib/api/endpoints';
import { LoadingState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDemoClock } from '@/lib/demo-clock';
import { fmtRelative } from '@/lib/format';
import { ROLES, ROLES_BY_ID } from '@/lib/mock/seed/people';
import { STATIONS_BY_ID } from '@/lib/mock/seed/stations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/hooks/use-toast';
import { STATIONS } from '@/lib/mock/seed/stations';
import { cn } from '@/lib/utils';
import { useActing } from '@/lib/use-data';
import { RightNotice } from '@/components/admin/right-notice';

/**
 * User management.
 *
 * Two things here are not the way our existing platform works, and both are
 * requirements: a person may hold **more than one role** (the chips stack), and
 * access is **scoped to stations**, not to an organisation. Suspending keeps the
 * account and its audit history and only blocks sign-in — somebody leaving must
 * never erase the record of what they did.
 */

const ROLE_STYLE: Record<RoleId, string> = {
  'super-user': 'bg-header text-header-foreground ring-header/40',
  administrator: 'bg-primary/10 text-primary-strong ring-primary/25',
  operator: 'bg-sev-normal-tint text-sev-normal-strong ring-sev-normal/25',
  'pump-controller': 'bg-sev-alert-tint text-sev-alert-strong ring-sev-alert/25',
  maintainer: 'bg-sev-warning-tint text-sev-warning-strong ring-sev-warning/25',
  analyst: 'bg-sev-info-tint text-sev-info-strong ring-sev-info/25',
  viewer: 'bg-muted text-muted-foreground ring-border',
};

export function UsersPage() {
  const now = useDemoClock();
  const [users, setUsers] = useState<User[] | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<RoleId | 'all'>('all');
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [confirming, setConfirming] = useState<{ user: User; action: 'suspend' | 'reinstate' | 'remove' } | null>(null);
  const { isSuperUser, can, revision } = useActing();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgFilter, setOrgFilter] = useState('all');

  /* An organisation's Administrator sees their own people; the Super User sees everyone. */
  const load = useCallback(() => {
    listUsers(isSuperUser ? 'all' : 'mts').then(setUsers);
    listOrganisations().then(setOrgs);
  }, [isSuperUser]);
  useEffect(load, [load, revision]);
  const orgName = (id?: string) => orgs.find((o) => o.id === (id ?? 'mts'))?.name ?? 'Platform';

  if (!users) return <LoadingState label="Loading users…" />;

  const filtered = users.filter((u) => {
    const matchesQ =
      !q ||
      u.name.toLowerCase().includes(q.toLowerCase()) ||
      u.email.toLowerCase().includes(q.toLowerCase()) ||
      u.roles.some((r) => ROLES_BY_ID[r].name.toLowerCase().includes(q.toLowerCase()));
    return matchesQ && (role === 'all' || u.roles.includes(role)) && (orgFilter === 'all' || (u.orgId ?? 'mts') === orgFilter);
  });

  const active = users.filter((u) => u.status === 'active').length;
  const suspended = users.filter((u) => u.status === 'suspended').length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Add, edit, suspend or remove users and assign their roles and station access. Administrator only.
      </p>
      <p className="rounded-md border border-sev-info/40 bg-sev-info-tint px-3 py-2 text-xs text-sev-info-strong">
        Forgotten passwords are self-service: people reset their own from the sign-in screen with an emailed link that
        works once for 30 minutes. Administrators never see or set a password — resets appear in the audit trail.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or role"
            className="h-9 w-64 pl-8"
            aria-label="Search users"
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as RoleId | 'all')}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Filter by role"
        >
          <option value="all">Role: All</option>
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <span className="tabular text-xs text-muted-foreground">
          {users.length} users · {active} active · {suspended} suspended
        </span>
        {isSuperUser ? (
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label="Organisation" className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="all">All organisations</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : null}
        {can('addUsers') ? (
          <Button size="sm" className="ml-auto" onClick={() => setEditing('new')}>
            <UserPlus className="h-4 w-4" /> Add user
          </Button>
        ) : null}
      </div>
      {!can('addUsers') ? <RightNotice right="addUsers" /> : null}

      <section className="min-w-0 rounded-lg border bg-card">
        {/* On a phone each person is a card, with status and actions visible —
            the table hid both behind a sideways scroll. */}
        <ul className="divide-y md:hidden">
          {filtered.map((u) => (
            <li key={u.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{u.initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-tight">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  {u.mobile ? <p className="tabular text-[11px] text-muted-foreground">{u.mobile}</p> : null}
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                    u.status === 'active' && 'bg-sev-normal-tint text-sev-normal-strong ring-sev-normal/25',
                    u.status === 'suspended' && 'bg-sev-warning-tint text-sev-warning-strong ring-sev-warning/25',
                    u.status === 'invited' && 'bg-sev-info-tint text-sev-info-strong ring-sev-info/25',
                  )}
                >
                  {u.status[0].toUpperCase() + u.status.slice(1)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {u.roles.map((r) => (
                  <span key={r} className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', ROLE_STYLE[r])}>
                    {ROLES_BY_ID[r].name}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {isSuperUser ? `${orgName(u.orgId)} · ` : ''}
                {u.stationAccess === 'all' ? 'All stations' : u.stationAccess.map((x) => STATIONS_BY_ID[x].name).join(', ')} ·{' '}
                {u.lastLogin ? `last login ${fmtRelative(u.lastLogin, now)}` : 'never signed in'}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={u.id === DEMO_USER.id}
                  onClick={() => setConfirming({ user: u, action: u.status === 'suspended' ? 'reinstate' : 'suspend' })}
                >
                  {u.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                </Button>
                <Button size="sm" variant="outline" disabled={u.id === DEMO_USER.id} onClick={() => setConfirming({ user: u, action: 'remove' })}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="scroll-x-hint hidden overflow-x-auto md:block">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-header text-header-foreground">
              <tr>
                {['User', ...(isSuperUser ? ['Organisation'] : []), 'Role(s)', 'Station access', 'Status', 'Last login', 'Actions'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {u.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        {u.mobile ? <p className="tabular truncate text-[11px] text-muted-foreground">{u.mobile}</p> : null}
                      </div>
                    </div>
                  </td>
                  {isSuperUser ? <td className="whitespace-nowrap px-3 py-2 text-xs">{orgName(u.orgId)}</td> : null}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span
                          key={r}
                          className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', ROLE_STYLE[r])}
                        >
                          {ROLES_BY_ID[r].name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {u.stationAccess === 'all'
                      ? 'All stations'
                      : u.stationAccess.map((s) => STATIONS_BY_ID[s].name).join(', ')}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                        u.status === 'active' && 'bg-sev-normal-tint text-sev-normal-strong ring-sev-normal/25',
                        u.status === 'suspended' && 'bg-sev-warning-tint text-sev-warning-strong ring-sev-warning/25',
                        u.status === 'invited' && 'bg-sev-info-tint text-sev-info-strong ring-sev-info/25',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          u.status === 'active' && 'bg-sev-normal',
                          u.status === 'suspended' && 'bg-sev-warning',
                          u.status === 'invited' && 'bg-sev-info',
                        )}
                      />
                      {u.status[0].toUpperCase() + u.status.slice(1)}
                    </span>
                  </td>
                  <td className="tabular px-3 py-2 text-muted-foreground">
                    {u.lastLogin ? fmtRelative(u.lastLogin, now) : '–'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <button className="text-primary hover:underline" onClick={() => setEditing(u)}>
                        Edit
                      </button>
                      {/* You cannot suspend or delete yourself: locking the last
                          administrator out of the portal during an event is not a
                          mistake the UI should let anyone make. */}
                      <button
                        className="text-muted-foreground hover:text-sev-alert disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={u.id === DEMO_USER.id}
                        title={u.id === DEMO_USER.id ? 'You cannot suspend your own account' : undefined}
                        onClick={() =>
                          setConfirming({ user: u, action: u.status === 'suspended' ? 'reinstate' : 'suspend' })
                        }
                      >
                        {u.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                      </button>
                      <button
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-sev-alert disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={u.id === DEMO_USER.id}
                        title={u.id === DEMO_USER.id ? 'You cannot remove your own account' : undefined}
                        onClick={() => setConfirming({ user: u, action: 'remove' })}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="border-t p-4">
          <p className="mb-2 text-xs font-medium">
            Roles — least privilege; a user may hold more than one, and access can be scoped to selected stations
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {ROLES.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-xs">
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 font-medium ring-1 ring-inset', ROLE_STYLE[r.id])}>
                  {r.name}
                </span>
                <span className="text-muted-foreground">{r.summary}</span>
              </li>
            ))}
          </ul>
        </footer>
      </section>

      <UserDialog
        orgs={isSuperUser ? orgs : []}
        subject={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <ConfirmDialog
        subject={confirming}
        onClose={() => setConfirming(null)}
        onDone={() => {
          setConfirming(null);
          load();
        }}
      />
    </div>
  );
}

/** Add and edit are the same form; only the verbs and the defaults differ. */
function UserDialog({
  orgs,
  subject,
  onClose,
  onSaved,
}: {
  /** Only for the Super User, who chooses which organisation the person joins. */
  orgs: Organization[];
  subject: User | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = subject === 'new';
  const existing = subject === 'new' ? null : subject;
  const [name, setName] = useState('');
  const [orgId, setOrgId] = useState('mts');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<RoleId[]>([]);
  const [allStations, setAllStations] = useState(true);
  const [stations, setStations] = useState<string[]>([]);
  const [mobile, setMobile] = useState('');
  const [channels, setChannels] = useState<ChannelId[]>(['screen', 'push', 'email']);
  const [severities, setSeverities] = useState<Severity[]>(['alert', 'warning']);
  const [quiet, setQuiet] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subject) return;
    setTouched(false);
    setName(existing?.name ?? '');
    setEmail(existing?.email ?? '');
    setRoles(existing?.roles ?? ['viewer']);
    setAllStations(existing ? existing.stationAccess === 'all' : true);
    setStations(existing && existing.stationAccess !== 'all' ? [...existing.stationAccess] : []);
    setMobile(existing?.mobile ?? '');
    setChannels(existing?.notify?.channels ?? ['screen', 'push', 'email']);
    setSeverities(existing?.notify?.severities ?? ['alert', 'warning']);
    setQuiet(Boolean(existing?.notify?.quietHours));
  }, [subject, existing]);

  const errors = {
    name: name.trim() ? undefined : 'Enter the person\u2019s name.',
    email: /.+@.+\..+/.test(email) ? undefined : 'Enter a valid email address.',
    roles: roles.length ? undefined : 'Give them at least one role.',
    stations: allStations || stations.length ? undefined : 'Choose the stations they may see.',
    // Optional, but if given it has to be an Australian mobile.
    mobile: !mobile.trim() || /^04\d{2}\s?\d{3}\s?\d{3}$/.test(mobile.trim()) ? undefined : 'Use the 04xx xxx xxx format.',
  };
  const invalid = Object.values(errors).some(Boolean);

  return (
    <Dialog open={subject !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add a user' : `Edit ${existing?.name}`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? 'They receive an invitation by email and set their own password. The account stays Invited until they do.'
              : 'Roles and station access take effect the next time they sign in.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isNew && orgs.length ? (
            <Field label="Organisation">
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Full name" error={touched ? errors.name : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </Field>
          <Field label="Email" error={touched ? errors.email : undefined}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
          </Field>
          <Field label="Mobile (§8.4 — used for SMS if MTS keeps that channel)" error={touched ? errors.mobile : undefined}>
            <Input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="04xx xxx xxx" className="h-9" />
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-xs text-muted-foreground">
              Roles — a person may hold more than one
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((r) => {
                const on = roles.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setRoles(on ? roles.filter((x) => x !== r.id) : [...roles, r.id])}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                      on ? ROLE_STYLE[r.id] : 'text-muted-foreground ring-border hover:bg-muted',
                    )}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
            {touched && errors.roles ? <FieldError>{errors.roles}</FieldError> : null}
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs text-muted-foreground">Station access</legend>
            <div className="mb-2 flex gap-1.5">
              <button
                type="button"
                aria-pressed={allStations}
                onClick={() => setAllStations(true)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                  allStations ? 'bg-primary/10 text-primary-strong ring-primary/25' : 'text-muted-foreground ring-border',
                )}
              >
                All stations
              </button>
              <button
                type="button"
                aria-pressed={!allStations}
                onClick={() => setAllStations(false)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                  !allStations ? 'bg-primary/10 text-primary-strong ring-primary/25' : 'text-muted-foreground ring-border',
                )}
              >
                Selected stations
              </button>
            </div>
            {!allStations ? (
              <div className="flex flex-wrap gap-1.5">
                {STATIONS.map((st) => {
                  const on = stations.includes(st.id);
                  return (
                    <button
                      key={st.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setStations(on ? stations.filter((x) => x !== st.id) : [...stations, st.id])}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-colors',
                        on ? 'bg-primary/10 font-medium text-primary-strong ring-primary/25' : 'text-muted-foreground ring-border hover:bg-muted',
                      )}
                    >
                      {st.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {touched && errors.stations ? <FieldError>{errors.stations}</FieldError> : null}
          </fieldset>

          {/* §8.4: "notification preferences can be changed at any time". Alerts
              themselves cannot be switched off — an operator who opted out of
              the block-line alert is the failure this system exists to prevent. */}
          <fieldset>
            <legend className="mb-1.5 text-xs text-muted-foreground">Notification preferences</legend>
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Channels</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {(
                  [
                    ['screen', 'On screen', true],
                    ['push', 'Web push', false],
                    ['email', 'Email', false],
                    ['sms', 'SMS', false],
                  ] as const
                ).map(([id, label, locked]) => {
                  const sms = id === 'sms';
                  return (
                    <label key={id} className={cn('flex items-center gap-2', sms && 'text-muted-foreground')}>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        aria-label={`Notify by ${label.toLowerCase()}`}
                        checked={channels.includes(id)}
                        disabled={locked || sms}
                        onChange={() => setChannels(channels.includes(id) ? channels.filter((c) => c !== id) : [...channels, id])}
                      />
                      {label}
                      {sms ? <span className="text-[11px]">(not in scope — Rev B)</span> : locked ? <span className="text-[11px] text-muted-foreground">(always)</span> : null}
                    </label>
                  );
                })}
              </div>
              <p className="pt-1 text-xs font-medium text-muted-foreground">Which events</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {(
                  [
                    ['alert', 'Alerts', true],
                    ['warning', 'Warnings', false],
                    ['information', 'Information', false],
                  ] as const
                ).map(([id, label, locked]) => (
                  <label key={id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={locked || severities.includes(id)}
                      disabled={locked}
                      onChange={() => setSeverities(severities.includes(id) ? severities.filter((x) => x !== id) : [...severities, id])}
                    />
                    {label}
                    {locked ? <span className="text-[11px] text-muted-foreground">(always)</span> : null}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 pt-1">
                <input type="checkbox" className="h-4 w-4" checked={quiet} onChange={() => setQuiet(!quiet)} />
                Quiet hours 22:00–06:00 for information only
              </label>
            </div>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setTouched(true);
              if (invalid) return;
              setSaving(true);
              const access = allStations ? ('all' as const) : (stations as User['stationAccess']);
              const notify: NotifyPrefs = {
                channels: Array.from(new Set<ChannelId>(['screen', ...channels])),
                severities: Array.from(new Set<Severity>(['alert', ...severities])),
                quietHours: quiet ? { from: '22:00', to: '06:00' } : undefined,
              };
              if (isNew) {
                await createUser({
                  name: name.trim(),
                  email: email.trim(),
                  initials: initialsOf(name),
                  roles,
                  stationAccess: access,
                  status: 'invited',
                  orgId,
                  mobile: mobile.trim() || undefined,
                  notify,
                });
              } else if (existing) {
                await updateUser(existing.id, {
                  name: name.trim(),
                  email: email.trim(),
                  roles,
                  stationAccess: access,
                  mobile: mobile.trim() || undefined,
                  notify,
                });
              }
              setSaving(false);
              toast({
                variant: 'success',
                title: isNew ? 'Invitation sent (simulated)' : 'User updated (simulated)',
                description: isNew ? `${name.trim()} will appear as Invited until they set a password.` : name.trim(),
              });
              onSaved();
            }}
          >
            {saving ? 'Saving…' : isNew ? 'Send invitation' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Suspending and removing both need a confirmation, and they need to say what
 * survives: the audit trail does. Somebody leaving must never erase the record of
 * what they did.
 */
function ConfirmDialog({
  subject,
  onClose,
  onDone,
}: {
  subject: { user: User; action: 'suspend' | 'reinstate' | 'remove' } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const action = subject?.action;
  const copy = {
    suspend: {
      title: 'Suspend this account?',
      body: 'They will not be able to sign in. The account, its roles and everything it has done stay on record.',
      verb: 'Suspend',
    },
    reinstate: {
      title: 'Reinstate this account?',
      body: 'They will be able to sign in again with the roles they had.',
      verb: 'Reinstate',
    },
    remove: {
      title: 'Remove this account?',
      body: 'The account is withdrawn from the directory. Its audit history is kept — acknowledgements and pump commands stay attributed to them.',
      verb: 'Remove',
    },
  }[action ?? 'suspend'];

  return (
    <Dialog open={subject !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        {subject ? (
          <dl className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Person</dt>
              <dd className="font-medium">{subject.user.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Roles</dt>
              <dd>{subject.user.roles.map((r) => ROLES_BY_ID[r].name).join(', ')}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Authorised by</dt>
              <dd>{DEMO_USER.name}</dd>
            </div>
          </dl>
        ) : null}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={action === 'remove' ? 'destructive' : 'default'}
            disabled={busy}
            onClick={async () => {
              if (!subject) return;
              setBusy(true);
              if (action === 'remove') await removeUser(subject.user.id);
              else await setUserStatus(subject.user.id, action === 'suspend' ? 'suspended' : 'active');
              setBusy(false);
              toast({
                variant: action === 'remove' ? 'warn' : 'success',
                title: `${subject.user.name} ${action === 'remove' ? 'removed' : action === 'suspend' ? 'suspended' : 'reinstated'} (simulated)`,
                description: 'Recorded in the audit trail.',
              });
              onDone();
            }}
          >
            {busy ? 'Working…' : copy.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
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

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
