'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import type { Role } from '@/lib/api/types';
import { createRole, listRoles } from '@/lib/api/endpoints';
import { LoadingState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/hooks/use-toast';
import { SUPER_USER_ROLE } from '@/lib/mock/seed/people';

/**
 * The permission matrix.
 *
 * Cheap to build and one of the most persuasive screens in the product: it answers
 * "who, exactly, can start a pump?" at a glance, which is the question a rail
 * operator asks first about a system that can start pumps.
 */
const PERMISSIONS = [
  'View all dashboards and history',
  'Acknowledge alerts',
  'Export data',
  'Supervised pump control',
  'Maintenance mode',
  'Calibration and fault flags',
  'Manage users and roles',
  'Configure thresholds and alert wording',
  'Manage alert recipients',
  'View audit trail',
];

export function RolesPage() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    listRoles().then(setRoles);
  }, []);
  useEffect(load, [load]);

  if (!roles) return <LoadingState label="Loading roles…" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Six standard roles, each a bundle of permissions on a least-privilege basis. A user may hold more than one,
          and additional roles can be created to match the MTS operating model.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New role
        </Button>
      </div>

      {/* Client requirement (3 Oct): one role above every organisation. */}
      <div className="rounded-lg border-l-4 border-l-header bg-card p-3 ring-1 ring-border">
        <p className="text-sm font-semibold">Above these: the Super User</p>
        <p className="text-xs text-muted-foreground">
          {SUPER_USER_ROLE.summary} It belongs to no organisation and cannot be given by an organisation&apos;s Administrator.
        </p>
      </div>

      <section className="rounded-lg border bg-card">
        <div className="scroll-x-hint overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="bg-header text-header-foreground">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium">Permission</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-3 py-2 text-center text-xs font-medium">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">{p}</td>
                  {roles.map((r) => {
                    const has = r.permissions.includes(p);
                    return (
                      <td key={r.id} className="px-3 py-2 text-center">
                        {has ? (
                          <Check className="mx-auto h-4 w-4 text-sev-normal" aria-label="Allowed" />
                        ) : (
                          <span className="text-muted-foreground" aria-label="Not allowed">
                            –
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <article key={r.id} className="rounded-lg border bg-card p-3">
            <h3 className="text-sm font-semibold">{r.name}</h3>
            <p className="text-xs text-muted-foreground">{r.typicalUser}</p>
            <p className="mt-2 text-xs">{r.summary}</p>
          </article>
        ))}
      </div>

      <NewRoleDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          load();
        }}
      />
    </div>
  );
}

/** §8.4: additional roles can be created. This is what that looks like. */
function NewRoleDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [typicalUser, setTypicalUser] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['View all dashboards and history']);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setTypicalUser('');
    setPermissions(['View all dashboards and history']);
    setTouched(false);
  }, [open]);

  const nameError = name.trim() ? undefined : 'Give the role a name.';
  const permError = permissions.length ? undefined : 'A role with no permissions cannot be assigned.';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>
            A role is a bundle of permissions. It appears as a column in the matrix and can then be assigned to
            people on the Users screen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Role name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Duty Manager" className="h-9" />
            {touched && nameError ? <p className="mt-1 text-xs text-sev-alert-strong">{nameError}</p> : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Typical user</span>
            <Input
              value={typicalUser}
              onChange={(e) => setTypicalUser(e.target.value)}
              placeholder="Shift management"
              className="h-9"
            />
          </label>
          <fieldset>
            <legend className="mb-1.5 text-xs text-muted-foreground">Permissions</legend>
            <ul className="space-y-1">
              {PERMISSIONS.map((p) => {
                const on = permissions.includes(p);
                return (
                  <li key={p}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setPermissions(on ? permissions.filter((x) => x !== p) : [...permissions, p])}
                        className="h-4 w-4"
                      />
                      {p}
                    </label>
                  </li>
                );
              })}
            </ul>
            {touched && permError ? <p className="mt-1 text-xs text-sev-alert-strong">{permError}</p> : null}
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setTouched(true);
              if (nameError || permError) return;
              setBusy(true);
              await createRole({
                name: name.trim(),
                typicalUser: typicalUser.trim() || 'To be defined by MTS',
                summary: `Custom role — ${permissions.length} permission${permissions.length === 1 ? '' : 's'}.`,
                permissions,
              });
              setBusy(false);
              toast({
                variant: 'success',
                title: 'Role created (simulated)',
                description: `${name.trim()} is now a column in the matrix.`,
              });
              onCreated();
            }}
          >
            {busy ? 'Creating…' : 'Create role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
