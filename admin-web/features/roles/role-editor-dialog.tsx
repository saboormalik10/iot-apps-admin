'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { useCreateRole, usePermissionGroups, useUpdateRole } from './use-roles';
import type { Role, RoleRow } from '@/lib/api/types';

/**
 * Create or re-permission a role.
 *
 * The permission list is fetched from the server, never hard-coded here: the
 * backend defines the catalogue in code so a permission nothing enforces cannot
 * exist, and duplicating it client-side would reintroduce exactly that risk.
 */
export function RoleEditorDialog({
  role,
  open,
  onOpenChange,
}: {
  role?: RoleRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const isEdit = Boolean(role);
  const toast = useApiToast();
  const { data: groups = [] } = usePermissionGroups();

  const create = useCreateRole();
  const update = useUpdateRole(role?._id ?? '');
  const pending = create.isPending || update.isPending;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [baseRole, setBaseRole] = useState<Role>('viewer');
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever the dialog opens, so editing one role then another does not
  // carry the first one's grants across.
  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setSelected(role?.permissions ?? []);
    setBaseRole(role?.baseRole ?? 'viewer');
    setError(null);
  }, [open, role]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.permissions.length, 0), [groups]);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const toggleGroup = (keys: string[], on: boolean) =>
    setSelected((prev) => (on ? [...new Set([...prev, ...keys])] : prev.filter((k) => !keys.includes(k))));

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Give the role a name.');
    // Mirrors the server rule — a role granting nothing is not a role.
    if (selected.length === 0) return setError('A role must grant at least one permission.');

    try {
      const input = { name: trimmed, description, permissions: selected, ...(role?.isSystem ? {} : { baseRole }) };
      if (isEdit) await update.mutateAsync(input);
      else await create.mutateAsync(input);
      toast.success(isEdit ? 'Role updated' : 'Role created');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the role.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${role?.name}` : 'New role'}</DialogTitle>
          <DialogDescription>
            {role?.isSystem
              ? 'This is a shared role — every organisation uses it, so a change here affects them all. Its internal key cannot change.'
              : 'Choose what people with this role are allowed to do.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="role-name">Name</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Site Supervisor" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="role-desc">Description</Label>
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is for"
            />
          </div>

          {role?.isSystem ? null : (
            <div className="grid gap-2">
              <Label htmlFor="role-base">Legacy role</Label>
              <Select value={baseRole} onValueChange={(v) => setBaseRole(v as Role)}>
                <SelectTrigger id="role-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Some older checks still read a single role key rather than the permissions above. Holders of
                this role are treated as this one by those checks — pick the lowest that still works.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label>Permissions</Label>
              <span className="text-xs text-muted-foreground">
                {selected.length} of {total} selected
              </span>
            </div>

            {groups.map((g) => {
              const keys = g.permissions.map((p) => p.key);
              const allOn = keys.every((k) => selected.includes(k));
              return (
                <fieldset key={g.group} className="rounded-md border p-3">
                  <legend className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {g.group}
                    <button
                      type="button"
                      className="text-[11px] font-normal normal-case text-primary underline-offset-2 hover:underline"
                      onClick={() => toggleGroup(keys, !allOn)}
                    >
                      {allOn ? 'clear' : 'select all'}
                    </button>
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {g.permissions.map((p) => (
                      <label key={p.key} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={selected.includes(p.key)}
                          onCheckedChange={() => toggle(p.key)}
                          aria-label={p.label}
                        />
                        <span>
                          {p.label}
                          {/* The machine key is shown quietly: an admin debugging a
                              403 needs to match it against the error message. */}
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground">{p.key}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-status-error">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
