import { describe, it, expect } from 'vitest';
import {
  keysToTiles,
  tilesToKeys,
  ALL_WIDGET_KEYS,
  MET_STATION_WIDGETS,
} from '@/features/dashboard/presets/tile-catalog';

describe('dashboard preset tiles ↔ visible keys', () => {
  it('encodes a subset in catalog order (ignores input order)', () => {
    const tiles = keysToTiles(['pressure', 'humidity', 'battery']);
    expect(tiles.map((t) => t.nmea)).toEqual(['humidity', 'pressure', 'battery']);
    expect(tiles.map((t) => t.index)).toEqual([0, 1, 2]);
  });

  it('round-trips through tilesToKeys', () => {
    const keys = ['humidity', 'temperature', 'solar'];
    expect(tilesToKeys(keysToTiles(keys))).toEqual(['humidity', 'solar', 'temperature']);
  });

  it('drops unknown keys when decoding', () => {
    expect(tilesToKeys([{ index: 0, nmea: 'bogus', type: '', unit: '', desc: '', label: '' }])).toEqual([]);
    expect(tilesToKeys(undefined)).toEqual([]);
  });

  it('serializes every catalog widget with a label + unit (model needs non-empty tiles)', () => {
    const tiles = keysToTiles(ALL_WIDGET_KEYS);
    expect(tiles.length).toBe(MET_STATION_WIDGETS.length);
    expect(tiles.every((t) => t.label && t.unit)).toBe(true);
  });
});
