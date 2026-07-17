import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { ChartTextureDefs, textureFill, texturePatternId } from '@/components/charts/chart-texture';
import { SERIES_ROLES } from '@/components/charts/chart-utils';

/**
 * The texture channel (plan §Month 12) is the backup encoding for CVD / grayscale
 * print / forced-colors. Its rules come from the dataviz method and are easy to
 * regress silently, so they're pinned here.
 */

const css = () => fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
const tokens = () => fs.readFileSync(path.join(process.cwd(), 'styles/tokens.css'), 'utf8');

describe('ChartTextureDefs', () => {
  it('emits one pattern per role, and textureFill points at it', () => {
    const { container } = render(
      <svg>
        <ChartTextureDefs />
      </svg>,
    );
    for (const role of SERIES_ROLES) {
      const pattern = container.querySelector(`#${texturePatternId(role)}`);
      expect(pattern, `missing pattern for ${role}`).toBeTruthy();
      expect(textureFill(role)).toBe(`url(#${texturePatternId(role)})`);
    }
  });

  it('uses only 45° and its 135° mirror — never horizontal/vertical, which read as gridlines', () => {
    const { container } = render(
      <svg>
        <ChartTextureDefs />
      </svg>,
    );
    const angles = [...container.querySelectorAll('pattern')].map((p) =>
      p.getAttribute('patternTransform'),
    );
    expect(angles.length).toBe(SERIES_ROLES.length);
    for (const a of angles) expect(a).toMatch(/rotate\((45|135)\)/);
  });

  it('gives adjacent categorical slots different angles — that is what carries identity once hue is gone', () => {
    const { container } = render(
      <svg>
        <ChartTextureDefs />
      </svg>,
    );
    const angles = [...container.querySelectorAll('pattern')].map((p) => p.getAttribute('patternTransform'));
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i], `slot ${i} repeats the previous angle`).not.toBe(angles[i - 1]);
    }
  });

  it('paints the flat role colour as the pattern base, so texture-off is identical to a solid fill', () => {
    const { container } = render(
      <svg>
        <ChartTextureDefs roles={['chart-1']} />
      </svg>,
    );
    const base = container.querySelector('pattern rect');
    expect(base?.getAttribute('fill')).toBe('hsl(var(--chart-1))');
  });

  it('inks tone-on-tone from the fill’s own hue, not a shared black', () => {
    const { container } = render(
      <svg>
        <ChartTextureDefs roles={['chart-2']} />
      </svg>,
    );
    const ink = container.querySelector('.chart-texture-ink');
    expect(ink?.getAttribute('stroke')).toContain('--chart-2-ink');
  });
});

describe('texture trigger (CSS, not React — print and forced-colors never re-render)', () => {
  it('is off by default', () => {
    expect(css()).toMatch(/\.chart-texture-ink\s*\{\s*opacity:\s*0;/);
  });

  it('turns on for the opt-in setting, print, and forced-colors', () => {
    const s = css();
    expect(s).toContain("[data-texture='on'] .chart-texture-ink");
    expect(s).toMatch(/@media print/);
    expect(s).toMatch(/@media \(forced-colors: active\)/);
  });

  it('defines an ink token for every categorical role, in both modes', () => {
    const t = tokens();
    for (const role of SERIES_ROLES) {
      // once for light (:root) and once for the dark block
      const hits = t.match(new RegExp(`--${role}-ink:`, 'g')) ?? [];
      expect(hits.length, `--${role}-ink should be defined for light and dark`).toBeGreaterThanOrEqual(2);
    }
  });
});
