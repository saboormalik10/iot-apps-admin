import { describe, it, expect } from 'vitest';
import {
  windBandIndex,
  ntuClassIndex,
  beaufortFromMs,
  deriveProbeRange,
  comfortLabel,
  fogRisk,
  WIND_SPEED_BANDS,
  BEAUFORT,
  NTU_CLASSES,
  INTERVALS,
} from '@/lib/api/scales';
import { sectorIndex, COMPASS_16, fmt } from '@/components/charts/chart-utils';

describe('scales (mirrored from analytics.util.ts)', () => {
  it('has the exact enumeration sizes the backend defines', () => {
    expect(WIND_SPEED_BANDS).toHaveLength(5);
    expect(BEAUFORT).toHaveLength(13);
    expect(NTU_CLASSES).toHaveLength(7);
    expect(INTERVALS).toEqual(['1min', '5min', '1h', '4h', '1d']);
  });

  it('windBandIndex bins at the Smithtek boundaries', () => {
    expect(windBandIndex(0)).toBe(0); // Calm
    expect(windBandIndex(0.5)).toBe(1); // Light
    expect(windBandIndex(3.3)).toBe(2); // Gentle
    expect(windBandIndex(7.9)).toBe(3); // Moderate
    expect(windBandIndex(13.8)).toBe(4); // Strong
    expect(windBandIndex(99)).toBe(4);
  });

  it('ntuClassIndex maps to the 7 WHO/EPA bands', () => {
    expect(ntuClassIndex(0.5)).toBe(0);
    expect(ntuClassIndex(5)).toBe(1);
    expect(ntuClassIndex(1500)).toBe(6);
  });

  it('beaufortFromMs returns the correct force', () => {
    expect(beaufortFromMs(0).force).toBe(0);
    expect(beaufortFromMs(14).force).toBe(7);
    expect(beaufortFromMs(100).force).toBe(12);
  });

  it('deriveProbeRange matches the NTU thresholds', () => {
    expect(deriveProbeRange(5)).toBe('R1');
    expect(deriveProbeRange(500)).toBe('R2');
    expect(deriveProbeRange(2000)).toBe('R3');
  });

  it('comfortLabel and fogRisk return backend labels', () => {
    expect(comfortLabel(45)).toBe('Very Hot');
    expect(comfortLabel(20)).toBe('Comfortable');
    expect(comfortLabel(-40)).toBe('Dangerously Cold');
    expect(comfortLabel(null)).toBe('Comfortable');
    expect(fogRisk(1)).toBe('HIGH');
    expect(fogRisk(3)).toBe('MODERATE');
    expect(fogRisk(10)).toBe('LOW');
  });
});

describe('chart-utils', () => {
  it('sectorIndex maps bearings to 16-point compass', () => {
    expect(COMPASS_16[sectorIndex(0)]).toBe('N');
    expect(COMPASS_16[sectorIndex(90)]).toBe('E');
    expect(COMPASS_16[sectorIndex(180)]).toBe('S');
    expect(COMPASS_16[sectorIndex(270)]).toBe('W');
    expect(COMPASS_16[sectorIndex(360)]).toBe('N');
  });

  it('fmt renders an en-dash for null/NaN gaps (never a fake 0)', () => {
    expect(fmt(null)).toBe('–');
    expect(fmt(undefined)).toBe('–');
    expect(fmt(NaN)).toBe('–');
    expect(fmt(12.345, 1)).toBe('12.3');
  });
});
