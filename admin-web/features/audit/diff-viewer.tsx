'use client';

import { useTranslations } from 'next-intl';

/**
 * Renders an audit entry's `changes` map (plan §6). Handles both `{ field: {from,
 * to} }` diffs and flat `{ field: value }` snapshots the backend records.
 */
function isFromTo(v: unknown): v is { from?: unknown; to?: unknown } {
  return typeof v === 'object' && v !== null && ('from' in v || 'to' in v);
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function DiffViewer({ changes }: { changes: Record<string, unknown> | null }) {
  const t = useTranslations('audit');
  const entries = changes ? Object.entries(changes) : [];

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noChanges')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 pr-4 text-left font-medium">{t('colChanges')}</th>
            <th className="py-1 pr-4 text-left font-medium">{t('before')}</th>
            <th className="py-1 text-left font-medium">{t('after')}</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {entries.map(([field, value]) => {
            const fromTo = isFromTo(value);
            return (
              <tr key={field} className="border-t">
                <td className="py-1 pr-4 align-top font-sans font-medium">{field}</td>
                <td className="py-1 pr-4 align-top text-status-error">
                  {fromTo ? stringify((value as { from?: unknown }).from) : '—'}
                </td>
                <td className="py-1 align-top text-status-ok">
                  {fromTo ? stringify((value as { to?: unknown }).to) : stringify(value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
