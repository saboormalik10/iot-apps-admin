#!/usr/bin/env node
/**
 * The colour gate. Reads styles/tokens.css — the single source of truth — and
 * checks every colour role that encodes data, in both themes:
 *
 *   series      the 8 categorical slots, adjacent pairs (lines, bars, stacks)
 *   series 1–3  all pairs (small multiples, scatter — any two can sit together)
 *   ordinal     --ord-1..5, the wind-rose speed bins: one hue, monotone, visible steps
 *   sequential  --seq-1..7, the heatmaps: lightness strictly monotone
 *   diverging   --div-neg/--div-pos: poles ≥ 3:1 on the surface, midpoint ~neutral
 *   status text each severity's -strong ink on its own tint and on the card ≥ 4.5:1
 *
 * The categorical and ordinal checks are scripts/viz/checks.mjs, measured in
 * OKLab with Machado 2009 CVD simulation. An earlier in-house script measured
 * ΔE00 and treated colour-blind separation as advisory; the palette it passed
 * had two dark-mode greens 6 ΔE apart, and a red and a yellow that collapsed to
 * 2.9 under deuteranopia. This one fails the build instead.
 *
 * Usage: node scripts/validate_palette.mjs           (both modes)
 *        node scripts/validate_palette.mjs --mode dark
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrast, validate, validateOrdinal } from '../lib/viz/checks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'styles', 'tokens.css'), 'utf8');

const BLOCKS = { light: ':root {', dark: ":root[data-theme='dark'] {" };

function block(mode) {
  const start = css.indexOf(BLOCKS[mode]);
  return css.slice(start, css.indexOf('\n}', start));
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function token(b, name) {
  const m = b.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!m) throw new Error(`token --${name} not found`);
  return hslToHex(+m[1], +m[2], +m[3]);
}

/** OKLCH lightness, for the monotonicity checks the categorical validator does not cover. */
function oklchL(hex) {
  const lin = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720453 * s;
}

let failed = false;
const line = (ok, name, detail) => {
  if (ok === false) failed = true;
  const mark = ok === true ? 'PASS' : ok === 'warn' ? 'WARN' : 'FAIL';
  console.log(`  [${mark}] ${name.padEnd(22)} ${detail}`);
};

function report(title, result) {
  console.log(`  ${title}`);
  for (const [name, state, detail] of result.report) {
    // States are booleans or words: pass / floor (CVD 6–8 band) / relief
    // (sub-3:1, legal only with a table view) / fail.
    const ok = state === true || state === 'pass' ? true : state === 'floor' || state === 'relief' ? 'warn' : false;
    line(ok, `  ${name}`, typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  if (!result.ok) failed = true;
}

const argv = process.argv.slice(2);
const only = argv.includes('--mode') ? argv[argv.indexOf('--mode') + 1] : null;

for (const mode of only ? [only] : ['light', 'dark']) {
  const b = block(mode);
  const surface = token(b, 'chart-surface');
  const card = token(b, 'card');
  console.log(`\n── ${mode} · chart surface ${surface} ${'─'.repeat(40)}`);

  const series = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => token(b, `chart-${i}`));
  report(`series (adjacent) ${series.join(' ')}`, validate(series, { mode, surface, pairs: 'adjacent' }));
  report('series 1–3 (all pairs)', validate(series.slice(0, 3), { mode, surface, pairs: 'all' }));

  const ord = [1, 2, 3, 4, 5].map((i) => token(b, `ord-${i}`));
  report(`ordinal ${ord.join(' ')}`, validateOrdinal(ord, { mode, surface }));

  const seq = [1, 2, 3, 4, 5, 6, 7].map((i) => token(b, `seq-${i}`));
  const L = seq.map(oklchL);
  // Light mode: low values are pale and grow darker. Dark mode flips the anchor
  // so "nothing" recedes into the dark surface and a heavy value glows.
  const rising = L.every((v, i) => i === 0 || v > L[i - 1]);
  const falling = L.every((v, i) => i === 0 || v < L[i - 1]);
  console.log(`  sequential ${seq.join(' ')}`);
  line(mode === 'light' ? falling : rising, '  lightness monotone', L.map((v) => v.toFixed(2)).join(' → '));

  const neg = token(b, 'div-neg');
  const pos = token(b, 'div-pos');
  const mid = token(b, 'div-mid');
  console.log(`  diverging ${neg} ← ${mid} → ${pos}`);
  line(contrast(neg, surface) >= 3 && contrast(pos, surface) >= 3, '  poles ≥ 3:1', `${contrast(neg, surface).toFixed(2)} / ${contrast(pos, surface).toFixed(2)}`);

  console.log('  status ink (WCAG text, 4.5:1)');
  for (const sev of ['alert', 'warning', 'info', 'normal', 'cleared', 'offline']) {
    const ink = token(b, `sev-${sev}-strong`);
    const tint = token(b, `sev-${sev}-tint`);
    const onTint = contrast(ink, tint);
    const onCard = contrast(ink, card);
    line(onTint >= 4.5 && onCard >= 4.5, `  ${sev}`, `${onTint.toFixed(2)} on tint · ${onCard.toFixed(2)} on card`);
  }
}

console.log(failed ? '\n✗ colour gate FAILED' : '\n✓ colour gate passed');
process.exit(failed ? 1 : 0);
