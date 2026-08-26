'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { WindRose } from '@/components/charts/wind-rose';
import { EmptyState } from '@/components/screen-states';
import { DataFreshness } from './data-freshness';
import { useMetWindrose } from './use-dashboard';

/**
 * Wind rose panel (plan §6) — the signature chart with a true/relative orientation
 * toggle and a 10-min / 2-min period selection (mirrors the device's windRoseOrient /
 * windRosePeriod). Refreshes live via the debounced `met:windrose` handler.
 *
 * The 16-sector × speed-band matrices are pre-binned server-side (§ graph-data
 * contract): we just pick the matrix for the current orientation × period and hand
 * it straight to the shared WindRose primitive — no client-side bucketing.
 */
/**
 * The one height this panel ever occupies — measured on the live dashboard, not
 * guessed. Shared by the loading, empty and loaded branches so the block never
 * changes size. If the rose or its legend is resized, this moves with it.
 */
const ROSE_BLOCK = 'min-h-[454px]';

export function WindRosePanel({ deviceId }: { deviceId?: string }) {
  const { data, isLoading } = useMetWindrose(deviceId);
  const [orient, setOrient] = useState<'true' | 'relative'>('true');
  const [period, setPeriod] = useState<'10m' | '2m'>('10m');

  if (!deviceId) return null;
  /**
   * Every state of this panel is pinned to the same height (M24 W2).
   *
   * The rose is a fixed 320px SVG and the legend beneath it is capped by
   * `max-h-[320px]`, so unlike the instrument grid this block genuinely has ONE
   * height — measured at 454px on the live dashboard. Reserving it is therefore
   * safe rather than a guess.
   *
   * Before this, the loading card was a small spinner and the panel grew by
   * ~236px when the rose arrived, pushing the whole page down. That was the last
   * of four contributors to the dashboard's CLS.
   */
  if (isLoading)
    return (
      <div className={`${ROSE_BLOCK} animate-pulse rounded-lg bg-muted`} role="status" aria-label="Loading wind rose…" />
    );
  if (!data)
    return (
      <div className={ROSE_BLOCK}>
        <EmptyState title="No wind data" />
      </div>
    );

  const matrix = data.matrices[orient][period];
  const total = matrix.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);

  return (
    <div className={`space-y-2 ${ROSE_BLOCK}`}>
      <div className="flex flex-wrap items-center gap-1">
        <Toggle active={orient === 'true'} onClick={() => setOrient('true')}>True</Toggle>
        <Toggle active={orient === 'relative'} onClick={() => setOrient('relative')}>Relative</Toggle>
        <span className="mx-1 w-px bg-border" />
        <Toggle active={period === '10m'} onClick={() => setPeriod('10m')}>10 min</Toggle>
        <Toggle active={period === '2m'} onClick={() => setPeriod('2m')}>2 min</Toggle>
        <span className="ml-auto">
          {/* The rose shows "the last 10 min OF THIS data" — which may itself be
              old, so stamp the freshest sample's age. */}
          <DataFreshness tsMs={data.newestTsMs} />
        </span>
      </div>
      {total === 0 ? (
        <div className="grid h-full place-items-center"><EmptyState title="No wind data in this window" /></div>
      ) : (
        <WindRose matrix={matrix} title={`Wind rose · ${orient} · ${period === '10m' ? '10 min' : '2 min'}`} />
      )}
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant={active ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={onClick} aria-pressed={active}>
      {children}
    </Button>
  );
}
