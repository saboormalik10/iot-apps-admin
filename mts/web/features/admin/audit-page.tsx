'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { AuditEntry } from '@/lib/api/types';
import { listAudit } from '@/lib/api/endpoints';
import { LoadingState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The audit trail.
 *
 * Every user change, role change, threshold edit, acknowledgement and manual pump
 * start or stop, with who and when — queryable and exportable, because a suspended
 * account keeping its history is worthless if the history cannot be read back.
 */
const CATEGORY_STYLE: Record<AuditEntry['category'], string> = {
  maintenance: 'bg-sev-warning-tint text-sev-warning-strong',
  user: 'bg-sev-info-tint text-sev-info-strong',
  role: 'bg-primary/10 text-primary-strong',
  rule: 'bg-sev-warning-tint text-sev-warning-strong',
  alert: 'bg-sev-alert-tint text-sev-alert-strong',
  pump: 'bg-op-running-tint text-op-running',
  auth: 'bg-muted text-muted-foreground',
};

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [category, setCategory] = useState<AuditEntry['category'] | 'all'>('all');

  useEffect(() => {
    listAudit().then(setEntries);
  }, []);

  if (!entries) return <LoadingState label="Loading the audit trail…" />;
  const shown = entries.filter((e) => category === 'all' || e.category === category);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Every action attributable to a named person. Retained and exportable.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {['user', 'role', 'rule', 'alert', 'pump', 'maintenance', 'auth'].map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <section className="rounded-lg border bg-card">
        <div className="scroll-x-hint overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-header text-header-foreground">
              <tr>
                {['When', 'Who', 'Action', 'Detail', 'Category'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="tabular whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDateTime(e.t)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{e.actor}</td>
                  <td className="whitespace-nowrap px-3 py-2">{e.action}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.detail}</td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', CATEGORY_STYLE[e.category])}>
                      {e.category}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
