'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Apple, Smartphone } from 'lucide-react';
import type { PushToken } from '@/lib/api/types';
import { DataTable } from '@/components/data/data-table';
import { formatDate } from '@/lib/time';
import { usePushTokens } from './use-notifications';

/**
 * Admin push-token registry (plan §6). Lists the mobile devices registered to
 * receive push. Delivery is WebSocket-only today (real FCM/APNs is a backend seam,
 * §16) — this view proves the tokens are captured for when push is switched on.
 */
export function PushTokenTable() {
  const { data, isLoading } = usePushTokens();

  const columns = useMemo<ColumnDef<PushToken, unknown>[]>(
    () => [
      {
        header: 'Platform',
        cell: ({ row }) => (
          <span className="flex items-center gap-2 capitalize">
            {row.original.platform === 'ios' ? <Apple className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
            {row.original.platform}
          </span>
        ),
      },
      { header: 'Device', cell: ({ row }) => row.original.deviceModel || '—' },
      { header: 'App', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.appId}</span> },
      { header: 'Expires', cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.expiresAt)}</span> },
    ],
    [],
  );

  return (
    <DataTable
      data={data ?? []}
      columns={columns}
      isLoading={isLoading}
      getRowId={(r) => r._id}
      emptyLabel="No mobile devices have registered for push yet."
    />
  );
}
