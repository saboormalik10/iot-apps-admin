'use client';

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type maplibregl from 'maplibre-gl';
import { Card } from '@/components/ui/card';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { ntuHex, NTU_LEGEND } from '@/lib/api/map-colors';
import type { NepMapPoint } from '@/lib/api/types';

// maplibre-gl touches window at import — never load it during SSR.
const MapCanvas = dynamic(() => import('@/components/maps/map-canvas').then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <LoadingState label="Loading map…" />,
});

/**
 * Session GPS trail (plan §6) — the session's fixes as a polyline with each fix
 * dotted by its turbidity (sequential blue hue, §10.9). Null-GPS points are
 * dropped (never plotted at 0,0). A legend maps hue → WHO/EPA class.
 */
export function SessionGpsTrail({ points }: { points: NepMapPoint[] }) {
  const located = points.filter((p) => p.lat != null && p.lng != null);
  const coords = located.map((p) => [p.lng as number, p.lat as number] as [number, number]);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const paint = useCallback(
    async (map: maplibregl.Map) => {
      if (coords.length === 0) return;
      const maplibre = (await import('maplibre-gl')).default;

      const line: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      };
      const dots: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: located.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng as number, p.lat as number] },
          properties: { hex: ntuHex(p.turbidityValue), ntu: p.turbidityValue ?? null },
        })),
      };

      const lineSrc = map.getSource('trail') as maplibregl.GeoJSONSource | undefined;
      const dotSrc = map.getSource('trail-dots') as maplibregl.GeoJSONSource | undefined;
      if (lineSrc && dotSrc) {
        lineSrc.setData(line);
        dotSrc.setData(dots);
      } else {
        map.addSource('trail', { type: 'geojson', data: line });
        map.addLayer({
          id: 'trail-line',
          type: 'line',
          source: 'trail',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#64748b', 'line-width': 2, 'line-opacity': 0.6 },
        });
        map.addSource('trail-dots', { type: 'geojson', data: dots });
        map.addLayer({
          id: 'trail-dots',
          type: 'circle',
          source: 'trail-dots',
          paint: {
            'circle-radius': 4,
            'circle-color': ['get', 'hex'],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
          },
        });
      }

      const bounds = coords.reduce((b, c) => b.extend(c), new maplibre.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 44, maxZoom: 15, duration: 0 });
    },
    [coords, located],
  );

  const onReady = useCallback(
    (map: maplibregl.Map) => {
      mapRef.current = map;
      void paint(map);
    },
    [paint],
  );

  useEffect(() => {
    if (mapRef.current) void paint(mapRef.current);
  }, [paint]);

  if (located.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState title="No GPS trail" body="This session has no GPS fixes to plot." />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-medium">GPS trail</h3>
        <span className="text-xs text-muted-foreground">{located.length.toLocaleString()} fixes · coloured by turbidity</span>
      </div>
      <MapCanvas className="h-[360px]" onReady={onReady} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
        {NTU_LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.hex }} />
            {l.label}
          </span>
        ))}
      </div>
    </Card>
  );
}
