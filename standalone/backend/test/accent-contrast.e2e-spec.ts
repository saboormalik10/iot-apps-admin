import { checkAccent, contrast, foregroundFor } from '../src/utils/contrast.util';

/**
 * Accent contrast guard rails — SERVER SIDE (M20 W3).
 *
 * The same table as `admin-web/test/accent-contrast.test.ts`. Keeping the two
 * identical is the point: the client explains the verdict live, the server
 * enforces it, and a drift between them would mean a customer is told their
 * colour is fine and then refused.
 */

/** [accent, passes, foreground, textRatio, lightRatio, darkRatio] */
const EXPECTED: [string, boolean, string, number, number, number][] = [
  ['#1f6feb', true, '#ffffff', 4.63, 4.63, 4.14],
  ['#0d9488', true, '#000000', 5.61, 3.74, 5.12],
  ['#7c3aed', true, '#ffffff', 5.7, 5.7, 3.37],
  ['#ffff00', false, '#000000', 19.56, 1.07, 17.86],
  ['#ffffff', false, '#000000', 21, 1, 19.18],
  ['#000000', false, '#ffffff', 21, 21, 1.09],
  ['#facc15', false, '#000000', 13.71, 1.53, 12.52],
];

describe('accent contrast — shared contract with the client', () => {
  it.each(EXPECTED)('%s matches the client verdict exactly', (hex, passes, fg, text, light, dark) => {
    const r = checkAccent(hex);
    expect(r.passes).toBe(passes);
    expect(r.foreground).toBe(fg);
    expect(r.textRatio).toBeCloseTo(text, 1);
    expect(r.lightRatio).toBeCloseTo(light, 1);
    expect(r.darkRatio).toBeCloseTo(dark, 1);
  });
});

describe('contrast', () => {
  it('is 21:1 between black and white', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('is symmetric', () => {
    expect(contrast('#1f6feb', '#ffffff')).toBeCloseTo(contrast('#ffffff', '#1f6feb'), 10);
  });

  it('tolerates a missing leading #', () => {
    expect(contrast('1f6feb', '#ffffff')).toBeCloseTo(contrast('#1f6feb', '#ffffff'), 10);
  });
});

describe('foregroundFor', () => {
  it('never leaves text unreadable on an accepted accent', () => {
    // Every accent the service accepts must carry text at 4.5:1 with the
    // foreground we derive — that is the promise the guard rail makes.
    for (const [hex, passes] of EXPECTED) {
      if (!passes) continue;
      expect(contrast(hex, foregroundFor(hex))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('checkAccent', () => {
  it('checks BOTH themes, not just the one the customer is using', () => {
    expect(checkAccent('#0b0f17').passes).toBe(false);
    expect(checkAccent('#fffff0').passes).toBe(false);
  });

  it('names the ratio in the reason, so a brand colour can be adjusted', () => {
    expect(checkAccent('#facc15').reasons[0]).toMatch(/1\.5:1/);
  });

  it('accepts the platform default, which must not fail its own rule', () => {
    expect(checkAccent('#1f6feb').passes).toBe(true);
  });
});
