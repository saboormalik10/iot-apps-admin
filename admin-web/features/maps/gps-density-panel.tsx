'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type maplibregl from 'maplibre-gl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useScopedDevice } from '@/features/dashboard/use-scoped-device';
import { useNepGpsDensity } from '@/features/analytics-nep/use-nep-analytics';
import { ntuHex, NTU_LEGEND } from '@/lib/api/map-colors';
import type { NepGpsCell } from '@/lib/api/types';

// maplibre-gl touches window at import — never load it during SSR.
const MapCanvas = dynamic(() => import('@/components/maps/map-canvas').then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <LoadingState label="Loading map…" />,
});

type Resolution = 'low' | 'medium' | 'high';
const RES_LABEL: Record<Resolution, string> = { low: 'Coarse (100m)', medium: 'Medium (10m)', high: 'Fine (1m)' };

/**
 * NEP GPS density heatmap (plan §6) — grid-cell turbidity averages as graduated
 * circles: colour = mean turbidity (sequential blue hue, §10.9), radius = sample
 * count. Device-scoped; auto-selects a NEP-LINK device when the Scope Bar is All.
 */
export function GpsDensityPanel() {
  const nep = useScopedDevice('NEP-LINK');
  const [resolution, setResolution] = useState<Resolution>('medium');
  const { data, isLoading } = useNepGpsDensity(nep.deviceId, resolution);
  const cells = data?.cells ?? [];

  const mapRef = useRef<maplibregl.Map | null>(null);

  const paint = useCallback(
    async (map: maplibregl.Map, list: NepGpsCell[]) => {
      const maplibre = (await import('maplibre-gl')).default;
      const located = list.filter((c) => c.lat != null && c.lng != null);
      if (located.length === 0) return;
      const maxCount = Math.max(...located.map((c) => c.sampleCount), 1);

      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: located.map((c) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
          properties: {
            hex: ntuHex(c.avgTurbidity),
            count: c.sampleCount,
            weight: c.sampleCount / maxCount,
          },
        })),
      };

      const src = map.getSource('density') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(fc);
      } else {
        map.addSource('density', { type: 'geojson', data: fc });
        map.addLayer({
          id: 'density-cells',
          type: 'circle',
          source: 'density',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'weight'], 0, 5, 1, 22],
            'circle-color': ['get', 'hex'],
            'circle-opacity': 0.72,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
          },
        });
      }

      const bounds = new maplibre.LngLatBounds();
      located.forEach((c) => bounds.extend([c.lng, c.lat]));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    },
    [],
  );

  const onReady = useCallback(
    (map: maplibregl.Map) => {
      mapRef.current = map;
      void paint(map, cells);
    },
    [cells, paint],
  );

  useEffect(() => {
    if (mapRef.current) void paint(mapRef.current, cells);
  }, [cells, paint]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <h3 className="text-sm font-medium">
          GPS density heatmap
          {nep.isAuto && nep.device ? <span className="ml-2 text-xs font-normal text-muted-foreground">{nep.device.name}</span> : null}
        </h3>
        <div className="flex gap-1">
          {(['low', 'medium', 'high'] as Resolution[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={resolution === r ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setResolution(r)}
              aria-pressed={resolution === r}
            >
              {RES_LABEL[r]}
            </Button>
          ))}
        </div>
      </div>

      {!nep.deviceId ? (
        <div className="h-[360px]">
          <EmptyState title="No NEP-LINK device" body="GPS density needs a NEP-LINK device. Adjust the Scope Bar." />
        </div>
      ) : isLoading ? (
        <div className="h-[360px]">
          <LoadingState label="Loading density grid…" />
        </div>
      ) : cells.length === 0 ? (
        <div className="h-[360px]">
          <EmptyState title="No GPS samples" body="This device has no located samples in the current scope." />
        </div>
      ) : (
        <MapCanvas className="h-[420px]" onReady={onReady} />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>Mean turbidity:</span>
        {NTU_LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.hex }} />
            {l.label}
          </span>
        ))}
        <span className="ml-2">· circle size = sample count</span>
      </div>
    </Card>
  );
}
