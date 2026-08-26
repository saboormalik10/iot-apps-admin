import type { DashboardTile } from '@/lib/api/types';

/**
 * The MET station's curated instrument widgets (plan §Month 8 live grid). A saved
 * dashboard preset (§Month 11) is a per-device, per-user selection of WHICH of
 * these tiles are shown — a "saved view", not a freeform tile-builder (decision
 * #14). Each visible widget serializes to one `DashboardTile` so the selection
 * persists through the existing `dashboard-layouts` endpoints unchanged.
 */
export interface StationWidget {
  key: string;
  label: string;
  unit: string;
  type: string;
}

export const MET_STATION_WIDGETS: StationWidget[] = [
  // The live dial combines speed and bearing in one instrument. It sits first
  // because it is the reading the client asked to lead with.
  { key: 'wind_dial', label: 'Wind (live)', unit: 'km/h', type: 'compass' },
  { key: 'wind_speed', label: 'Wind speed', unit: 'km/h', type: 'gauge' },
  { key: 'humidity', label: 'Humidity', unit: '%', type: 'gauge' },
  { key: 'pressure', label: 'Pressure', unit: 'hPa', type: 'gauge' },
  { key: 'solar', label: 'Solar', unit: 'W/m²', type: 'gauge' },
  { key: 'temperature', label: 'Temperature', unit: '°C', type: 'thermometer' },
  { key: 'dew_point', label: 'Dew point', unit: '°C', type: 'thermometer' },
  { key: 'wind_dir', label: 'Wind direction', unit: '°', type: 'compass' },
  { key: 'battery', label: 'DC voltage', unit: 'V', type: 'battery' },
  { key: 'precip_total', label: 'Total precip', unit: 'mm', type: 'stat' },
  { key: 'precip_rate', label: 'Precip intensity', unit: 'mm/h', type: 'stat' },
];

export const ALL_WIDGET_KEYS: string[] = MET_STATION_WIDGETS.map((w) => w.key);

/** Decode a saved layout's tiles back to the ordered set of visible widget keys. */
export function tilesToKeys(tiles: DashboardTile[] | undefined): string[] {
  if (!tiles?.length) return [];
  return [...tiles]
    .sort((a, b) => a.index - b.index)
    .map((t) => t.nmea)
    .filter((k) => ALL_WIDGET_KEYS.includes(k));
}

/** Encode a set of visible widget keys to `DashboardTile[]` (catalog order preserved). */
export function keysToTiles(keys: string[]): DashboardTile[] {
  return MET_STATION_WIDGETS.filter((w) => keys.includes(w.key)).map((w, i) => ({
    index: i,
    nmea: w.key,
    type: w.type,
    unit: w.unit,
    desc: w.label,
    label: w.label,
  }));
}
