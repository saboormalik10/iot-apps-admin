import type { PaletteRole } from '@/lib/api/scales';

/** Categorical series roles, in fixed order (never cycled past 8) — plan §4. */
export const SERIES_ROLES: PaletteRole[] = [
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8',
];

export const roleColor = (role: PaletteRole): string => `hsl(var(--${role}))`;
export const seriesColor = (i: number): string => roleColor(SERIES_ROLES[i % SERIES_ROLES.length]);

/** Format a possibly-null number; renders an en-dash for gaps (never a fake 0). */
export function fmt(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '–';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Build a CSV string from column headers + row objects, then trigger a download. */
export function downloadCsv(filename: string, columns: string[], rows: Array<Record<string, unknown>>): void {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => escape(r[c])).join(','))];
  triggerDownload(filename, new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
}

/** Serialize an <svg> element to a PNG and download it (client-only). */
export function downloadSvgPng(svg: SVGSVGElement | null, filename: string, scale = 2): void {
  if (!svg || typeof window === 'undefined') return;
  const rect = svg.getBoundingClientRect();
  const w = rect.width || 640;
  const h = rect.height || 360;
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  const svg64 = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(xml)))}`;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob((blob) => blob && triggerDownload(filename, blob));
  };
  img.src = svg64;
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 16-point compass sector label for a bearing in degrees. */
export const COMPASS_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];
export function sectorIndex(deg: number): number {
  return Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
}
