'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TimeSeriesChart, type SeriesDef } from '@/components/charts/time-series-chart';
import { SERIES_ROLES } from '@/components/charts/chart-utils';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useScope } from '@/lib/hooks/use-scope';
import { useSessions } from '@/features/sessions/use-sessions';
import { useNepSessionComparison } from '../use-nep-analytics';

const MAX_SESSIONS = 5;
const fmtStart = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

/**
 * Session comparison overlay (plan §6) — pick up to 5 of the device's sessions and
 * overlay their turbidity on an offset-from-start axis (so runs of different
 * absolute times line up). Series colours follow the session (fixed order, §4).
 */
export function SessionComparison({ deviceId }: { deviceId?: string }) {
  const { window } = useScope();
  const { data: sessionsPage, isLoading: listLoading } = useSessions({
    deviceId,
    from: window.from,
    to: window.to,
    limit: 20,
  });
  const sessions = sessionsPage?.rows ?? [];

  const [selected, setSelected] = useState<string[]>([]);

  // Default to the two most-recent sessions once the list arrives.
  useEffect(() => {
    if (selected.length === 0 && sessions.length > 0) {
      setSelected(sessions.slice(0, Math.min(2, sessions.length)).map((s) => s.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_SESSIONS ? cur : [...cur, id]));

  const { data, isLoading } = useNepSessionComparison(selected);

  const { rows, series } = useMemo(() => {
    if (!data) return { rows: [] as Record<string, number | null>[], series: [] as SeriesDef[] };
    const series: SeriesDef[] = data.sessions.map((s, i) => ({
      key: s.id,
      label: s.label,
      role: SERIES_ROLES[i % SERIES_ROLES.length],
    }));
    const rows = data.timeSeries.map((pt) => ({ offsetMs: pt.offsetMs, ...pt.values }));
    return { rows, series };
  }, [data]);

  if (listLoading) {
    return (
      <Card className="p-4">
        <LoadingState label="Loading sessions…" />
      </Card>
    );
  }
  if (sessions.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState title="No sessions to compare" body="This device has no sessions in the current scope." />
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Session comparison</h3>
        <span className="text-xs text-muted-foreground">{selected.length}/{MAX_SESSIONS} selected</span>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sessions to compare">
        {sessions.map((s) => {
          const on = selected.includes(s.id);
          return (
            <Button
              key={s.id}
              size="sm"
              variant={on ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              disabled={!on && selected.length >= MAX_SESSIONS}
              title={s.comment || undefined}
            >
              {fmtStart(s.startTimestamp)}
            </Button>
          );
        })}
      </div>

      {selected.length === 0 ? (
        <EmptyState title="Pick sessions" body="Select up to 5 sessions to overlay." />
      ) : isLoading ? (
        <LoadingState label="Loading comparison…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No turbidity in selection" body="The selected sessions have no turbidity samples." />
      ) : (
        <TimeSeriesChart
          data={rows}
          series={series}
          xKey="offsetMs"
          unit="NTU"
          xFormatter={(v) => `${Math.round(Number(v) / 60000)}m`}
          exportName="session-comparison"
        />
      )}
    </Card>
  );
}
