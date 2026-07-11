'use client';

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type maplibregl from 'maplibre-gl';
import { Card } from '@/components/ui/card';
import { LoadingState, EmptyState } from '@/components/screen-states';
import type { MetMeasureRow } from '@/lib/api/types';

// maplibre-gl touches window at import — never load it during SSR.
const MapCanvas = dynamic(() => import('@/components/maps/map-canvas').then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <LoadingState label="Loading map…" />,
});

/** Records-detail GPS track — the record's fixes as a polyline with start/end pins. */
export function GpsTrackMap({ measures }: { measures: MetMeasureRow[] }) {
  const coords = measures
    .filter((m) => m.gpsLat != null && m.gpsLng != null)
    .map((m) => [m.gpsLng as number, m.gpsLat as number] as [number, number]);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const paint = useCallback(
    async (map: maplibregl.Map) => {
      if (coords.length === 0) return;
      const maplibre = (await import('maplibre-gl')).default;
      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      };
      const existing = map.getSource('track') as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(geojson);
      } else {
        map.addSource('track', { type: 'geojson', data: geojson });
        map.addLayer({
          id: 'track-line',
          type: 'line',
          source: 'track',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#3b82f6', 'line-width': 3 },
        });
      }

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      const pin = (lngLat: [number, number], color: string, label: string) => {
        const el = document.createElement('div');
        el.style.cssText = `width:12px;height:12px;border-radius:9999px;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.3);background:${color}`;
        el.setAttribute('aria-label', label);
        markersRef.current.push(new maplibre.Marker({ element: el }).setLngLat(lngLat).addTo(map));
      };
      pin(coords[0], 'hsl(var(--status-ok))', 'Track start');
      pin(coords[coords.length - 1], 'hsl(var(--status-error))', 'Track end');

      const bounds = coords.reduce((b, c) => b.extend(c), new maplibre.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
    },
    [coords],
  );

  const onReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
    void paint(map);
  }, [paint]);

  useEffect(() => {
    if (mapRef.current) void paint(mapRef.current);
  }, [paint]);

  if (coords.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState title="No GPS track" body="This record has no GPS fixes to plot." />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-medium">GPS track</h3>
        <span className="text-xs text-muted-foreground">{coords.length.toLocaleString()} fixes</span>
      </div>
      <MapCanvas className="h-[360px]" onReady={onReady} />
    </Card>
  );
}
