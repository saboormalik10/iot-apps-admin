'use client';

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type maplibregl from 'maplibre-gl';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useSocketEvent } from '@/lib/realtime/hooks';
import { ClientEvent } from '@/lib/realtime/events';
import { queryKeys } from '@/lib/query/keys';
import { useOrgDeviceMap } from '@/features/dashboard/use-dashboard';
import type { FleetMapPoint } from '@/lib/api/types';

// maplibre-gl touches window at import — never load it during SSR.
const MapCanvas = dynamic(() => import('@/components/maps/map-canvas').then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <LoadingState label="Loading map…" />,
});

/** Marker colour by online status (paired with the popup label — not colour-only). */
function markerColor(p: FleetMapPoint): string {
  return p.isOnline ? 'hsl(var(--status-ok))' : 'hsl(var(--status-offline))';
}

/**
 * FleetMapPanel (plan §6 / §Month 8) — the org fleet map: last-known GPS for every
 * device as status-coloured markers. `device:status` refreshes it live. Rendered
 * as a compact home panel and full-screen on /map.
 */
export function FleetMapPanel({ compact = false }: { compact?: boolean }) {
  const { data: points, isLoading } = useOrgDeviceMap();
  const qc = useQueryClient();
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useSocketEvent(ClientEvent.DEVICE_STATUS, () => qc.invalidateQueries({ queryKey: queryKeys.orgDeviceMap }));

  const paint = useCallback(
    async (map: maplibregl.Map, pts: FleetMapPoint[]) => {
      const maplibre = (await import('maplibre-gl')).default;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (pts.length === 0) return;

      const bounds = new maplibre.LngLatBounds();
      for (const p of pts) {
        // The marker is a 24px transparent hit area with a 14px dot drawn inside
        // it. The dot alone was a 14px target — under the 24px minimum (WCAG 2.5.8
        // / Lighthouse target-size) — and pins this small are hard to hit on a
        // touch screen regardless. The visual is unchanged.
        const el = document.createElement('div');
        el.style.cssText =
          'width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:transparent;cursor:pointer';
        const dot = document.createElement('span');
        dot.style.cssText = `width:14px;height:14px;border-radius:9999px;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.3);background:${markerColor(p)}`;
        el.appendChild(dot);
        // aria-label is PROHIBITED on a roleless generic div (axe:
        // aria-prohibited-attr). The marker is focusable and opens a popup, so
        // role=button is both valid and true.
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `${p.deviceName} — ${p.isOnline ? 'online' : 'offline'}`);
        const popup = new maplibre.Popup({ offset: 12, closeButton: false }).setText(
          `${p.deviceName} · ${p.type} · ${p.isOnline ? 'Online' : 'Offline'}`,
        );
        const marker = new maplibre.Marker({ element: el })
          .setLngLat([p.lastGpsLng, p.lastGpsLat])
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
        bounds.extend([p.lastGpsLng, p.lastGpsLat]);
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 });
    },
    [],
  );

  const onReady = useCallback(
    (map: maplibregl.Map) => {
      mapRef.current = map;
      if (points) void paint(map, points);
    },
    [points, paint],
  );

  // Repaint when the data changes and the map is already ready.
  useEffect(() => {
    if (mapRef.current && points) void paint(mapRef.current, points);
  }, [points, paint]);

  const height = compact ? 'h-[320px]' : 'h-[calc(100vh-12rem)]';

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-4 py-2">
        {/* h2, not h3: on /map this sits directly under the page's h1, and skipping
            a level is a heading-order failure (M24 W2). The size is typographic,
            not structural — the level says where it sits in the outline. */}
        <h2 className="text-sm font-medium">Fleet map</h2>
        {points ? <span className="text-xs text-muted-foreground">{points.length} located</span> : null}
      </div>
      {isLoading ? (
        <div className={height}>
          <LoadingState label="Loading map…" />
        </div>
      ) : !points || points.length === 0 ? (
        <div className={height}>
          <EmptyState title="No located devices" body="Devices appear here once they report a GPS fix." />
        </div>
      ) : (
        /**
         * The height lives on a WRAPPER, not on MapCanvas (M24 W2).
         *
         * MapCanvas is a `dynamic()` import — maplibre-gl touches `window`, so it
         * cannot be server-rendered — and its `loading:` fallback is declared at
         * module scope where `height` is not in scope. Putting the height only on
         * MapCanvas meant that while the maplibre chunk downloaded, the panel
         * collapsed to the fallback's natural height and then sprang back to
         * 320px: measured as this row going 359 → 223 → 359px on the dashboard,
         * one of four contributors to its CLS.
         */
        <div className={height}>
          <MapCanvas className="h-full" onReady={onReady} />
        </div>
      )}
    </Card>
  );
}
