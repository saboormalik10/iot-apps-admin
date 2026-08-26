'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ErrorState, EmptyState, TableSkeleton } from '@/components/screen-states';
import { DiffViewer } from './diff-viewer';
import { useAudit } from './use-audit';
import { formatDateTime } from '@/lib/time';
import type { AuditQuery } from '@/lib/api/endpoints';

const ACTIONS = ['create', 'update', 'delete', 'invite', 'revoke', 'export', 'login', 'logout'];
const RESOURCES = ['device', 'user', 'session', 'record', 'alertRule', 'shareToken', 'org', 'settings'];
const ALL = '__all__';

export function AuditLog() {
  const t = useTranslations('audit');
  const tc = useTranslations('common');
  const [query, setQuery] = useState<AuditQuery>({ page: 1, limit: 20 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data, isLoading, isError, refetch, isFetching } = useAudit(query);

  const patch = (p: Partial<AuditQuery>) => setQuery((q) => ({ ...q, page: 1, ...p }));
  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      {/**
       * Filter bar — server-side filters.
       *
       * Every control is associated with its label by `htmlFor`/`id` (M24 W2).
       * They used to be bare `<label>` elements sitting NEXT TO the control, which
       * looks labelled and is not: axe reported two `button-name` and two `label`
       * violations here, both critical, because a screen reader announced four
       * unnamed fields. This route had no axe gate, which is why it survived.
       */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="audit-filter-action" className="text-xs text-muted-foreground">{t('filterAction')}</label>
          <Select
            value={query.action ?? ALL}
            onValueChange={(v) => patch({ action: v === ALL ? undefined : v })}
          >
            <SelectTrigger id="audit-filter-action" className="w-40">
              <SelectValue placeholder={tc('all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{tc('all')}</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="audit-filter-resource" className="text-xs text-muted-foreground">{t('filterResource')}</label>
          <Select
            value={query.resourceType ?? ALL}
            onValueChange={(v) => patch({ resourceType: v === ALL ? undefined : v })}
          >
            <SelectTrigger id="audit-filter-resource" className="w-40">
              <SelectValue placeholder={tc('all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{tc('all')}</SelectItem>
              {RESOURCES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="audit-filter-from" className="text-xs text-muted-foreground">{t('filterFrom')}</label>
          <Input
            id="audit-filter-from"
            type="date"
            className="w-40"
            value={query.from ?? ''}
            onChange={(e) => patch({ from: e.target.value || undefined })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="audit-filter-to" className="text-xs text-muted-foreground">{t('filterTo')}</label>
          <Input
            id="audit-filter-to"
            type="date"
            className="w-40"
            value={query.to ?? ''}
            onChange={(e) => patch({ to: e.target.value || undefined })}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => setQuery({ page: 1, limit: 20 })}>
          {t('clearFilters')}
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('title')} body={t('subtitle')} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{t('colTime')}</TableHead>
                <TableHead>{t('colUser')}</TableHead>
                <TableHead>{t('colAction')}</TableHead>
                <TableHead>{t('colResource')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => {
                const isOpen = expanded.has(entry._id);
                const hasChanges = entry.changes && Object.keys(entry.changes).length > 0;
                return (
                  <Fragment key={entry._id}>
                    <TableRow>
                      <TableCell>
                        {hasChanges ? (
                          <button
                            type="button"
                            onClick={() => toggle(entry._id)}
                            aria-expanded={isOpen}
                            aria-label={t('viewDiff')}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </TableCell>
                      <TableCell>{entry.userEmail}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{entry.action}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{entry.resourceType}</span>
                        {entry.resourceName ? <span> · {entry.resourceName}</span> : null}
                      </TableCell>
                    </TableRow>
                    {isOpen && hasChanges ? (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30">
                          <DiffViewer changes={entry.changes} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>

          {/* Server pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{tc('page', { page: data?.page ?? 1, pageCount: data?.pageCount ?? 1 })}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={(query.page ?? 1) <= 1 || isFetching}
                onClick={() => setQuery((q) => ({ ...q, page: Math.max(1, (q.page ?? 1) - 1) }))}
              >
                {tc('previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(data?.page ?? 1) >= (data?.pageCount ?? 1) || isFetching}
                onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
              >
                {tc('next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
