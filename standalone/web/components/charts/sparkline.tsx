import { useId } from 'react';
import type { PaletteRole } from '@/lib/api/scales';
import { roleColor } from './chart-utils';

/**
 * Sparkline — a compact, axis-less trend line for KPI tiles. Null values create
 * gaps (the line breaks) rather than dropping to zero (plan §10.2). Purely
 * decorative on its own, so it's aria-hidden; the tile states the number.
 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  role = 'chart-1',
  strokeWidth = 1.5,
  fill = true,
  className,
}: {
  data: Array<number | null>;
  width?: number;
  height?: number;
  role?: PaletteRole;
  strokeWidth?: number;
  fill?: boolean;
  className?: string;
}) {
  const gradId = useId();
  const nums = data.filter((v): v is number => v != null);
  if (nums.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden role="img" />;
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const y = (v: number) => height - ((v - min) / span) * (height - 2) - 1;

  // Build a path, breaking on null gaps.
  let d = '';
  let started = false;
  data.forEach((v, i) => {
    if (v == null) {
      started = false;
      return;
    }
    const cmd = started ? 'L' : 'M';
    d += `${cmd}${(i * stepX).toFixed(2)},${y(v).toFixed(2)} `;
    started = true;
  });

  const color = roleColor(role);
  const lastIdx = data.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop() ?? 0;
  const lastVal = data[lastIdx] as number;

  return (
    <svg width={width} height={height} className={className} aria-hidden role="img" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill ? <path d={`${d}L${width},${height} L0,${height} Z`} fill={`url(#${gradId})`} stroke="none" /> : null}
      <path d={d.trim()} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastIdx * stepX} cy={y(lastVal)} r={2} fill={color} />
    </svg>
  );
}
