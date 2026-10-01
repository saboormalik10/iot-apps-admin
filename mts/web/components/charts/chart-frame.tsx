'use client';

import { Download, FlaskConical, Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { fmtDateTime, fmtValue } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Reading } from '@/lib/api/types';

/**
 * The chrome every chart wears: a title, its unit, the current value, a way to
 * read the numbers instead of the picture, and an export.
 *
 * The small "synthetic" mark is not decoration. A screenshot of one of these
 * charts, cropped out of the page, is indistinguishable from real telemetry for a
 * named rail location — so the disclaimer travels with the chart rather than
 * sitting in a banner that the crop leaves behind.
 */

export interface ChartFrameProps {
  title: string;
  unit?: string;
  /** The "now 16 km/h" badge the client's mockups put top-right. */
  nowLabel?: string;
  nowTone?: 'normal' | 'warning' | 'alert';
  footnote?: string;
  rows?: { label: string; points: Reading[] }[];
  /**
   * The table view for a chart that is not a time series — a heatmap, a rose, a
   * timeline. Every chart has one: it is where a colour-blind reader, a screen
   * reader and anyone printing in grey get the same numbers the picture shows.
   */
  table?: { head: string[]; rows: (string | number)[][] };
  /** Controls that belong to this chart, beside the table and export buttons. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Charts that are themselves the page's subject can hide the mark. */
  hideSyntheticMark?: boolean;
  /**
   * Where the chart sits in the page's outline. A chart directly under the page
   * title is an h2; one inside a titled section is an h3. Screen-reader users
   * navigate by these, and a page that jumps h1 → h3 reads as a missing section.
   */
  as?: 'h2' | 'h3';
}

export function ChartFrame({
  title,
  unit,
  nowLabel,
  nowTone = 'normal',
  footnote,
  rows,
  table,
  actions,
  children,
  className,
  hideSyntheticMark,
  as: Heading = 'h3',
}: ChartFrameProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const hasTable = Boolean(table?.rows.length || rows?.length);

  const download = () => {
    const quote = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
    let header: string;
    let lines: string[];
    if (table) {
      header = table.head.map(quote).join(',');
      lines = table.rows.map((r) => r.map(quote).join(','));
    } else if (rows?.length) {
      header = ['Time', ...rows.map((r) => r.label)].join(',');
      const times = rows[0].points.map((p) => p.t);
      lines = times.map((t, i) => [new Date(t).toISOString(), ...rows.map((r) => r.points[i]?.v ?? '')].join(','));
    } else return;
    // Someone will open this in Excel and forget where it came from.
    const csv = [
      '# SYNTHETIC DEMO DATA — Sydney Metro M1 design prototype — not measurements',
      header,
      ...lines,
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-demo.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={cn('flex min-w-0 flex-col rounded-lg border bg-card p-4', className)}>
      {/* On a phone the title gets the full width and the badge and buttons move
          under it; side by side, a long title wrapped one word per line. */}
      <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <Heading className="text-sm font-semibold">
            {title}
            {unit ? <span className="ml-1.5 font-normal text-muted-foreground">({unit})</span> : null}
          </Heading>
          {footnote ? <p className="mt-0.5 text-xs text-muted-foreground">{footnote}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {nowLabel ? (
            <span
              className={cn(
                'tabular rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                nowTone === 'alert'
                  ? 'bg-sev-alert-tint text-sev-alert-strong ring-sev-alert/30'
                  : nowTone === 'warning'
                    ? 'bg-sev-warning-tint text-sev-warning-strong ring-sev-warning/30'
                    : 'bg-muted text-muted-foreground ring-border',
              )}
            >
              {nowLabel}
            </span>
          ) : null}
          {actions}
          {hasTable ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={view === 'chart' ? 'Show the numbers' : 'Show the chart'}
                aria-pressed={view === 'table'}
                onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
              >
                <Table2 className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Download as CSV" onClick={download}>
                <Download className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {view === 'chart' ? (
          children
        ) : table ? (
          <div className="scroll-x-hint max-h-72 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {table.head.map((h, i) => (
                    <th key={h} className={cn('whitespace-nowrap px-2 py-1.5 font-medium', i === 0 ? 'text-left' : 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular">
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {r.map((c, j) => (
                      <td key={j} className={cn('whitespace-nowrap px-2 py-1', j === 0 ? 'text-left text-muted-foreground' : 'text-right')}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="scroll-x-hint max-h-72 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Time</th>
                  {rows!.map((r) => (
                    <th key={r.label} className="px-2 py-1.5 text-right font-medium">
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular">
                {rows![0].points.map((p, i) => (
                  <tr key={p.t} className="border-t">
                    <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{fmtDateTime(p.t)}</td>
                    {rows!.map((r) => (
                      <td key={r.label} className="px-2 py-1 text-right">
                        {fmtValue(r.points[i]?.v ?? null)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!hideSyntheticMark ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          <FlaskConical className="h-3 w-3" aria-hidden />
          synthetic demonstration data
        </p>
      ) : null}
    </section>
  );
}
