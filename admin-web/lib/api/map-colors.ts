import { NTU_CLASSES, ntuClassIndex } from './scales';

/**
 * MAP-ONLY colours. MapLibre GL paint properties can't reference CSS custom
 * properties (WebGL needs literal colours), so these hex ramps are the ONE place
 * literal hex is allowed — for GL layers only (mirrors the Month-8 GPS-track line
 * decision). Everywhere off the map, use the CSS `--role` design tokens.
 *
 * Turbidity is shown as a SEQUENTIAL SINGLE HUE (blue: light = clear → dark =
 * turbid), one stop per WHO/EPA NTU class (plan §6 "trail coloured by turbidity
 * (sequential hue)" + gps-density "sequential single hue"). Aligned to the 7
 * `NTU_CLASSES` boundaries so the map agrees with the histogram/badges.
 */
export const NTU_BLUE_RAMP = [
  '#cde2fb', // 0–1     WHO drinking compliant (lightest)
  '#a9cdf5', // 1–10    EPA recreational safe
  '#7fb0ec', // 10–50   slightly turbid
  '#5b97e0', // 50–100  moderately turbid
  '#3b78cf', // 100–500 turbid
  '#245ba8', // 500–1000 highly turbid
  '#0d366b', // >1000   extreme / flood (darkest)
];

/** Hex for a turbidity reading, by its WHO/EPA class — map layers only. */
export function ntuHex(ntu: number | null | undefined): string {
  if (ntu == null) return '#9ca3af'; // neutral gray for "no reading" (never plotted as 0)
  return NTU_BLUE_RAMP[ntuClassIndex(ntu)];
}

/** The legend rows for a turbidity map layer (label + hex), in class order. */
export const NTU_LEGEND = NTU_CLASSES.map((c, i) => ({
  label: c.label,
  waterQualityClass: c.waterQualityClass,
  hex: NTU_BLUE_RAMP[i],
}));
