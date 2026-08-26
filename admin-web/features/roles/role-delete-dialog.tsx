'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingState } from '@/components/screen-states';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { useDeleteRole, useRoleUsage } from './use-roles';
import type { RoleRow } from '@/lib/api/types';

/**
 * Delete a role, moving whoever holds it somewhere else.
 *
 * The count is fetched fresh when the dialog opens rather than reused from the
 * roles list: deleting a role is exactly the moment a stale number is worst, and
 * the same request supplies the replacement options.
 */
export function RoleDeleteDialog({
  role,
  open,
  onOpenChange,
}: {
  role?: RoleRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const toast = useApiToast();
  const { data: usage, isLoading } = useRoleUsage(open ? role?._id : undefined);
  const del = useDeleteRole();

  const [replacement, setReplacement] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReplacement('');
      setError(null);
    }
  }, [open, role?._id]);

  const affected = usage?.userCount ?? 0;
  const needsReplacement = affected > 0;

  async function confirm() {
    if (!role) return;
    if (needsReplacement && !replacement) {
      return setError('Choose which role these people should get instead.');
    }
    try {
      const res = await del.mutateAsync({
        id: role._id,
        replacementRoleId: needsReplacement ? replacement : undefined,
      });
      toast.success(
        res.usersMoved > 0
          ? `${role.name} deleted — ${res.usersMoved} ${res.usersMoved === 1 ? 'person' : 'people'} moved`
          : `${role.name} deleted`,
      );
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the role.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete {role?.name}?</DialogTitle>
          <DialogDescription>
            {role?.isSystem
              ? 'This is a shared role used by every organisation. Deleting it affects them all.'
              : 'This cannot be undone from here.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState label="Checking who has this role…" />
        ) : (
          <div className="space-y-4">
            {needsReplacement ? (
              <>
                <div className="flex items-start gap-2 rounded-md border border-status-warn/40 bg-status-warn/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden />
                  <p>
                    <strong>
                      {affected} {affected === 1 ? 'person has' : 'people have'} this role.
                    </strong>{' '}
                    Choose the role they should get instead — they&apos;ll all be moved in one step.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="replacement-role">Move them to</Label>
                  <Select value={replacement} onValueChange={setReplacement}>
                    <SelectTrigger id="replacement-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {(usage?.replacements ?? []).map((r) => (
                        <SelectItem key={r._id} value={r._id}>
                          {r.name}
                          {r.isSystem ? ' (shared)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {usage?.users?.length ? (
                  <p className="text-xs text-muted-foreground">
                    {usage.users
                      .slice(0, 3)
                      .map((u) => `${u.firstName} ${u.lastName}`.trim() || u.email)
                      .join(', ')}
                    {affected > 3 ? ` and ${affected - 3} more` : ''}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nobody has this role, so nothing else changes.</p>
            )}

            {error ? (
              <p role="alert" className="text-sm text-status-error">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={del.isPending || isLoading}>
            {del.isPending
              ? 'Deleting…'
              : needsReplacement
                ? `Move ${affected} and delete`
                : 'Delete role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
