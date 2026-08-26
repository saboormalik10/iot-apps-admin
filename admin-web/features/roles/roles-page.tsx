'use client';

import { useState } from 'react';
import { Plus, Pencil, Shield, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/charts/status-badge';
import { Can } from '@/lib/rbac/guard';
import { EmptyState, LoadingState } from '@/components/screen-states';
import { RoleEditorDialog } from './role-editor-dialog';
import { RoleDeleteDialog } from './role-delete-dialog';
import { useRoles } from './use-roles';
import type { RoleRow } from '@/lib/api/types';

/**
 * Roles and what each may do.
 *
 * A shared (system) role is used by every organisation, so it is marked as such —
 * an admin editing one needs to know the blast radius before they change it.
 */
export function RolesPage() {
  const { data: roles, isLoading } = useRoles();
  const [editing, setEditing] = useState<RoleRow | undefined>();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<RoleRow | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const openFor = (role?: RoleRow) => {
    setEditing(role);
    setOpen(true);
  };

  const confirmDelete = (role: RoleRow) => {
    setDeleting(role);
    setDeleteOpen(true);
  };

  if (isLoading) return <LoadingState label="Loading roles…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Roles</h1>
          <p className="text-sm text-muted-foreground">What each group of people is allowed to do.</p>
        </div>
        <Can permission="role:write">
          <Button size="sm" className="gap-1" onClick={() => openFor(undefined)}>
            <Plus className="h-4 w-4" />
            New role
          </Button>
        </Can>
      </div>

      {!roles?.length ? (
        <EmptyState title="No roles" body="Create a role to define what people can do." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <Card key={role._id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h2 className="font-medium leading-tight">{role.name}</h2>
                    {role.isSystem ? <StatusBadge tone="info" label="Shared" /> : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{role.description || '—'}</p>
                </div>
                {/* Read-only for anyone without `role:write` — the server would
                    refuse the save, so offering the button would only mislead. */}
                <div className="flex shrink-0 items-center">
                  <Can permission="role:write">
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => openFor(role)}>
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only sm:not-sr-only">Edit</span>
                    </Button>
                  </Can>
                  {/* `role:delete` is platform-level — an organisation admin can
                      edit roles but must not remove one every customer shares. */}
                  <Can permission="role:delete">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-status-error"
                      onClick={() => confirmDelete(role)}
                      aria-label={`Delete ${role.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </Can>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" />
                  {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
                </span>
                <span>
                  {role.userCount} {role.userCount === 1 ? 'person' : 'people'}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <RoleEditorDialog role={editing} open={open} onOpenChange={setOpen} />
      <RoleDeleteDialog role={deleting} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
