'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ErrorState, TableSkeleton } from '@/components/screen-states';
import { cn } from '@/lib/utils';

/**
 * DataTable — the shared, server-paginated table primitive (plan §14). Rendering
 * is column-driven via TanStack Table; paging is controlled by the parent (the
 * server owns the page window). Loading/empty/error are first-class.
 *
 * WHY `error` EXISTS
 * Until it did, a failed request rendered `emptyLabel` — so "the server returned
 * a 500" and "this customer has no stations" were the same screen. That is a
 * confident, wrong statement about a customer's data, and it is worst exactly
 * where it matters most: right after a platform administrator switches customer.
 *
 * Precedence is error -> loading -> empty. A failed REFETCH must not fall
 * through to "No results." just because stale rows are gone.
 */
export function DataTable<T>({
  data,
  columns,
  page,
  pageCount,
  total,
  onPageChange,
  isLoading,
  isStale,
  error,
  onRetry,
  emptyLabel = 'No results.',
  onRowClick,
  getRowId,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  page?: number;
  pageCount?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  isLoading?: boolean;
  /**
   * Rows shown are from the PREVIOUS query (react-query's `isPlaceholderData`).
   *
   * `keepPreviousData` is what stops the table flashing between pages, and it is
   * right for that. Across a device change it is not: it renders one station's
   * rows under another station's filter, with nothing to say so. Dimming keeps
   * the smooth paging and makes the staleness visible instead of silent.
   */
  isStale?: boolean;
  /** Any truthy value (react-query's `isError` or `error`) switches to ErrorState. */
  error?: unknown;
  onRetry?: () => void;
  emptyLabel?: string;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    manualPagination: true,
    pageCount: pageCount ?? -1,
  });

  // Error first: a failed refetch leaves `isLoading` false and `data` empty, so
  // checking loading or emptiness first would report "no data" for a failure.
  if (error) return <ErrorState onRetry={onRetry} />;
  if (isLoading) return <TableSkeleton rows={8} cols={columns.length} />;

  const showPager = page != null && pageCount != null && pageCount > 1 && onPageChange;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'overflow-x-auto rounded-lg border transition-opacity',
          isStale && 'pointer-events-none opacity-60',
        )}
        aria-busy={isStale || undefined}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showPager ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pageCount}
            {total != null ? ` · ${total} total` : ''}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
