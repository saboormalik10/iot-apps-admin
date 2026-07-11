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
import { ArrowUpDown, MoreHorizontal } from 'lucide-react';
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
import { InviteDialog } from './invite-dialog';
import { useUsers, useUpdateUser } from './use-users';
import { useCurrentUser } from '@/lib/rbac/context';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { formatRelative } from '@/lib/time';
import type { OrgUser, Role } from '@/lib/api/types';

const columnHelper = createColumnHelper<OrgUser>();

export function UsersTable({ roles }: { roles?: Role[] } = {}) {
  const t = useTranslations('users');
  const { data, isLoading, isError, refetch } = useUsers();
  const update = useUpdateUser();
  const currentUser = useCurrentUser();
  const apiToast = useApiToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  // Optional role narrowing (the Users page shows only admins here "for now";
  // the /org page keeps the unfiltered table).
  const rows = useMemo(
    () => (data?.rows ?? []).filter((u) => !roles || roles.includes(u.role)),
    [data, roles],
  );
  const activeAdminCount = useMemo(
    () => rows.filter((u) => u.role === 'admin' && u.isActive).length,
    [rows],
  );

  async function changeRole(user: OrgUser, role: Role) {
    try {
      await update.mutateAsync({ id: user.id, input: { role } });
      apiToast.success(t('roleUpdated'));
    } catch (err) {
      apiToast.error(err);
    }
  }
  async function toggleActive(user: OrgUser) {
    try {
      await update.mutateAsync({ id: user.id, input: { isActive: !user.isActive } });
      apiToast.success(t('statusUpdated'));
    } catch (err) {
      apiToast.error(err);
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
        cell: (ctx) => <RoleLabel role={ctx.getValue()} />,
      }),
      columnHelper.display({
        id: 'status',
        header: t('colStatus'),
        cell: (ctx) => <UserStatusBadge user={ctx.row.original} />,
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
          const locked = isSelf || isLastAdmin;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={locked}
                    aria-label={locked ? (isSelf ? t('cannotEditSelf') : t('cannotRemoveLastAdmin')) : t('changeRole')}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t('changeRole')}</DropdownMenuLabel>
                  {(['viewer', 'operator', 'admin'] as Role[]).map((r) => (
                    <DropdownMenuItem
                      key={r}
                      disabled={user.role === r}
                      onClick={() => changeRole(user, r)}
                    >
                      <RoleLabel role={r} />
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => toggleActive(user)}>
                    {user.isActive ? t('deactivate') : t('activate')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, activeAdminCount, currentUser?.id],
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
          placeholder={t('subtitle')}
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
          aria-label={t('subtitle')}
        />
        <InviteDialog />
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t('title')} body={t('subtitle')} action={<InviteDialog />} />
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
