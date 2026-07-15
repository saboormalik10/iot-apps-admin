'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Copy, ExternalLink, Trash2, Waves, FileText } from 'lucide-react';
import type { ShareTokenRow } from '@/lib/api/types';
import { DataTable } from '@/components/data/data-table';
import { StatusBadge, type StatusTone } from '@/components/charts/status-badge';
import { ConfirmDialog } from '@/components/data/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Can } from '@/lib/rbac/guard';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { formatRelative, formatDate } from '@/lib/time';
import { publicShareUrl } from './share-url';
import { useRevokeShare } from './use-share';

function shareStatus(row: ShareTokenRow): { tone: StatusTone; label: string } {
  if (row.revokedAt) return { tone: 'error', label: 'Revoked' };
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return { tone: 'offline', label: 'Expired' };
  return { tone: 'ok', label: 'Active' };
}

function resourceHref(row: ShareTokenRow): string {
  return row.resourceType === 'nepSession' ? `/sessions/${row.resourceId}` : `/records/${row.resourceId}`;
}

export function ShareTable({
  rows,
  page,
  pageCount,
  total,
  onPageChange,
  isLoading,
}: {
  rows: ShareTokenRow[];
  page?: number;
  pageCount?: number;
  total?: number;
  onPageChange?: (p: number) => void;
  isLoading?: boolean;
}) {
  const revoke = useRevokeShare();
  const toast = useApiToast();
  const [revokeRow, setRevokeRow] = useState<ShareTokenRow | null>(null);

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(publicShareUrl(token));
      toast.info('Link copied');
    } catch {
      toast.error(new Error('Could not copy to clipboard'));
    }
  };

  const columns = useMemo<ColumnDef<ShareTokenRow, unknown>[]>(
    () => [
      {
        header: 'Resource',
        cell: ({ row }) => {
          const r = row.original;
          const active = !r.revokedAt;
          const inner = (
            <span className="flex items-center gap-2">
              {r.resourceType === 'nepSession' ? <Waves className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              <span className="font-medium">{r.resourceType === 'nepSession' ? 'NEP session' : 'MET record'}</span>
              <span className="font-mono text-xs text-muted-foreground">{r.resourceId.slice(-8)}</span>
            </span>
          );
          return active ? (
            <Link href={resourceHref(r)} className="hover:underline">{inner}</Link>
          ) : (
            inner
          );
        },
      },
      {
        header: 'Status',
        cell: ({ row }) => {
          const s = shareStatus(row.original);
          return <StatusBadge tone={s.tone} label={s.label} />;
        },
      },
      { header: 'Views', cell: ({ row }) => <span className="tabular-nums">{row.original.viewCount}</span> },
      { header: 'Created', cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatRelative(row.original.createdAt)}</span> },
      {
        header: 'Expires',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.expiresAt ? formatDate(row.original.expiresAt) : 'never'}
          </span>
        ),
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => {
          const revoked = Boolean(row.original.revokedAt);
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy link"
                disabled={revoked}
                onClick={() => copyLink(row.original.token)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" asChild aria-label="Open link" disabled={revoked}>
                <a href={publicShareUrl(row.original.token)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Can capability="importData">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Revoke link"
                  disabled={revoked}
                  onClick={() => setRevokeRow(row.original)}
                >
                  <Trash2 className="h-4 w-4 text-status-error" />
                </Button>
              </Can>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        page={page}
        pageCount={pageCount}
        total={total}
        onPageChange={onPageChange}
        isLoading={isLoading}
        getRowId={(r) => r._id}
        emptyLabel="No share links yet. Open a session or record and click Share to create one."
      />

      <ConfirmDialog
        open={Boolean(revokeRow)}
        onOpenChange={(o) => !o && setRevokeRow(null)}
        title="Revoke share link?"
        description="The public link stops working immediately. This can't be undone (create a new link if needed)."
        confirmLabel="Revoke"
        destructive
        onConfirm={async () => {
          if (!revokeRow) return;
          try {
            await revoke.mutateAsync(revokeRow._id);
            toast.success('Share link revoked');
            setRevokeRow(null);
          } catch (e) {
            toast.error(e);
            throw e;
          }
        }}
      />
    </>
  );
}
