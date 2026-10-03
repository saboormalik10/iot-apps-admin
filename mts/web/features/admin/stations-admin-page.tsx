'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Organization, StationMeasure, StationRecord, TrackDirection } from '@/lib/api/types';
import { addStation, listOrganisations, listStationRecords } from '@/lib/api/endpoints';
import { LoadingState } from '@/components/screen-states';
import { RightNotice } from '@/components/admin/right-notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmtDate } from '@/lib/format';
import { toast } from '@/lib/hooks/use-toast';
import { useActing } from '@/lib/use-data';
import { cn } from '@/lib/utils';

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
  const [orgFilter, setOrgFilter] = useState('all');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    // An organisation's Administrator sees their own; the Super User sees every one.
    listStationRecords(isSuperUser ? 'all' : 'mts').then(setStations);
    listOrganisations().then(setOrgs);
  }, [isSuperUser]);
  useEffect(load, [load, revision]);

  const shown = useMemo(() => (stations ?? []).filter((s) => orgFilter === 'all' || s.orgId === orgFilter), [stations, orgFilter]);
  if (!stations || !orgs) return <LoadingState label="Loading stations…" />;
  const allowed = can('addStations');

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every monitoring station{isSuperUser ? ', in every organisation' : ' in Metro Trains Sydney'}. A new station starts in
        Commissioning and appears on the map once its position is set and its first readings arrive.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {allowed ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add station
          </Button>
        ) : null}
        {isSuperUser ? (
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label="Organisation" className="h-9 rounded-md border bg-background px-2 text-sm">
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
                {['Location', ...(isSuperUser ? ['Organisation'] : []), 'Chainage', 'GPS', 'Logger', 'Track', 'Measures', 'Added', 'Status'].map((h) => (
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
                      <Link href={`/stations/${s.id}`} className="font-medium hover:text-primary hover:underline">
                        {s.ordinal}. {s.name}
                      </Link>
                    )}
                  </td>
                  {isSuperUser ? <td className="whitespace-nowrap px-3 py-2 text-xs">{s.orgName}</td> : null}
                  <td className="whitespace-nowrap px-3 py-2 text-xs italic text-muted-foreground">{s.chainage}</td>
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
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {fmtDate(s.createdAt)}
                    <span className="block">{s.createdBy}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
                        s.status === 'live' ? 'bg-sev-normal-tint text-sev-normal-strong' : 'bg-sev-info-tint text-sev-info-strong',
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', s.status === 'live' ? 'bg-sev-normal' : 'bg-sev-info')} aria-hidden />
                      {s.status === 'live' ? 'Live' : 'Commissioning'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {adding ? <AddStationDialog orgs={isSuperUser ? orgs : orgs.filter((o) => o.id === 'mts')} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function AddStationDialog({ orgs, onClose }: { orgs: Organization[]; onClose: () => void }) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? 'mts');
  const [name, setName] = useState('');
  const [chainage, setChainage] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [loggerId, setLoggerId] = useState('');
  const [track, setTrack] = useState<TrackDirection>('both');
  const [measures, setMeasures] = useState<StationMeasure[]>([]);
  const [touched, setTouched] = useState(false);

  const gpsGiven = lat.trim() !== '' || lng.trim() !== '';
  const latN = Number(lat);
  const lngN = Number(lng);
  const errors = {
    name: name.trim() ? undefined : 'Name the station.',
    loggerId: loggerId.trim() ? undefined : 'Enter the logger ID.',
    gps:
      gpsGiven && !(Number.isFinite(latN) && Number.isFinite(lngN) && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180)
        ? 'Latitude −90 to 90, longitude −180 to 180 — or leave both blank.'
        : undefined,
    measures: measures.length ? undefined : 'Choose at least one thing it measures.',
  };
  const invalid = Object.values(errors).some(Boolean);
  const err = (e?: string) => (touched && e ? <span className="mt-1 block text-xs text-sev-alert-strong">{e}</span> : null);
  const label = 'mb-1 block text-xs text-muted-foreground';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add station</DialogTitle>
          <DialogDescription>Registered in Commissioning. Add its sensors under Sensors once it is installed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className={label}>Organisation</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={orgs.length < 2} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className={label}>Station name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hurlstone Park" className="h-9" />
            {err(errors.name)}
          </label>
          <label className="block text-sm">
            <span className={label}>Logger ID</span>
            <Input value={loggerId} onChange={(e) => setLoggerId(e.target.value.toUpperCase())} placeholder="HLP-01" className="tabular h-9" />
            {err(errors.loggerId)}
          </label>
          <label className="block text-sm">
            <span className={label}>Chainage</span>
            <Input value={chainage} onChange={(e) => setChainage(e.target.value)} placeholder="MSW 8.100–8.250" className="h-9" />
          </label>
          <label className="block text-sm">
            <span className={label}>Track</span>
            <select value={track} onChange={(e) => setTrack(e.target.value as TrackDirection)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="both">Both</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className={label}>GPS latitude</span>
            <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-33.9123" className="tabular h-9" inputMode="decimal" />
          </label>
          <label className="block text-sm">
            <span className={label}>GPS longitude</span>
            <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="151.1234" className="tabular h-9" inputMode="decimal" />
          </label>
          <div className="sm:col-span-2">
            {err(errors.gps)}
            <p className="text-[11px] text-muted-foreground">Leave GPS blank until the site survey; it shows as “pending survey”.</p>
          </div>
          <fieldset className="sm:col-span-2">
            <legend className={label}>What it measures</legend>
            <div className="flex flex-wrap gap-1.5">
              {MEASURES.map((m) => {
                const on = measures.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMeasures(on ? measures.filter((x) => x !== m.id) : [...measures, m.id])}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      on ? 'border-primary bg-primary/10 font-medium text-primary-strong' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            {err(errors.measures)}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setTouched(true);
              if (invalid) return;
              await addStation({
                orgId,
                name: name.trim(),
                chainage: chainage.trim() || 'to be confirmed',
                gps: gpsGiven ? { lat: latN, lng: lngN } : undefined,
                loggerId: loggerId.trim(),
                track,
                measures,
              });
              toast({ variant: 'success', title: `${name.trim()} added (simulated)`, description: 'Commissioning · recorded in the audit trail' });
              onClose();
            }}
          >
            Add station
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
