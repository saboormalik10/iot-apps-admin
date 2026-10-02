'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { LocationId, PumpStationLive, StationLive } from '@/lib/api/types';
import { getPumpStation, getStation } from '@/lib/api/endpoints';
import { ErrorState, LoadingState } from '@/components/screen-states';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import { CompliancePanel, EquipmentPanel } from './equipment-panel';
import { SiteElevation } from './site-elevation';
import { StationTabs } from './station-tabs';
import { WiringDiagram } from './wiring-diagram';

/**
 * How the station is built: the site elevation (§6.2), the wiring (Figure 3,
 * §6.1), the equipment list from the sensor register, and — collapsed, because
 * it is proposal material rather than something anyone operates by — each
 * instrument against the Statement of Requirements.
 */
export function InstallationPage({ id }: { id: LocationId }) {
  const now = useDemoClock();
  const revision = useDataRevision();
  const [station, setStation] = useState<StationLive | null>(null);
  const [pump, setPump] = useState<PumpStationLive | null>(null);
  const [error, setError] = useState(false);
  const load = () => {
    getStation(id).then(setStation).catch(() => setError(true));
    getPumpStation().then(setPump).catch(() => undefined);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id, revision, Math.floor(now / 60_000)]);

  if (error) return <ErrorState onRetry={load} />;
  if (!station || !now) return <LoadingState label="Loading the installation…" />;
  const loc = station.location;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3 w-3" /> Corridor
        </Link>
        <h1 className="text-xl font-semibold">{loc.name}</h1>
        <p className="text-xs text-muted-foreground">
          Location {loc.ordinal} · chainage <span className="italic">{loc.chainage.label}</span> (provisional) · logger{' '}
          {loc.loggers.map((l) => l.id).join(', ')}
        </p>
      </div>
      <StationTabs id={id} active="installation" />

      <section className="rounded-lg border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Site elevation — as installed</h2>
        <SiteElevation station={loc} readings={station.readings} pumps={pump?.pumps} />
      </section>

      <section className="rounded-lg border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Wiring and connectivity — live</h2>
        <WiringDiagram station={loc} readings={station.readings} pump={loc.pumpStation ? pump : null} />
      </section>

      <EquipmentPanel station={loc} />
      <CompliancePanel station={loc} />
    </div>
  );
}
