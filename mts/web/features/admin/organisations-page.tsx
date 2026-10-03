'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Lock, Plus } from 'lucide-react';
import type { Organization, OrgRight } from '@/lib/api/types';
import { RIGHT_LABELS, createOrganisation, listOrganisations, setOrgRight } from '@/lib/api/endpoints';
import { LoadingState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { toast } from '@/lib/hooks/use-toast';
import { useActing } from '@/lib/use-data';

/**
 * Organisations — the Super User's screen (client requirement, 3 Oct 2026).
 *
 * The Super User creates organisations and, for each, decides what its own
 * Administrator may add: users, stations, sensors. A new organisation starts
 * with all three off; each is a switch here, and every change is audited with
 * who made it and when.
 */
const RIGHTS: OrgRight[] = ['addUsers', 'addStations', 'addSensors'];

export function OrganisationsPage() {
  const { isSuperUser, revision } = useActing();
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    listOrganisations().then(setOrgs);
  }, []);
  useEffect(load, [load, revision]);

  if (!isSuperUser) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed bg-card p-6 text-sm">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-semibold">Super User only</p>
          <p className="text-muted-foreground">
            Organisations are created and managed by the Super User, who also decides what each organisation&apos;s
            Administrator may add. To see this screen in the prototype, choose <strong>View as → Super User</strong> in the
            demo time control (bottom right).
          </p>
        </div>
      </div>
    );
  }
  if (!orgs) return <LoadingState label="Loading organisations…" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every organisation in the system. A new organisation&apos;s Administrator can add no users, stations or sensors until you
        grant each right here — the Super User can always add them.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New organisation
        </Button>
        <span className="text-xs text-muted-foreground">
          {orgs.length} organisations · {orgs.reduce((n, o) => n + (o.userCount ?? 0), 0)} users ·{' '}
          {orgs.reduce((n, o) => n + (o.stationCount ?? 0), 0)} stations
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {orgs.map((o) => (
          <section key={o.id} className="min-w-0 rounded-lg border bg-card">
            <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
              <div className="flex min-w-0 items-start gap-2">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">
                    {o.name} <span className="tabular font-normal text-muted-foreground">· {o.code}</span>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {o.region} · created {fmtDate(o.createdAt)} by {o.createdBy}
                    {o.added ? ' · this session (simulated)' : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 text-[11px]">
                <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                  {o.userCount} {o.userCount === 1 ? 'user' : 'users'}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                  {o.stationCount} {o.stationCount === 1 ? 'station' : 'stations'}
                </span>
              </div>
            </header>
            <div className="px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                What its Administrator may add
              </p>
              <ul className="divide-y rounded-md border">
                {RIGHTS.map((r) => {
                  const st = o.rights[r];
                  return (
                    <li key={r} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{RIGHT_LABELS[r].label}</p>
                        <p className="text-xs text-muted-foreground">
                          {RIGHT_LABELS[r].detail}
                          {st.at ? ` · ${st.on ? 'granted' : 'withdrawn'} ${fmtDateTime(st.at)}` : ' · off since created'}
                        </p>
                      </div>
                      <label className="flex shrink-0 items-center gap-2 text-xs">
                        <span className={st.on ? 'font-semibold text-sev-normal-strong' : 'text-muted-foreground'}>{st.on ? 'Granted' : 'Off'}</span>
                        <Switch
                          checked={st.on}
                          aria-label={`${RIGHT_LABELS[r].label} for ${o.name}`}
                          onCheckedChange={(v) =>
                            setOrgRight(o.id, r, v).then(() =>
                              toast({
                                variant: 'success',
                                title: `${RIGHT_LABELS[r].label} ${v ? 'granted to' : 'withdrawn from'} ${o.code} (simulated)`,
                                description: 'Recorded in the audit trail.',
                              }),
                            )
                          }
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))}
      </div>

      {creating ? <CreateDialog existing={orgs} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function CreateDialog({ existing, onClose }: { existing: Organization[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [region, setRegion] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const errors = {
    name: name.trim() ? undefined : 'Name the organisation.',
    code: !code.trim()
      ? 'Give it a short code.'
      : existing.some((o) => o.code.toLowerCase() === code.trim().toLowerCase())
        ? 'That code is already used.'
        : undefined,
    adminName: adminName.trim() ? undefined : 'Who is its Administrator?',
    adminEmail: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail) ? undefined : 'Enter their email.',
  };
  const invalid = Object.values(errors).some(Boolean);
  const field = (label: string, value: string, set: (v: string) => void, error?: string, placeholder?: string) => (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <Input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="h-9" />
      {touched && error ? <span className="mt-1 block text-xs text-sev-alert-strong">{error}</span> : null}
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New organisation</DialogTitle>
          <DialogDescription>Its Administrator is invited by email. Adding users, stations and sensors all start off.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{field('Organisation name', name, setName, errors.name, 'Western Rail Operations')}</div>
          {field('Short code', code, (v) => setCode(v.toUpperCase()), errors.code, 'WRO')}
          {field('Region', region, setRegion, undefined, 'Sydney')}
          {field('Administrator name', adminName, setAdminName, errors.adminName)}
          {field('Administrator email', adminEmail, setAdminEmail, errors.adminEmail)}
        </div>
        <ul className="space-y-1 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          {RIGHTS.map((r) => (
            <li key={r} className="flex items-center gap-1.5">
              <Lock className="h-3 w-3" aria-hidden /> {RIGHT_LABELS[r].label} — off until you grant it
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setTouched(true);
              if (invalid) return;
              await createOrganisation({ name: name.trim(), code: code.trim(), region: region.trim() || '—', adminName: adminName.trim(), adminEmail: adminEmail.trim() });
              toast({ variant: 'success', title: `${name.trim()} created (simulated)`, description: `${adminName.trim()} invited as Administrator.` });
              onClose();
            }}
          >
            Create organisation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
