import { roundBearing } from '../src/common/bearing';
import { dirFromComponents, dirComponents } from '../src/ingest/minute-aggregate';

/**
 * 360° is not a bearing.
 *
 * Every direction in this product used to be written as
 * `round(((deg % 360) + 360) % 360)` — normalise, then round. That is correct
 * until the rounding carries over the top: 359.95° to whole degrees is 360°,
 * and the query screen (which shows whole degrees) therefore reported "360°"
 * for anything from 359.5° up. QA found 28 stored minutes doing it, 24 Sep 2026.
 */
describe('a bearing stays inside [0, 360)', () => {
  it('rounds a value just short of north back to north, not past it', () => {
    expect(roundBearing(359.95, 0)).toBe(0);
    expect(roundBearing(359.5, 0)).toBe(0);
    expect(roundBearing(359.995)).toBe(0);
    expect(roundBearing(359.999, 1)).toBe(0);
  });

  it('leaves everything else exactly where it was', () => {
    expect(roundBearing(359.4, 0)).toBe(359);
    expect(roundBearing(0)).toBe(0);
    expect(roundBearing(180.004)).toBe(180);
    expect(roundBearing(123.456, 0)).toBe(123);
    expect(roundBearing(89.994, 2)).toBe(89.99);
  });

  it('normalises a bearing that arrives outside the circle', () => {
    expect(roundBearing(-1)).toBe(359);
    expect(roundBearing(360)).toBe(0);
    expect(roundBearing(720.5, 0)).toBe(1);
    // A mast offset that puts a reading past north.
    expect(roundBearing(350 + 15, 1)).toBe(5);
  });

  it('never returns 360 for any input', () => {
    for (let deg = 359; deg < 360; deg += 0.001) {
      for (const dp of [0, 1, 2]) {
        expect(roundBearing(deg, dp)).toBeLessThan(360);
      }
    }
  });

  it('applies to a minute built from readings either side of north', () => {
    // Directions that average to a hair under north must not store 360.
    const c = dirComponents([359.99, 0.0]);
    const dir = dirFromComponents(c);
    expect(dir).not.toBeNull();
    expect(dir).toBeLessThan(360);
    expect(dir).toBeCloseTo(0, 2);
  });
});
