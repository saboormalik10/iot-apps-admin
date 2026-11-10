'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MapboxMap, Marker, StyleSpecification } from 'mapbox-gl';
import type { LocationId, StationLive } from '@/lib/api/types';
import { DEMO_COORDINATES } from '@/lib/map/demo-coordinates';
import { LegendBody, PinFace, StationCardBody, quickView } from './corridor-map';
import { MapLegend } from './map-legend';
import { cn } from '@/lib/utils';

/**
 * The corridor on a real map — street or satellite (client, 9 Nov 2026).
 *
 * It shows the stations exactly as the plain schematic does (client, 10 Nov:
 * "the data display should look similar"): the same numbered pins, the same reading
 * cards and the same legend, drawn by the same components. On a real map the inner-
 * west stations sit a few pixels apart, so each card is placed above or below its
 * pin as on the plain map, nudged sideways until it clears its neighbours, with a
 * line back to its pin. Cards follow the map as it pans and zooms.
 *
 * The street map is Mapbox's. The satellite photos are Esri World Imagery, with
 * Esri's road and place-name overlays: Mapbox refused satellite tiles for this
 * account (429 on the first request), and Esri's tiles need no key. Esri's terms
 * are to be confirmed before the delivered system uses them. Stations sit at demo
 * coordinates until MTS supplies surveyed positions.
 */

export type GeoStyle = 'map' | 'satellite';

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const esriLayer = (path: string) => ({
  type: 'raster' as const,
  tiles: [`${ESRI}/${path}/MapServer/tile/{z}/{y}/{x}`],
  tileSize: 256,
  maxzoom: 19,
});

const SATELLITE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      ...esriLayer('World_Imagery'),
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    roads: esriLayer('Reference/World_Transportation'),
    places: esriLayer('Reference/World_Boundaries_and_Places'),
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery' },
    { id: 'roads', type: 'raster', source: 'roads' },
    { id: 'places', type: 'raster', source: 'places' },
  ],
};

const STYLE_URL: Record<GeoStyle, string | StyleSpecification> = {
  map: 'mapbox://styles/mapbox/streets-v12',
  satellite: SATELLITE,
};

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/* The plain map's card: 168 px wide. Its height depends on the readings shown, so
   it is measured after drawing; this is only the first guess. */
const CARD_W = 168;
const CARD_H_GUESS = 100;
const GAP = 8;
const STEM = 22;

type Point = { x: number; y: number };
type Box = { left: number; top: number; w: number; h: number };

export function GeoMap({
  stations,
  mapStyle,
  className,
  onSelect,
  showHealth = false,
}: {
  stations: StationLive[];
  mapStyle: GeoStyle;
  className?: string;
  /** Open the station's quick view instead of its page. */
  onSelect?: (id: StationLive['location']['id']) => void;
  /** Battery and signal on each card, as on the plain map. */
  showHealth?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const [pinHosts, setPinHosts] = useState<Record<string, HTMLDivElement>>({});
  const [points, setPoints] = useState<Record<string, Point>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const heights = useRef<Record<string, number>>({});
  const [, remeasured] = useState(0);
  const [failed, setFailed] = useState(false);

  // Create the map once; the style switch below swaps only the background.
  useEffect(() => {
    if (!TOKEN || !box.current) return;
    let cancelled = false;
    const placed = markers.current;
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
          // Room for the cards above the southern pins and below the northern ones.
          fitBoundsOptions: { padding: { top: 150, bottom: 150, left: 110, right: 110 } },
          attributionControl: true,
        });
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

        // The pins are Mapbox markers whose insides React draws (portals below).
        const hosts: Record<string, HTMLDivElement> = {};
        for (const [id, at] of Object.entries(DEMO_COORDINATES)) {
          const el = document.createElement('div');
          placed.set(id, new mapboxgl.Marker({ element: el }).setLngLat([at.lng, at.lat]).addTo(m));
          // Mapbox labels every marker role="img", "Map marker"; the link inside says what it is.
          el.removeAttribute('role');
          el.removeAttribute('aria-label');
          hosts[id] = el;
        }
        setPinHosts(hosts);

        // Where each pin is on screen, every frame the map moves.
        let frame = 0;
        const project = () => {
          frame = 0;
          const next: Record<string, Point> = {};
          for (const [id, at] of Object.entries(DEMO_COORDINATES)) {
            const p = m.project([at.lng, at.lat]);
            next[id] = { x: p.x, y: p.y };
          }
          setPoints(next);
          const c = m.getContainer();
          setSize({ w: c.clientWidth, h: c.clientHeight });
        };
        const schedule = () => {
          if (!frame) frame = requestAnimationFrame(project);
        };
        m.on('move', schedule);
        m.on('resize', schedule);
        // A missing tile raises an error too; only a map that never loads has failed.
        let loaded = false;
        m.on('error', () => !loaded && setFailed(true));
        m.on('load', () => {
          loaded = true;
          setFailed(false);
          project();
        });
        map.current = m;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      placed.forEach((mk) => mk.remove());
      placed.clear();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.setStyle(STYLE_URL[mapStyle]);
  }, [mapStyle]);

  // Cards report their real height once drawn; lay out again if a guess was off.
  const measure = (id: string) => (el: HTMLDivElement | null) => {
    if (!el) return;
    const h = el.offsetHeight;
    if (h && Math.abs((heights.current[id] ?? CARD_H_GUESS) - h) > 1) {
      heights.current[id] = h;
      remeasured((n) => n + 1);
    }
  };

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

  const layout = place(stations, points, size, heights.current);
  const online = stations.filter((s) => s.status !== 'offline').length;

  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg border', className)}>
      {/* Mapbox's stylesheet makes its container position: relative, so it is sized
          by height, not by inset. */}
      <div ref={box} className="h-full w-full" />

      {/* The pins, drawn by React into Mapbox's markers. */}
      {stations.map((s) =>
        pinHosts[s.location.id]
          ? createPortal(
              <Link
                href={`/stations/${s.location.id}`}
                onClick={quickView(s, onSelect)}
                title={s.location.name}
                className="relative block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="sr-only">{s.location.name}</span>
                <PinFace station={s} />
              </Link>,
              pinHosts[s.location.id],
            )
          : null,
      )}

      {/* The reading cards and the lines back to their pins. As on the plain map,
          below xl the cards give way to the station list under the map. */}
      <div className="pointer-events-none absolute inset-0 hidden xl:block">
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          {layout.map(({ id, pin, card, above }) => {
            const x2 = Math.min(Math.max(pin.x, card.left + 12), card.left + card.w - 12);
            const y2 = above ? card.top + card.h : card.top;
            const y1 = pin.y + (above ? -14 : 14);
            return (
              <g key={id}>
                {/* A dark line under a light one reads on streets and on photos alike. */}
                <line
                  x1={pin.x}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgb(0 0 0 / 0.45)"
                  strokeWidth={3}
                />
                <line
                  x1={pin.x}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgb(255 255 255 / 0.95)"
                  strokeWidth={1.25}
                />
              </g>
            );
          })}
        </svg>
        {layout.map(({ id, station, card }) => (
          <div
            key={id}
            ref={measure(id)}
            className="pointer-events-auto absolute"
            style={{ left: card.left, top: card.top, width: CARD_W }}
          >
            <StationCardBody station={station} showHealth={showHealth} onSelect={onSelect} />
          </div>
        ))}
      </div>

      {failed ? (
        <p className="absolute inset-x-6 top-1/2 z-10 -translate-y-1/2 rounded-md border bg-card px-3 py-2 text-center text-sm text-muted-foreground shadow">
          The map could not be loaded. Check the internet connection, or use the plain view.
        </p>
      ) : null}

      <div className="absolute right-3 top-3 z-10 hidden xl:block">
        <MapLegend>
          <LegendBody online={online} total={stations.length} />
          <p className="mt-1.5 border-t pt-1.5 text-muted-foreground">
            Positions are demo coordinates
          </p>
        </MapLegend>
      </div>
    </div>
  );
}

/**
 * Where each card goes. Each starts centred on its pin, on the side the plain map
 * uses, then moves sideways — right, or left near the edge — until it clears the
 * cards already placed. A card that would leave the map flips to the other side.
 */
function place(
  stations: StationLive[],
  points: Record<string, Point>,
  size: { w: number; h: number },
  heights: Record<string, number>,
): { id: LocationId; station: StationLive; pin: Point; card: Box; above: boolean }[] {
  if (!size.w) return [];
  const placed: Box[] = [];
  const out: { id: LocationId; station: StationLive; pin: Point; card: Box; above: boolean }[] = [];
  const hits = (b: Box) =>
    placed.some(
      (o) =>
        b.left < o.left + o.w + GAP &&
        o.left < b.left + b.w + GAP &&
        b.top < o.top + o.h + GAP &&
        o.top < b.top + b.h + GAP,
    );
  const inside = (b: Box) =>
    b.left >= GAP && b.left + b.w <= size.w - GAP && b.top >= GAP && b.top + b.h <= size.h - GAP;

  // Only stations whose pin is in view get a card; a card for a pin panned off the
  // map would point at nothing.
  const order = stations
    .filter((s) => {
      const p = points[s.location.id];
      return p && p.x >= 0 && p.x <= size.w && p.y >= 0 && p.y <= size.h;
    })
    .sort((a, b) => points[a.location.id].x - points[b.location.id].x);
  for (const s of order) {
    const id = s.location.id;
    const pin = points[id];
    const h = heights[id] ?? CARD_H_GUESS;
    const preferAbove = s.location.map.labelSide === 'above';
    // Every spot worth trying, cheapest first: the plain map's side before the
    // other, the first row before rows further out, small sideways moves first.
    const spots: { card: Box; above: boolean; cost: number }[] = [];
    for (const above of [true, false]) {
      for (let row = 0; row < 4; row++) {
        const top = above ? pin.y - STEM - h - row * (h + GAP) : pin.y + STEM + row * (h + GAP);
        for (let i = 0; i <= 60; i++) {
          const dx = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 12;
          spots.push({
            card: { left: pin.x - CARD_W / 2 + dx, top, w: CARD_W, h },
            above,
            cost: Math.abs(dx) + row * 260 + (above === preferAbove ? 0 : 140),
          });
        }
      }
    }
    spots.sort((x, y) => x.cost - y.cost);
    let best: { card: Box; above: boolean } | undefined = spots.find(
      (c) => inside(c.card) && !hits(c.card),
    );
    // Nowhere clear (a very small map): keep it by its pin, inside the map.
    best ??= {
      card: {
        left: Math.min(Math.max(pin.x - CARD_W / 2, GAP), size.w - CARD_W - GAP),
        top: Math.min(
          Math.max(preferAbove ? pin.y - STEM - h : pin.y + STEM, GAP),
          size.h - h - GAP,
        ),
        w: CARD_W,
        h,
      },
      above: preferAbove,
    };
    placed.push(best.card);
    out.push({ id, station: s, pin, card: best.card, above: best.above });
  }
  return out;
}
