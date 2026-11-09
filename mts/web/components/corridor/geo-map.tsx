'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Map as MapboxMap, Marker, Popup } from 'mapbox-gl';
import type { StationLive } from '@/lib/api/types';
import { PARAMETER_LABELS } from '@/lib/api/endpoints';
import { DEMO_COORDINATES } from '@/lib/map/demo-coordinates';
import { StatusDot } from '@/components/status/status-pill';
import { MapLegend } from './map-legend';
import { fmtValue } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The corridor on a real map — street or satellite (client, 9 Nov 2026), from
 * Mapbox. Stations sit at demo coordinates until MTS supplies surveyed positions.
 * Each pin carries its number and its status colour; hovering shows the live
 * readings, clicking opens the station, the same as the plain schematic.
 */

export type GeoStyle = 'map' | 'satellite';

const STYLE_URL: Record<GeoStyle, string> = {
  map: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const TONE_COLOR: Record<StationLive['status'], string> = {
  alert: 'hsl(var(--sev-alert))',
  warning: 'hsl(var(--sev-warning))',
  normal: 'hsl(var(--sev-normal))',
  offline: 'hsl(var(--sev-offline))',
};

export function GeoMap({
  stations,
  mapStyle,
  className,
  onSelect,
}: {
  stations: StationLive[];
  mapStyle: GeoStyle;
  className?: string;
  /** Open the station's quick view instead of its page. */
  onSelect?: (id: StationLive['location']['id']) => void;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const markers = useRef(
    new Map<string, { marker: Marker; pin: HTMLButtonElement; popup: Popup }>(),
  );
  const [ready, setReady] = useState(false);
  // The pins are made once; they read the latest handler through a ref.
  const select = useRef(onSelect);
  select.current = onSelect;
  const [failed, setFailed] = useState(false);

  // Create the map once; the style switch below swaps only the background.
  useEffect(() => {
    if (!TOKEN || !box.current) return;
    let cancelled = false;
    const pins = markers.current;
    import('mapbox-gl')
      .then(({ default: mapboxgl }) => {
        if (cancelled || !box.current) return;
        mapboxgl.accessToken = TOKEN;
        const bounds = new mapboxgl.LngLatBounds();
        Object.values(DEMO_COORDINATES).forEach((c) => bounds.extend([c.lng, c.lat]));
        const m = new mapboxgl.Map({
          container: box.current,
          style: STYLE_URL[mapStyle],
          bounds,
          fitBoundsOptions: { padding: 60 },
          attributionControl: true,
        });
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
        // A missing tile raises an error too; only a map that never loads has failed.
        let loaded = false;
        m.on('error', () => !loaded && setFailed(true));
        m.on('load', () => {
          loaded = true;
          setFailed(false);
          setReady(true);
        });
        map.current = m;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      pins.forEach(({ marker }) => marker.remove());
      pins.clear();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.setStyle(STYLE_URL[mapStyle]);
  }, [mapStyle]);

  // Pins: made once per station, recoloured and re-captioned as readings move.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      for (const s of stations) {
        const at = DEMO_COORDINATES[s.location.id];
        if (!at) continue;
        let entry = markers.current.get(s.location.id);
        if (!entry) {
          const pin = document.createElement('button');
          pin.type = 'button';
          pin.className =
            'flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
          pin.textContent = String(s.location.ordinal);
          pin.addEventListener('click', () =>
            select.current ? select.current(s.location.id) : router.push(`/stations/${s.location.id}`),
          );
          const popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 18,
            maxWidth: '260px',
          });
          const marker = new mapboxgl.Marker({ element: pin }).setLngLat([at.lng, at.lat]).addTo(m);
          // Mapbox marks every marker role="img", "Map marker". This one is a button that opens a station.
          pin.setAttribute('role', 'button');
          pin.setAttribute(
            'aria-label',
            `${s.location.ordinal}. ${s.location.name} — open the station`,
          );
          pin.addEventListener('mouseenter', () => popup.setLngLat([at.lng, at.lat]).addTo(m));
          pin.addEventListener('mouseleave', () => popup.remove());
          pin.addEventListener('focus', () => popup.setLngLat([at.lng, at.lat]).addTo(m));
          pin.addEventListener('blur', () => popup.remove());
          entry = { marker, pin, popup };
          markers.current.set(s.location.id, entry);
        }
        entry.pin.style.background = TONE_COLOR[s.status];
        entry.popup.setDOMContent(card(s));
      }
    });
  }, [stations, ready, router]);

  if (!TOKEN) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border bg-muted/40 p-6 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        The Map and Satellite views need a Mapbox token (NEXT_PUBLIC_MAPBOX_TOKEN). The plain view
        works without it.
      </div>
    );
  }

  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg border', className)}>
      {/* Mapbox's stylesheet makes its container position: relative, so it is sized
          by height, not by inset. */}
      <div ref={box} className="h-full w-full" />
      {failed ? (
        <p className="absolute inset-x-6 top-1/2 z-10 -translate-y-1/2 rounded-md border bg-card px-3 py-2 text-center text-sm text-muted-foreground shadow">
          The map could not be loaded. Check the internet connection, or use the plain view.
        </p>
      ) : null}
      <MapLegend className="absolute left-3 top-3 z-10">
        <ul className="mt-1 space-y-0.5">
          <li className="flex items-center gap-2">
            <StatusDot tone="normal" /> Normal
          </li>
          <li className="flex items-center gap-2">
            <StatusDot tone="warning" /> Approaching threshold
          </li>
          <li className="flex items-center gap-2">
            <StatusDot tone="alert" /> Alert active
          </li>
          <li className="flex items-center gap-2">
            <StatusDot tone="offline" /> Offline
          </li>
        </ul>
        <p className="mt-1 border-t pt-1 text-muted-foreground">Positions are demo coordinates</p>
      </MapLegend>
    </div>
  );
}

/** The hover card: the station's readings, as the plain map's cards show them. */
function card(s: StationLive): HTMLElement {
  const el = document.createElement('div');
  el.className = 'text-xs text-foreground';
  const title = document.createElement('p');
  title.className = 'mb-1 text-sm font-semibold';
  title.textContent = `${s.location.ordinal}. ${s.location.name}`;
  el.appendChild(title);
  const list = document.createElement('dl');
  list.className = 'space-y-0.5';
  for (const r of s.readings) {
    const row = document.createElement('div');
    row.className = 'flex justify-between gap-4';
    const dt = document.createElement('dt');
    dt.className = 'text-muted-foreground';
    dt.textContent = PARAMETER_LABELS[r.parameter];
    const dd = document.createElement('dd');
    dd.className = cn(
      'tabular font-medium',
      r.status === 'alert' && 'text-sev-alert-strong',
      r.status === 'warning' && 'text-sev-warning-strong',
    );
    dd.textContent =
      r.parameter === 'float_switch'
        ? r.value === 1
          ? 'WET'
          : 'DRY'
        : `${fmtValue(r.value)} ${r.unit}`;
    row.append(dt, dd);
    list.appendChild(row);
  }
  el.appendChild(list);
  const hint = document.createElement('p');
  hint.className = 'mt-1.5 text-[11px] text-muted-foreground';
  hint.textContent = 'Click the pin to open the station';
  el.appendChild(hint);
  return el;
}
