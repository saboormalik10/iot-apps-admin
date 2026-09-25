'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listRoles, listPermissionGroups, getRoleUsage, createRole, updateRole, deleteRole } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useRbac } from '@/lib/rbac/context';
import { useMemo } from 'react';
import type { RoleInput } from '@/lib/api/types';

export function useRoles() {
  return useQuery({ queryKey: queryKeys.roles, queryFn: ({ signal }) => listRoles(signal) });
}

/**
 * The roles the current user may actually GRANT, least-privileged first.
 *
 * The server refuses to let anyone grant a permission they do not hold themselves
 * — otherwise assigning a role is a way to manufacture authority you were denied.
 * Mirroring that rule here keeps the menu honest: offering a role that is
 * guaranteed to come back 403 reads as a broken screen, not as a policy.
 *
 * The server remains the decision; this only decides what to show.
 */
export function useAssignableRoles() {
  const { has, isSuperAdmin } = useRbac();
  const query = useRoles();
  const roles = useMemo(() => {
    const all = query.data ?? [];
    const grantable = isSuperAdmin ? all : all.filter((r) => r.permissions.every((p) => has(p)));
    return [...grantable].sort((a, b) => a.permissions.length - b.permissions.length);
  }, [query.data, has, isSuperAdmin]);
  return { ...query, data: roles };
}

/**
 * The permission catalogue comes from the SERVER, never a hard-coded client list.
 * The backend defines it in code precisely so a permission nothing enforces
 * cannot exist; duplicating it here would reintroduce exactly that risk.
 */
export function usePermissionGroups() {
  return useQuery({
    queryKey: queryKeys.permissionGroups,
    queryFn: ({ signal }) => listPermissionGroups(signal),
    staleTime: 5 * 60_000, // the catalogue only changes on deploy
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RoleInput) => createRole(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.roles }),
  });
}

export function useUpdateRole(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<RoleInput>) => updateRole(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.roles }),
  });
}

/**
 * Delete preflight: how many people hold this role, and what they could move to.
 *
 * One request powers the whole confirmation dialog — the count and the dropdown —
 * and it is fetched only when the dialog opens, so listing roles stays cheap.
 */
export function useRoleUsage(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.roleUsage(id ?? ''),
    queryFn: ({ signal }) => getRoleUsage(id as string, signal),
    enabled: Boolean(id),
    staleTime: 0, // a stale count here is the difference between a safe delete and a surprise
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, replacementRoleId }: { id: string; replacementRoleId?: string }) =>
      deleteRole(id, replacementRoleId),
    onSuccess: () => {
      // Users may have been reassigned, so their list is stale too.
      qc.invalidateQueries({ queryKey: queryKeys.roles });
      qc.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}
