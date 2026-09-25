'use client';

import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, Clock, MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoadingState, ErrorState, EmptyState, TableSkeleton } from '@/components/screen-states';
import { RoleLabel, UserStatusBadge } from './role-badge';
import { AddUserDialog } from './add-user-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';
import { ConfirmDialog, type ConfirmRequest } from '@/components/confirm-dialog';
import { Can } from '@/lib/rbac/guard';
import { useAssignableRoles } from '@/features/roles/use-roles';
import { useUsers, useUpdateUser, useRemoveUser } from './use-users';
import { useCurrentUser } from '@/lib/rbac/context';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { formatRelative } from '@/lib/time';
import type { OrgUser, Role } from '@/lib/api/types';

const columnHelper = createColumnHelper<OrgUser>();

export function UsersTable({ roles }: { roles?: Role[] } = {}) {
  const t = useTranslations('users');
  const { data, isLoading, isError, refetch } = useUsers();
  const update = useUpdateUser();
  const remove = useRemoveUser();
  // Drives the "change role" menu, so a CUSTOM role can be assigned — the menu
  // used to hard-code the three legacy keys, which is why no custom role could
  // ever be held by anyone.
  const { data: assignableRoles } = useAssignableRoles();
  const currentUser = useCurrentUser();
  const apiToast = useApiToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [resetFor, setResetFor] = useState<OrgUser | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  // Optional role narrowing (the Users page shows only admins here "for now";
  // the /org page keeps the unfiltered table).
  // Accounts waiting for approval first — they are the ones needing attention.
  const rows = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((u) => !roles || roles.includes(u.role))
        .sort((a, b) => Number(Boolean(b.pendingApproval)) - Number(Boolean(a.pendingApproval))),
    [data, roles],
  );
  const pendingCount = rows.filter((u) => u.pendingApproval).length;
  const activeAdminCount = useMemo(
    () => rows.filter((u) => u.role === 'admin' && u.isActive).length,
    [rows],
  );

  async function changeRole(user: OrgUser, roleId: string) {
    try {
      await update.mutateAsync({ id: user.id, input: { roleId } });
      apiToast.success(t('roleUpdated'));
    } catch (err) {
      apiToast.error(err);
    }
  }
  function removeUser(user: OrgUser) {
    setConfirm({
      title: t('remove'),
      body: t('removeConfirm', { email: user.email }),
      confirmLabel: t('remove'),
      destructive: true,
      onConfirm: async () => {
        try {
          await remove.mutateAsync(user.id);
          apiToast.success(t('userRemoved'));
        } catch (err) {
          apiToast.error(err);
        }
      },
    });
  }
  async function approve(user: OrgUser) {
    try {
      await update.mutateAsync({ id: user.id, input: { isActive: true } });
      apiToast.success(t('approved', { email: user.email }));
    } catch (err) {
      apiToast.error(err);
    }
  }
  function reject(user: OrgUser) {
    setConfirm({
      title: t('reject'),
      body: t('rejectConfirm', { email: user.email }),
      confirmLabel: t('reject'),
      destructive: true,
      onConfirm: async () => {
        try {
          await remove.mutateAsync(user.id);
          apiToast.success(t('rejected'));
        } catch (err) {
          apiToast.error(err);
        }
      },
    });
  }
  async function setActive(user: OrgUser, isActive: boolean) {
    try {
      await update.mutateAsync({ id: user.id, input: { isActive } });
      apiToast.success(t('statusUpdated'));
    } catch (err) {
      apiToast.error(err);
    }
  }

  function toggleActive(user: OrgUser) {
    // Activating is harmless; deactivating signs them out immediately, which is
    // as consequential as removing them — and sat one click away from it.
    if (user.isActive) {
      setConfirm({
        title: t('deactivate'),
        body: t('deactivateConfirm', { email: user.email }),
        confirmLabel: t('deactivate'),
        destructive: true,
        onConfirm: () => setActive(user, false),
      });
    } else {
      void setActive(user, true);
    }
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor((u) => `${u.firstName} ${u.lastName}`.trim(), {
        id: 'name',
        header: t('colName'),
        cell: (ctx) => <span className="font-medium">{ctx.getValue() || '—'}</span>,
      }),
      columnHelper.accessor('email', { header: t('colEmail') }),
      columnHelper.accessor('role', {
        header: t('colRole'),
        // The role actually held — a custom role by its own name, not its base role's.
        cell: (ctx) => ctx.row.original.roleName ?? <RoleLabel role={ctx.getValue()} />,
      }),
      columnHelper.display({
        id: 'status',
        header: t('colStatus'),
        cell: (ctx) => (
          <div className="space-y-1">
            <UserStatusBadge user={ctx.row.original} />
            {ctx.row.original.mustChangePassword ? (
              <p className="text-xs text-muted-foreground">{t('mustChange')}</p>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor('lastLoginAt', {
        header: t('colLastLogin'),
        cell: (ctx) => (ctx.getValue() ? formatRelative(ctx.getValue()) : t('never')),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (ctx) => {
          const user = ctx.row.original;
          const isSelf = user.id === currentUser?.id;
          const isLastAdmin = user.role === 'admin' && user.isActive && activeAdminCount <= 1;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isSelf}
                    title={isSelf ? t('changeYourOwn') : undefined}
                    aria-label={isSelf ? t('changeYourOwn') : t('changeRole')}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {user.pendingApproval ? (
                    <>
                      <DropdownMenuItem onClick={() => approve(user)}>{t('approve')}</DropdownMenuItem>
                      <DropdownMenuItem className="text-status-error-strong" onClick={() => reject(user)}>
                        {t('reject')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuLabel>{t('changeRole')}</DropdownMenuLabel>
                  {(assignableRoles ?? []).map((r) => (
                    <DropdownMenuItem
                      key={r._id}
                      disabled={user.roleId === r._id || isLastAdmin}
                      onClick={() => changeRole(user, r._id)}
                    >
                      {r.name}
                    </DropdownMenuItem>
                  ))}
                  {user.pendingApproval ? null : (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setResetFor(user)}>{t('resetPassword')}</DropdownMenuItem>
                      <DropdownMenuItem disabled={isLastAdmin} onClick={() => toggleActive(user)}>
                        {user.isActive ? t('deactivate') : t('activate')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={isLastAdmin}
                        className="text-status-error-strong"
                        onClick={() => removeUser(user)}
                      >
                        {t('remove')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, activeAdminCount, currentUser?.id, assignableRoles],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (isLoading) return <TableSkeleton rows={5} cols={5} />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder={t('search')}
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
          aria-label={t('search')}
        />
        <Can permission="user:write">
          <AddUserDialog />
        </Can>
      </div>

      {pendingCount > 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-status-warn px-3 py-2 text-sm" role="status">
          <Clock className="h-4 w-4" aria-hidden /> {t('pendingNotice', { count: pendingCount })}
        </p>
      ) : null}
      <ResetPasswordDialog user={resetFor} onClose={() => setResetFor(null)} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      {rows.length === 0 ? (
        <EmptyState
          title={t('title')}
          body={t('subtitle')}
          action={
            <Can permission="user:write">
              <AddUserDialog />
            </Can>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.column.getCanSort() && header.column.id !== 'actions' ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
