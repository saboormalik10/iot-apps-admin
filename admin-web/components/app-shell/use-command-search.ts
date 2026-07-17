'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listDevices, listRecords, listSessions } from '@/lib/api/endpoints';
import { isFeatureEnabled } from '@/lib/config/flags';

export interface CommandHit {
  id: string;
  group: 'destinations' | 'devices' | 'sessions' | 'records';
  label: string;
  href: string;
  hint?: string;
  icon: 'nav' | 'device' | 'session' | 'record';
}

/** Below this, a search matches most of the fleet and the results are noise. */
const MIN_QUERY = 2;
const PER_GROUP = 5;
const DEBOUNCE_MS = 200;

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Backs the command palette's non-static results (plan §13).
 *
 * Devices and sessions have a real server-side `search` param, so they're queried
 * directly. **Records have none** — `/records` accepts deviceId/from/to only — so
 * record hits are the most recent page filtered client-side on device name and
 * comment. That's a narrower match than the other two groups, which is why the
 * palette labels the group rather than blending everything into one list.
 */
export function useCommandSearch(rawQuery: string, enabled: boolean) {
  const query = useDebounced(rawQuery.trim(), DEBOUNCE_MS);
  const active = enabled && query.length >= MIN_QUERY;

  const devices = useQuery({
    queryKey: ['command', 'devices', query],
    queryFn: ({ signal }) => listDevices({ search: query, limit: PER_GROUP }, signal),
    enabled: active && isFeatureEnabled('devices'),
    staleTime: 30_000,
  });

  const sessions = useQuery({
    queryKey: ['command', 'sessions', query],
    queryFn: ({ signal }) => listSessions({ search: query, limit: PER_GROUP }, signal),
    enabled: active && isFeatureEnabled('sessions'),
    staleTime: 30_000,
  });

  const records = useQuery({
    // No server-side text search on /records — pull a recent page and filter here.
    queryKey: ['command', 'records'],
    queryFn: ({ signal }) => listRecords({ limit: 50 }, signal),
    enabled: active && isFeatureEnabled('records'),
    staleTime: 60_000,
  });

  const hits: CommandHit[] = [];

  if (isFeatureEnabled('devices')) {
    for (const d of devices.data?.rows ?? []) {
      hits.push({
        id: `device:${d._id}`,
        group: 'devices',
        label: d.customName ?? d.name,
        href: `/devices/${d._id}`,
        hint: d.type,
        icon: 'device',
      });
    }
  }

  if (isFeatureEnabled('sessions')) {
    for (const s of sessions.data?.rows ?? []) {
      hits.push({
        id: `session:${s.id}`,
        group: 'sessions',
        label: s.deviceName,
        href: `/sessions/${s.id}`,
        hint: fmtDate(s.startTimestamp),
        icon: 'session',
      });
    }
  }

  if (isFeatureEnabled('records')) {
    const needle = query.toLowerCase();
    const matched = (records.data?.rows ?? [])
      .filter(
        (r) =>
          r.deviceName?.toLowerCase().includes(needle) || r.comment?.toLowerCase().includes(needle),
      )
      .slice(0, PER_GROUP);
    for (const r of matched) {
      hits.push({
        id: `record:${r._id}`,
        group: 'records',
        label: r.deviceName,
        href: `/records/${r._id}`,
        hint: fmtDate(r.dateStartMs),
        icon: 'record',
      });
    }
  }

  return {
    hits: active ? hits : [],
    isFetching: devices.isFetching || sessions.isFetching || records.isFetching,
  };
}
