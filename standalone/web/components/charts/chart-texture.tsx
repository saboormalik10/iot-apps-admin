import { SERIES_ROLES } from './chart-utils';
import type { PaletteRole } from '@/lib/api/scales';

/**
 * The texture channel (plan §12 / §Month 12) — the backup encoding for where hue
 * fails: full-severity CVD, grayscale print, and `forced-colors`.
 *
 * Design constraints (dataviz method):
 *  - ONE directional fill, used at 45° and its 135° mirror only. Never
 *    horizontal/vertical — those read as gridlines or bars.
 *  - Inked tone-on-tone (a darker step of the fill's own hue), equal loudness
 *    across slots, so texture never restates magnitude on a categorical scale.
 *  - Never on by default. It is decoration if it is always visible.
 *
 * How the trigger works — and why there is no JS in it: each pattern paints the
 * role's SOLID colour as its base and draws the ink on top at `opacity: 0`. So a
 * mark filled with `url(#chart-texture-chart-1)` is pixel-identical to the flat
 * colour until CSS reveals the ink. That lets `@media print` and
 * `(forced-colors: active)` switch the channel on in contexts where a React
 * re-render never happens — the print dialog and forced-colors mode both bypass
 * JS entirely. The opt-in setting rides the same CSS via a `data-texture`
 * attribute on <html>. See styles/tokens.css.
 *
 * Angle alternates per slot so ADJACENT categorical series always differ in
 * direction, which is what carries identity once hue is gone.
 */

export const texturePatternId = (role: PaletteRole) => `chart-texture-${role}`;

/** Fill value for a mark that should carry the texture channel. */
export const textureFill = (role: PaletteRole) => `url(#${texturePatternId(role)})`;

/** 45° for even slots, its 135° mirror for odd — adjacent series never share an angle. */
const angleFor = (index: number) => (index % 2 === 0 ? 45 : 135);

/**
 * SVG <defs> holding one pattern per categorical role. Render once inside each
 * chart's own <svg> (pattern references are scoped to the document, but keeping
 * them inline keeps PNG export self-contained).
 */
export function ChartTextureDefs({ roles = SERIES_ROLES }: { roles?: PaletteRole[] }) {
  return (
    <defs aria-hidden>
      {roles.map((role, i) => (
        <pattern
          key={role}
          id={texturePatternId(role)}
          width={6}
          height={6}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${angleFor(i)})`}
        >
          {/* Base: the flat role colour. Keeps the mark identical when texture is off. */}
          <rect width={6} height={6} fill={`hsl(var(--${role}))`} />
          {/* Ink: tone-on-tone, revealed by CSS only. `currentColor` lets
              forced-colors mode substitute the system ink automatically. */}
          <path
            className="chart-texture-ink"
            d="M -1 1 L 1 -1 M 0 6 L 6 0 M 5 7 L 7 5"
            stroke={`hsl(var(--${role}-ink, var(--chart-ink)))`}
            strokeWidth={1.5}
            shapeRendering="crispEdges"
          />
        </pattern>
      ))}
    </defs>
  );
}
