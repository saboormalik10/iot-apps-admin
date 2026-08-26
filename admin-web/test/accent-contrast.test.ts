import { describe, it, expect } from 'vitest';

import { checkAccent, contrast, foregroundFor, hexToHslTriple, strongStepFor } from '@/lib/branding/color';

/**
 * Accent contrast guard rails (M20 W3).
 *
 * The maths mirrors `backend/src/utils/contrast.util.ts`, which mirrors the
 * dataviz `validate_palette.js`. The table below is the SHARED CONTRACT: these
 * exact values were verified against the backend implementation, so if either
 * side is edited independently this test fails rather than the two quietly
 * disagreeing about whether a customer's colour is usable.
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

describe('accent contrast — shared contract with the backend', () => {
  it.each(EXPECTED)('%s matches the backend verdict exactly', (hex, passes, fg, text, light, dark) => {
    const r = checkAccent(hex);
    expect(r.passes).toBe(passes);
    expect(r.foreground).toBe(fg);
    expect(r.textRatio).toBeCloseTo(text, 1);
    expect(r.lightRatio).toBeCloseTo(light, 1);
    expect(r.darkRatio).toBeCloseTo(dark, 1);
  });
});

describe('contrast', () => {
  it('is 21:1 between black and white, the maximum', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('is 1:1 for a colour against itself', () => {
    expect(contrast('#1f6feb', '#1f6feb')).toBeCloseTo(1, 5);
  });

  it('is symmetric — order of arguments cannot change the answer', () => {
    expect(contrast('#1f6feb', '#ffffff')).toBeCloseTo(contrast('#ffffff', '#1f6feb'), 10);
  });
});

describe('foregroundFor', () => {
  it('picks white on a dark accent and black on a light one', () => {
    expect(foregroundFor('#1f2937')).toBe('#ffffff');
    expect(foregroundFor('#fef08a')).toBe('#000000');
  });
});

describe('checkAccent', () => {
  it('REJECTS a colour that works in light mode but vanishes in dark', () => {
    // The reason both themes are checked: whoever picks the colour is usually
    // not the person who later opens the panel in dark mode.
    const r = checkAccent('#0b0f17');
    expect(r.passes).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/dark background/i);
  });

  it('rejects a colour that vanishes in light mode', () => {
    const r = checkAccent('#fffff0');
    expect(r.passes).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/light background/i);
  });

  it('explains WHY, with the ratio, so a brand colour can be adjusted', () => {
    const r = checkAccent('#facc15');
    expect(r.reasons[0]).toMatch(/1\.5:1/);
  });

  it('reports no reasons when it passes', () => {
    expect(checkAccent('#1f6feb').reasons).toEqual([]);
  });
});

describe('hexToHslTriple', () => {
  it('emits the channel triple the design tokens are written in', () => {
    // Not a hex: the tokens are HSL channels so Tailwind can compose an alpha
    // (`bg-primary/10`), and a hex override would break every tinted surface.
    expect(hexToHslTriple('#ffffff')).toBe('0 0% 100%');
    expect(hexToHslTriple('#000000')).toBe('0 0% 0%');
  });

  it('round-trips a real accent to the right hue', () => {
    expect(hexToHslTriple('#1f6feb')).toMatch(/^21[0-6] \d+% \d+%$/);
  });

  it('reports zero saturation for a grey, not a stray hue', () => {
    expect(hexToHslTriple('#808080')).toBe('0 0% 50%');
  });
});

/** Composite `fg` at `alpha` over `bg` — how a `/10` tint is actually rendered. */
function over(fg: string, bg: string, alpha: number): string {
  const rgb = (hex: string) => {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  };
  const f = rgb(fg);
  const b = rgb(bg);
  return '#' + f.map((c, i) => Math.round((c * alpha + b[i] * (1 - alpha)) * 255).toString(16).padStart(2, '0')).join('');
}

describe('strongStepFor — text on a 10% tint of the accent', () => {
  // This is the case axe caught: an accent can clear 3:1 against the PAGE and
  // still fail 4.5:1 against a pale wash of itself, which is what the active
  // nav item puts text on. The design tokens ship a hand-tuned `--primary-strong`
  // for the default accent; a customer accent needs the same treatment derived.
  const ACCENTS = ['#1f6feb', '#0d9488', '#7c3aed', '#facc15', '#b91c1c', '#334155'];

  it.each(ACCENTS)('%s produces a step that clears AA on its own tint', (accent) => {
    const tint = over(accent, '#ffffff', 0.1);
    expect(contrast(strongStepFor(accent), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it('actually darkens an accent that fails on its tint', () => {
    const tint = over('#1f6feb', '#ffffff', 0.1);
    expect(contrast('#1f6feb', tint)).toBeLessThan(4.5); // the bug, before the fix
    expect(contrast(strongStepFor('#1f6feb'), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it('barely moves an accent that already passes', () => {
    // Darkening further than necessary would drift away from the brand colour.
    const before = hexToHslTriple('#7c3aed').split(' ')[2];
    const after = hexToHslTriple(strongStepFor('#7c3aed')).split(' ')[2];
    expect(Math.abs(parseFloat(before) - parseFloat(after))).toBeLessThanOrEqual(2);
  });

  it('keeps the hue, so the step still reads as the same brand colour', () => {
    const hue = (hex: string) => parseFloat(hexToHslTriple(hex).split(' ')[0]);
    expect(Math.abs(hue('#0d9488') - hue(strongStepFor('#0d9488')))).toBeLessThanOrEqual(3);
  });
});

describe('strongStepFor — the DARK surface (M24 W2)', () => {
  const ACCENTS = ['#1f6feb', '#0d9488', '#7c3aed', '#facc15', '#b91c1c', '#334155'];
  // The dark CARD, not the dark page — the tinted nav item sits on the card, and
  // deriving against the page under-lightens the step (measured 3.87:1).
  const DARK = '#222220';

  it.each(ACCENTS)('%s clears AA on its tint over the dark surface', (accent) => {
    const tint = over(accent, DARK, 0.1);
    expect(contrast(strongStepFor(accent, DARK), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it('LIGHTENS on dark, where the old darken-only rule made contrast worse', () => {
    // The regression this locks: `strongStepFor` darkened unconditionally, so on
    // the dark surface it walked the text towards its own background. Measured on
    // the live dashboard as #1466e1 on #222a34 — 2.77:1.
    const l = (hex: string) => parseFloat(hexToHslTriple(hex).split(' ')[2]);
    expect(l(strongStepFor('#1f6feb', DARK))).toBeGreaterThan(l('#1f6feb'));
  });

  it('gives a different step per surface, so one value cannot serve both', () => {
    expect(strongStepFor('#1f6feb', '#ffffff')).not.toBe(strongStepFor('#1f6feb', DARK));
  });
});
