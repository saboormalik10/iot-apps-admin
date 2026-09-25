'use client';

import { useBranding } from '@/features/org/use-branding';
import { hexToHslTriple, strongStepFor, CARD_DARK, CARD_LIGHT } from '@/lib/branding/color';

/**
 * Repaints the theme's primary tokens with the customer's accent.
 *
 * Overrides the TOKENS rather than restyling components, so every button, link,
 * focus ring and tinted surface follows automatically — including ones added
 * later. The tokens are HSL channels so Tailwind can still compose an alpha
 * (`bg-primary/10`), which is why the accent is converted rather than injected
 * as a hex.
 *
 * Applied to BOTH themes with the same colour: the server refuses any accent
 * that fails 3:1 against either surface, so the one value is legible in each.
 * The foreground is derived, never chosen by the customer.
 *
 * Renders nothing when no accent is set, leaving the platform default intact.
 */
export function BrandAccent() {
  const { data: branding } = useBranding();
  const accent = branding?.accentColor?.trim();
  if (!accent) return null;

  const hsl = hexToHslTriple(accent);
  const fg = hexToHslTriple(branding?.accentForeground?.trim() || '#ffffff');

  /**
   * `--primary-strong` is the step used for text sitting on a 10% tint of the
   * accent — the active nav item. Pointing it at the accent itself broke that
   * item's contrast (4.07:1, caught by axe in M20 W3), because passing 3:1
   * against the page says nothing about a pale wash of the same colour.
   *
   * It is derived PER SURFACE (M24 W2). One value cannot serve both: on white the
   * safe step is darker, on the dark surface it is lighter. Emitting the light
   * step into dark mode measured 2.77:1 on the live dashboard.
   */
  const strongLight = hexToHslTriple(strongStepFor(accent, CARD_LIGHT));
  const strongDark = hexToHslTriple(strongStepFor(accent, CARD_DARK));

  const base = `--primary: ${hsl}; --primary-foreground: ${fg}; --ring: ${hsl};`;
  const light = `${base} --primary-strong: ${strongLight};`;
  const dark = `${base} --primary-strong: ${strongDark};`;

  return (
    <style
      /**
       * All THREE of the token file's selectors, in its order — `:root`,
       * `:root[data-theme='dark']`, and the system-preference block. The last one
       * was missing: a viewer on system-dark sets no `data-theme`, so only the
       * `:root` rule applied and they received the light-surface strong step.
       *
       * Equal specificity, later in the document, so these win without
       * `!important`.
       */
      dangerouslySetInnerHTML={{
        __html:
          `:root{${light}}` +
          `:root[data-theme='dark']{${dark}}` +
          `@media (prefers-color-scheme: dark){:root:not([data-theme='light']){${dark}}}`,
      }}
    />
  );
}
