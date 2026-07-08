'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * MapCanvas — a thin MapLibre GL wrapper (plan §14). Uses free OSM raster tiles
 * declared inline, so no style host or token is needed (the tile host is on the
 * CSP allow-list). Exposes the map instance via `onReady` so layers can attach.
 */
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export function MapCanvas({
  center = [133.7751, -25.2744], // Australia (fleet default)
  zoom = 3,
  className,
  onReady,
}: {
  center?: [number, number];
  zoom?: number;
  className?: string;
  onReady?: (map: maplibregl.Map) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_STYLE,
        center,
        zoom,
        attributionControl: { compact: true },
      });
    } catch {
      setFailed(true);
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    map.on('load', () => onReady?.(map));
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <div className={className} role="img" aria-label="Map unavailable">
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Map unavailable (WebGL required).
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className={className} aria-label="Fleet map" />;
}
