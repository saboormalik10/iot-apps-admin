/**
 * WCAG contrast for a single brand colour.
 *
 * Maths lifted verbatim from the dataviz `validate_palette.js` (`s2lin`,
 * `relLum`, `contrast`) so the panel and the chart tooling agree on what a ratio
 * is. That script's own guidance is that a LONE status/brand colour is checked
 * with plain WCAG contrast rather than the categorical-palette checks — a single
 * accent has no adjacent pairs and no CVD-separation question.
 *
 * Why this is enforced at all: a customer is choosing a colour for THEIR OWN
 * panel, and the obvious choices (a pale corporate yellow, a near-white grey)
 * produce buttons nobody can read. Rejecting is kinder than shipping an
 * unusable interface with their logo on it.
 */

/** Surfaces the accent is drawn against, from the app's own tokens. */
export const SURFACE_LIGHT = '#ffffff';
export const SURFACE_DARK = '#0b0f17';

/** WCAG AA: normal text on a filled control. */
export const TEXT_ON_ACCENT_MIN = 4.5;
/** WCAG AA: a non-text UI component (the filled control itself) vs the page. */
export const ACCENT_VS_SURFACE_MIN = 3.0;

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
};

const s2lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const relLum = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map(s2lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two `#rrggbb` colours. 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The readable text colour to place ON this accent.
 *
 * Chosen rather than configured: asking a customer to pick a foreground too is
 * one more way to get an unreadable button, and there are only two sensible
 * answers.
 */
export function foregroundFor(accent: string): '#ffffff' | '#000000' {
  return contrast(accent, '#ffffff') >= contrast(accent, '#000000') ? '#ffffff' : '#000000';
}

export interface AccentCheck {
  accent: string;
  foreground: '#ffffff' | '#000000';
  /** Contrast of the chosen foreground against the accent. */
  textRatio: number;
  /** Contrast of the accent against each surface it is drawn on. */
  lightRatio: number;
  darkRatio: number;
  /** True when the accent is usable in BOTH themes. */
  passes: boolean;
  reasons: string[];
}

/**
 * Judge an accent for use as a filled control in both themes.
 *
 * BOTH themes are checked, not just the current one: a colour that works in
 * light mode and vanishes in dark is still a broken panel for whoever uses dark
 * mode, and the customer picking it usually will not be the one who finds out.
 */
export function checkAccent(accent: string): AccentCheck {
  const foreground = foregroundFor(accent);
  const textRatio = contrast(accent, foreground);
  const lightRatio = contrast(accent, SURFACE_LIGHT);
  const darkRatio = contrast(accent, SURFACE_DARK);

  const reasons: string[] = [];
  if (textRatio < TEXT_ON_ACCENT_MIN) {
    reasons.push(`text on this colour reaches only ${textRatio.toFixed(1)}:1 (needs ${TEXT_ON_ACCENT_MIN}:1)`);
  }
  if (lightRatio < ACCENT_VS_SURFACE_MIN) {
    reasons.push(`it nearly disappears on a light background (${lightRatio.toFixed(1)}:1, needs ${ACCENT_VS_SURFACE_MIN}:1)`);
  }
  if (darkRatio < ACCENT_VS_SURFACE_MIN) {
    reasons.push(`it nearly disappears on a dark background (${darkRatio.toFixed(1)}:1, needs ${ACCENT_VS_SURFACE_MIN}:1)`);
  }

  return {
    accent,
    foreground,
    textRatio: Math.round(textRatio * 100) / 100,
    lightRatio: Math.round(lightRatio * 100) / 100,
    darkRatio: Math.round(darkRatio * 100) / 100,
    passes: reasons.length === 0,
    reasons,
  };
}
