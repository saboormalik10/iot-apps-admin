'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorState, EmptyState, TableSkeleton } from '@/components/screen-states';
import { DiffViewer } from './diff-viewer';
import { useAudit } from './use-audit';
import { describeEntry, TONE_CLASS } from './describe-entry';
import { useUsers } from '@/features/org/use-users';
import { formatDateTime, formatRelative } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { AuditQuery } from '@/lib/api/endpoints';
import type { AuditEntry } from '@/lib/api/types';

const ACTIONS = ['create', 'update', 'delete', 'invite', 'revoke', 'export', 'login', 'logout'];
/**
 * Everything that is not a sign-in.
 *
 * Sign-ins are 78% of the log, so "what actually changed?" — the question this
 * page exists for — was buried under pages of them, and the action filter can
 * only narrow to one action at a time. Sent as a comma-separated list, which
 * the API accepts.
 */
const CHANGE_ACTIONS = 'create,update,delete,invite,revoke,export';
const RESOURCES = ['device', 'user', 'role', 'alertRule', 'shareToken', 'record', 'organization', 'settings'];
const ALL = '__all__';

/** `2026-09-13` in the VIEWER's zone — the date they would call today. */
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const startOfDay = (daysBack: number) => {
  const d = new Date();
  // `setDate`, not `now - n*86400000`: arithmetic skips or repeats an hour
  // across a daylight-saving boundary and silently shifts the window a day.
  d.setDate(d.getDate() - daysBack);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const RANGES = [
  { key: 'today', label: 'Today', from: () => startOfDay(0) },
  { key: '7d', label: 'Last 7 days', from: () => startOfDay(6) },
  { key: '30d', label: 'Last 30 days', from: () => startOfDay(29) },
  { key: 'all', label: 'All time', from: () => undefined },
] as const;

/** A day heading, written the way someone would say it. */
const dayLabel = (key: string) => {
  if (key === dayKey(new Date().toISOString())) return 'Today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y.toISOString())) return 'Yesterday';
  return formatDateTime(`${key}T12:00:00`, { dateStyle: 'full', timeStyle: undefined } as never);
};

export function AuditLog() {
  const t = useTranslations('audit');
  const tc = useTranslations('common');
  const [query, setQuery] = useState<AuditQuery>({ page: 1, limit: 50 });
  const [range, setRange] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch, isFetching } = useAudit(query);
  // The API has always accepted `userId`; nothing ever offered it. "Who did
  // this?" is the question this page exists to answer.
  const { data: usersPage } = useUsers();
  const people = usersPage?.rows ?? [];

  const patch = (p: Partial<AuditQuery>) => setQuery((q) => ({ ...q, page: 1, ...p }));

  const setRangeKey = (key: string) => {
    setRange(key);
    patch({ from: RANGES.find((r) => r.key === key)?.from(), to: undefined });
  };

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const rows = useMemo(() => data?.rows ?? [], [data]);

  /** Grouped by day, order preserved — the API already sorts newest first. */
  const days = useMemo(() => {
    const out: { key: string; entries: AuditEntry[] }[] = [];
    for (const e of rows) {
      const k = dayKey(e.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === k) last.entries.push(e);
      else out.push({ key: k, entries: [e] });
    }
    return out;
  }, [rows]);

  const filtered = Boolean(query.action || query.resourceType || query.userId || query.from || query.to);

  return (
    <div className="space-y-4">
      {/* Quick ranges first: "what happened today" is the common question, and it
          took two date pickers to ask. */}
      <div className="flex flex-wrap items-center gap-1">
        {RANGES.map((r) => (
          <Button
            key={r.key}
            size="sm"
            variant={range === r.key ? 'default' : 'ghost'}
            className="h-7 text-xs"
            onClick={() => setRangeKey(r.key)}
          >
            {r.label}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Button
          size="sm"
          variant={query.action === CHANGE_ACTIONS ? 'default' : 'ghost'}
          className="h-7 text-xs"
          onClick={() =>
            patch({ action: query.action === CHANGE_ACTIONS ? undefined : CHANGE_ACTIONS })
          }
        >
          Changes only
        </Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <span className="text-xs text-muted-foreground">
          {data?.total != null ? `${data.total.toLocaleString()} ${data.total === 1 ? 'entry' : 'entries'}` : ''}
        </span>
      </div>

      {/**
       * Every control is associated with its control by `htmlFor`/`id` (M24 W2).
       * They were once bare `<label>` elements sitting NEXT TO the field, which
       * looks labelled and is not — axe reported four critical violations here.
       */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="audit-filter-user" className="text-xs text-muted-foreground">{t('filterUser')}</label>
          <Select
            value={query.userId ?? ALL}
            onValueChange={(v) => patch({ userId: v === ALL ? undefined : v })}
          >
            <SelectTrigger id="audit-filter-user" className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              {people.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.firstName || u.lastName ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor="audit-filter-action" className="text-xs text-muted-foreground">{t('filterAction')}</label>
          <Select
            value={query.action && query.action !== CHANGE_ACTIONS ? query.action : ALL}
            onValueChange={(v) => patch({ action: v === ALL ? undefined : v })}
          >
            <SelectTrigger id="audit-filter-action" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any action</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
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
            <SelectTrigger id="audit-filter-resource" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Anything</SelectItem>
              {RESOURCES.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
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
            onChange={(e) => {
              setRange('');
              patch({ from: e.target.value || undefined });
            }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="audit-filter-to" className="text-xs text-muted-foreground">{t('filterTo')}</label>
          <Input
            id="audit-filter-to"
            type="date"
            className="w-40"
            value={query.to ?? ''}
            onChange={(e) => {
              setRange('');
              patch({ to: e.target.value || undefined });
            }}
          />
        </div>

        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRange('all');
              setQuery({ page: 1, limit: 50 });
            }}
          >
            {t('clearFilters')}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={3} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing recorded"
          body={filtered ? 'No activity matches these filters. Try widening the date range.' : t('subtitle')}
        />
      ) : (
        <>
          <div className={cn('space-y-5', isFetching && 'opacity-60 transition-opacity')}>
            {days.map(({ key, entries }) => (
              <section key={key}>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {dayLabel(key)}
                </h3>
                <ul className="divide-y rounded-md border">
                  {entries.map((entry) => {
                    const isOpen = expanded.has(entry._id);
                    const hasChanges = entry.changes && Object.keys(entry.changes).length > 0;
                    const d = describeEntry(entry);
                    return (
                      <Fragment key={entry._id}>
                        <li className="flex items-start gap-3 px-3 py-2 text-sm">
                          <button
                            type="button"
                            onClick={() => (hasChanges ? toggle(entry._id) : undefined)}
                            aria-expanded={hasChanges ? isOpen : undefined}
                            aria-label={hasChanges ? t('viewDiff') : undefined}
                            disabled={!hasChanges}
                            className={cn(
                              'mt-0.5 shrink-0 text-muted-foreground',
                              hasChanges ? 'hover:text-foreground' : 'invisible',
                            )}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>

                          <span
                            className={cn('mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px]', TONE_CLASS[d.tone])}
                          >
                            {entry.action}
                          </span>

                          <span className="min-w-0 flex-1">
                            {d.text}
                            {d.name ? <span className="font-medium"> {d.name}</span> : null}
                            <span className="text-muted-foreground"> · {entry.userEmail}</span>
                          </span>

                          {/* Relative reads faster; the exact stamp is one hover
                              away, because "when exactly" is the follow-up. */}
                          <time
                            dateTime={entry.createdAt}
                            title={formatDateTime(entry.createdAt)}
                            className="shrink-0 whitespace-nowrap text-xs text-muted-foreground"
                          >
                            {formatRelative(entry.createdAt)}
                          </time>
                        </li>
                        {isOpen && hasChanges ? (
                          <li className="bg-muted/30 px-3 py-2">
                            <DiffViewer changes={entry.changes} />
                          </li>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

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
