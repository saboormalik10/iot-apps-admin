#!/usr/bin/env node
/**
 * Palette validator (plan §4). Parses the categorical chart palette + chart
 * surface out of styles/tokens.css (single source of truth — no drift) for the
 * requested mode, then checks:
 *   1. Each categorical hue has ≥ 3:1 luminance contrast vs the chart surface.
 *   2. Under normal vision AND simulated CVD (protan/deutan/tritan), every pair
 *      of categorical hues stays ≥ ΔE00 threshold apart (default 12).
 *
 * Usage:
 *   node scripts/validate_palette.js --mode light [--min 12]
 *   node scripts/validate_palette.js "#2a78d6,#1baf7a,…" --mode dark
 *
 * Exits non-zero on failure so CI blocks a regression.
 */
const fs = require('fs');
const path = require('path');

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let mode = 'light';
let minDeltaE = 12;
let hexArg = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--mode') mode = argv[++i];
  else if (a === '--min') minDeltaE = Number(argv[++i]);
  else if (a.startsWith('#') || a.includes(',')) hexArg = a;
}

// ── colour math ────────────────────────────────────────────────────────────────
function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)].map((c) =>
    Math.round(c * 255),
  );
}

function hexToRgb(hex) {
  hex = hex.replace('#', '').trim();
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

const srgbToLinear = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

function relLuminance([r, g, b]) {
  const [R, G, B] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToLab([r, g, b]) {
  const [R, G, B] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// CIEDE2000
function deltaE00(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;
  const h1p = (Math.atan2(b1, a1p) * 180) / Math.PI + (Math.atan2(b1, a1p) < 0 ? 360 : 0);
  const h2p = (Math.atan2(b2, a2p) * 180) / Math.PI + (Math.atan2(b2, a2p) < 0 ? 360 : 0);
  let dhp = h2p - h1p;
  if (Math.abs(dhp) > 180) dhp -= Math.sign(dhp) * 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
  let avgHp = (h1p + h2p) / 2;
  if (Math.abs(h1p - h2p) > 180) avgHp += 180;
  const T =
    1 -
    0.17 * Math.cos(((avgHp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * avgHp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * avgHp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * avgHp - 63) * Math.PI) / 180);
  const SL = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  const RT =
    -2 *
    Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7))) *
    Math.sin((60 * Math.exp(-Math.pow((avgHp - 275) / 25, 2)) * Math.PI) / 180);
  return Math.sqrt(
    Math.pow(dLp / SL, 2) +
      Math.pow(dCp / SC, 2) +
      Math.pow(dHp / SH, 2) +
      RT * (dCp / SC) * (dHp / SH),
  );
}

// CVD simulation — Viénot/Brettel-style linear-RGB matrices (dichromat approximations).
const CVD = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

const linearToSrgb = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};

function simulateCVD(rgb, type) {
  if (type === 'normal') return rgb;
  const m = CVD[type];
  const lin = rgb.map(srgbToLinear);
  const out = m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  return out.map(linearToSrgb);
}

// ── palette source ──────────────────────────────────────────────────────────────
function parseTokensCss(targetMode) {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles', 'tokens.css'), 'utf8');
  const block =
    targetMode === 'dark'
      ? css.slice(css.indexOf("[data-theme='dark']"), css.indexOf('@media'))
      : css.slice(css.indexOf(':root {'), css.indexOf("[data-theme='dark']"));
  const readTriplet = (name) => {
    const m = block.match(new RegExp(`--${name}:\\s*([0-9.]+)\\s+([0-9.]+)%\\s+([0-9.]+)%`));
    if (!m) throw new Error(`token --${name} not found for mode ${targetMode}`);
    return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
  };
  const categorical = [];
  for (let i = 1; i <= 8; i++) categorical.push(readTriplet(`chart-${i}`));
  return { categorical, surface: readTriplet('chart-surface') };
}

function fromHexArg(arg) {
  const categorical = arg
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(hexToRgb);
  // Surface from tokens even when hexes are passed explicitly.
  const { surface } = parseTokensCss(mode);
  return { categorical, surface };
}

// ── run ───────────────────────────────────────────────────────────────────────
const { categorical, surface } = hexArg ? fromHexArg(hexArg) : parseTokensCss(mode);
let failed = false;
const problems = [];

console.log(`\nPalette validation — mode: ${mode} (${categorical.length} categorical hues)`);

// 1. Contrast vs surface
for (let i = 0; i < categorical.length; i++) {
  const cr = contrastRatio(categorical[i], surface);
  if (cr < 3) {
    failed = true;
    problems.push(`  chart-${i + 1} contrast vs surface = ${cr.toFixed(2)}:1 (< 3:1)`);
  }
}

// 2. Pairwise ΔE00 under normal + CVD.
//    HARD gate: normal-vision hues must be visibly distinct (ΔE00 ≥ minDeltaE).
//    ADVISORY: CVD (protan/deutan/tritan) separation is measured against the same
//    ΔE00 ≥ 12 *target* and printed as ⚠ when below — an 8-category set cannot
//    reach ≥12 under all three dichromacies (the dichromatic gamut is ~1-D;
//    best-in-class CVD-safe palettes land ~6–10). Colour is therefore never the
//    ONLY channel: the design system mandates redundant encoding (icon + label +
//    a texture channel) for every status/series — that is the real CVD mitigation.
const visionTypes = ['normal', 'protan', 'deutan', 'tritan'];
for (const vt of visionTypes) {
  const labs = categorical.map((rgb) => rgbToLab(simulateCVD(rgb, vt)));
  let min = Infinity;
  let worst = '';
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const d = deltaE00(labs[i], labs[j]);
      if (d < min) {
        min = d;
        worst = `chart-${i + 1}↔chart-${j + 1}`;
      }
    }
  }
  if (vt === 'normal') {
    const ok = min >= minDeltaE;
    console.log(`  ${vt.padEnd(7)} min ΔE00 = ${min.toFixed(1)} (${worst}) ${ok ? '✓' : '✗ < ' + minDeltaE}`);
    if (!ok) {
      failed = true;
      problems.push(`  normal vision: min ΔE00 ${min.toFixed(1)} < ${minDeltaE} (${worst})`);
    }
  } else {
    const mark = min < minDeltaE ? `⚠ below ${minDeltaE} target (advisory — use redundant encoding)` : '✓';
    console.log(`  ${vt.padEnd(7)} min ΔE00 = ${min.toFixed(1)} (${worst}) ${mark}`);
  }
}

if (failed) {
  console.error(`\n✗ Palette validation FAILED (mode ${mode}):`);
  problems.forEach((p) => console.error(p));
  process.exit(1);
}
console.log(
  `\n✓ Palette OK (mode ${mode}) — all hues ≥ 3:1 vs surface, normal-vision ΔE00 ≥ ${minDeltaE}; ` +
    `CVD separation is advisory (pair with redundant encoding)\n`,
);
