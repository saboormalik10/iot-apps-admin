'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Instrument, Organization, StationMeasure, StationRecord } from '@/lib/api/types';
import { listInstruments, listOrganisations, listStationRecords } from '@/lib/api/endpoints';
import { LoadingState } from '@/components/screen-states';
import { RightNotice } from '@/components/admin/right-notice';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/format';
import { useActing } from '@/lib/use-data';
import { cn } from '@/lib/utils';
import { AddStationWizard } from './add-station-wizard';

/**
 * The station register (client requirement, 3 Oct 2026). The Super User adds
 * stations to any organisation; an organisation's Administrator can add to their
 * own only once the Super User has granted "Add stations". A new station is
 * registered in Commissioning — no data yet — and joins the map once its
 * position is set and its first readings arrive.
 */
const MEASURES: { id: StationMeasure; label: string }[] = [
  { id: 'rain', label: 'Rain' },
  { id: 'flood', label: 'Flood level' },
  { id: 'temp', label: 'Temperature / humidity' },
  { id: 'wind', label: 'Wind' },
  { id: 'pump', label: 'Pumps' },
];

export function StationsAdminPage() {
  const { isSuperUser, can, revision } = useActing();
  const [stations, setStations] = useState<StationRecord[] | null>(null);
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [orgFilter, setOrgFilter] = useState('all');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    // An organisation's Administrator sees their own; the Super User sees every one.
    listStationRecords(isSuperUser ? 'all' : 'mts').then(setStations);
    listOrganisations().then(setOrgs);
    listInstruments().then(setInstruments);
  }, [isSuperUser]);
  useEffect(load, [load, revision]);

  const shown = useMemo(
    () => (stations ?? []).filter((s) => orgFilter === 'all' || s.orgId === orgFilter),
    [stations, orgFilter],
  );
  if (!stations || !orgs) return <LoadingState label="Loading stations…" />;
  const allowed = can('addStations');

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every monitoring station
        {isSuperUser ? ', in every organisation' : ' in Metro Trains Sydney'}. A new station starts
        in Commissioning and appears on the map once its position is set and its first readings
        arrive.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {allowed ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add station
          </Button>
        ) : null}
        {isSuperUser ? (
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            aria-label="Organisation"
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="all">All organisations</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : null}
        <span className="text-xs text-muted-foreground">{shown.length} stations</span>
      </div>
      {!allowed ? <RightNotice right="addStations" /> : null}

      <section className="min-w-0 rounded-lg border bg-card">
        <div className="scroll-x-hint overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-header text-header-foreground">
              <tr>
                {[
                  'Location',
                  ...(isSuperUser ? ['Organisation'] : []),
                  'Chainage',
                  'GPS',
                  'Logger',
                  'Track',
                  'Measures',
                  'Sensors',
                  'Added',
                  'Status',
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="whitespace-nowrap px-3 py-2">
                    {s.added ? (
                      <span className="font-medium">
                        {s.ordinal}. {s.name}
                      </span>
                    ) : (
                      <Link
                        href={`/stations/${s.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {s.ordinal}. {s.name}
                      </Link>
                    )}
                  </td>
                  {isSuperUser ? (
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{s.orgName}</td>
                  ) : null}
                  <td className="whitespace-nowrap px-3 py-2 text-xs italic text-muted-foreground">
                    {s.chainage}
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {s.gps ? `${s.gps.lat.toFixed(5)}, ${s.gps.lng.toFixed(5)}` : 'pending survey'}
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-xs">{s.loggerId}</td>
                  <td className="px-3 py-2 text-xs capitalize">{s.track}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {s.measures.map((m) => (
                        <span key={m} className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]">
                          {MEASURES.find((x) => x.id === m)?.label}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <SensorCount
                      items={instruments.filter(
                        (i) => i.locationId === s.id && i.status !== 'decommissioned',
                      )}
                      stationId={s.id}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {fmtDate(s.createdAt)}
                    <span className="block">{s.createdBy}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
                        s.status === 'live'
                          ? 'bg-sev-normal-tint text-sev-normal-strong'
                          : 'bg-sev-info-tint text-sev-info-strong',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          s.status === 'live' ? 'bg-sev-normal' : 'bg-sev-info',
                        )}
                        aria-hidden
                      />
                      {s.status === 'live' ? 'Live' : 'Commissioning'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {adding ? (
        <AddStationWizard
          orgs={isSuperUser ? orgs : orgs.filter((o) => o.id === 'mts')}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}

/** How many sensors a station has, and how many are still being commissioned; opens its list in Sensors. */
function SensorCount({ items, stationId }: { items: Instrument[]; stationId: string }) {
  if (!items.length) return <span className="text-muted-foreground">None yet</span>;
  const commissioning = items.filter((i) => i.status === 'commissioning').length;
  return (
    <Link
      href={`/admin/sensors?station=${stationId}`}
      className="hover:text-primary hover:underline"
    >
      <span className="tabular font-medium">{items.length}</span> fitted
      {commissioning ? (
        <span className="block text-sev-info-strong">{commissioning} commissioning</span>
      ) : null}
    </Link>
  );
}
