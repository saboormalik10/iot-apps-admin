/**
 * Colour maths for the customer accent.
 *
 * Mirrors `backend/src/utils/contrast.util.ts`, which in turn mirrors the
 * dataviz `validate_palette.js`. The SERVER is the gate — it refuses an
 * unreadable accent on save — and this exists only so the picker can say so
 * before the round trip. `test/accent-contrast.test.ts` pins both to the same
 * expected values so they cannot quietly drift apart.
 */

export const SURFACE_LIGHT = '#ffffff';
export const SURFACE_DARK = '#0b0f17';

/**
 * The CARD surface per theme — what a tinted element actually sits on.
 *
 * Distinct from `SURFACE_*` above, which are the PAGE surfaces used by
 * `checkAccent` for its 3:1 test. They are not interchangeable, and treating
 * them as such is a measurable bug: the active nav item is a 10% accent tint
 * over the CARD, and the dark card (`--card: 60 2% 13%` → #222220) is far
 * lighter than the dark page (#0b0f17). Deriving the strong step against the
 * page produced a tint of #0d192c when the real background was #222a34, so the
 * step came out under-lightened at 3.87:1 against the 4.5:1 it must clear
 * (M24 W2).
 *
 * Light `--card` is `0 0% 100%`, which is exactly SURFACE_LIGHT — so only the
 * dark side ever differed, which is why this went unnoticed.
 */
export const CARD_LIGHT = '#ffffff';
export const CARD_DARK = '#222220';
export const TEXT_ON_ACCENT_MIN = 4.5;
export const ACCENT_VS_SURFACE_MIN = 3;

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
};

const s2lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const relLum = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map(s2lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(a: string, b: string): number {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function foregroundFor(accent: string): '#ffffff' | '#000000' {
  return contrast(accent, '#ffffff') >= contrast(accent, '#000000') ? '#ffffff' : '#000000';
}

export interface AccentCheck {
  foreground: '#ffffff' | '#000000';
  textRatio: number;
  lightRatio: number;
  darkRatio: number;
  passes: boolean;
  reasons: string[];
}

/** Judge an accent for use as a filled control in BOTH themes. */
export function checkAccent(accent: string): AccentCheck {
  const foreground = foregroundFor(accent);
  const textRatio = contrast(accent, foreground);
  const lightRatio = contrast(accent, SURFACE_LIGHT);
  const darkRatio = contrast(accent, SURFACE_DARK);

  const reasons: string[] = [];
  if (textRatio < TEXT_ON_ACCENT_MIN) reasons.push(`Text on it reaches only ${textRatio.toFixed(1)}:1.`);
  if (lightRatio < ACCENT_VS_SURFACE_MIN) reasons.push(`It nearly disappears on a light background (${lightRatio.toFixed(1)}:1).`);
  if (darkRatio < ACCENT_VS_SURFACE_MIN) reasons.push(`It nearly disappears on a dark background (${darkRatio.toFixed(1)}:1).`);

  return {
    foreground,
    textRatio: Math.round(textRatio * 100) / 100,
    lightRatio: Math.round(lightRatio * 100) / 100,
    darkRatio: Math.round(darkRatio * 100) / 100,
    passes: reasons.length === 0,
    reasons,
  };
}

/**
 * `#rrggbb` → the `h s% l%` triple the design tokens are written in.
 *
 * The tokens are HSL channels rather than whole colours precisely so Tailwind
 * can compose them with an alpha (`bg-primary/10`), so an override has to be in
 * the same shape — a hex here would break every tinted surface.
 */
export function hexToHslTriple(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const hslToHex = (h: number, sPct: number, lPct: number): string => {
  const s = sPct / 100;
  const l = lPct / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  return (
    '#' +
    [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')
  );
};

/** Composite `fg` at `alpha` over `bg`, both `#rrggbb`. */
function over(fg: string, bg: string, alpha: number): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  const mix = f.map((c, i) => c * alpha + b[i] * (1 - alpha));
  return '#' + mix.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

/**
 * A darker step of the accent, for TEXT SITTING ON A 10% TINT of it — the active
 * nav item being the obvious case.
 *
 * This exists because the accent passing 3:1 against the page does NOT mean it
 * passes 4.5:1 against a pale wash of itself; the design tokens carry a
 * hand-tuned `--primary-strong` for exactly that reason. Overriding `--primary`
 * without also deriving this one silently broke the active nav item, which is
 * how axe caught it.
 *
 * Darkens in 2% steps until it clears AA, rather than picking a fixed offset:
 * how far a colour has to move depends entirely on where it starts.
 */
export function strongStepFor(accent: string, surface = SURFACE_LIGHT): string {
  const [h, sPct, lPct] = hexToHslTriple(accent).split(' ').map((v) => parseFloat(v));
  const tint = over(accent, surface, 0.1);
  const tintL = parseFloat(hexToHslTriple(tint).split(' ')[2]);

  /**
   * Step AWAY from the tint, whichever way that is (M24 W2).
   *
   * This used to darken unconditionally, which is right on a light surface — the
   * 10% tint is nearly white, so darkening gains contrast. On the DARK surface
   * the tint is nearly black, so darkening moves the text towards its own
   * background. Measured on the live dashboard: the derived strong step came out
   * at #1466e1 on #222a34 — 2.77:1, against the 4.5:1 this function exists to
   * guarantee.
   */
  if (tintL > 50) {
    for (let l = lPct; l >= 0; l -= 2) {
      const candidate = hslToHex(h, sPct, l);
      if (contrast(candidate, tint) >= TEXT_ON_ACCENT_MIN) return candidate;
    }
    return '#000000';
  }

  for (let l = lPct; l <= 100; l += 2) {
    const candidate = hslToHex(h, sPct, l);
    if (contrast(candidate, tint) >= TEXT_ON_ACCENT_MIN) return candidate;
  }
  return '#ffffff';
}
