'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { PRESSURE_TENDENCY, cssVar } from '@/lib/api/scales';
import { LoadingState } from '@/components/screen-states';
import { IntervalSelect } from './interval-select';
import { useMetPressureTendency } from '../use-analytics';
import { useUnits } from '@/lib/units/use-units';

const HOURS = [
  { key: '3', label: '3 h' },
  { key: '6', label: '6 h' },
  { key: '12', label: '12 h' },
  { key: '24', label: '24 h' },
];

/**
 * MET pressure-tendency widget (plan §6) — the 5-state barometric arrow
 * (rising-rapidly → falling-rapidly, §10.9) with the backend label and the
 * current reading / change over the chosen lookback.
 */
export function PressureTendencyWidget({ deviceId }: { deviceId?: string }) {
  const units = useUnits();
  const [hours, setHours] = useState('3');
  const { data, isLoading } = useMetPressureTendency(deviceId, Number(hours));
  const state = PRESSURE_TENDENCY.find((s) => s.tendency === data?.tendency) ?? PRESSURE_TENDENCY[2];
  const delta = (v: number, decimals?: number) => units.delta(v, 'hPa', decimals);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Pressure tendency</h3>
        <IntervalSelect value={hours} onChange={setHours} options={HOURS} />
      </div>

      {isLoading ? (
        <LoadingState label="Loading tendency…" />
      ) : (
        <div className="flex items-center gap-4">
          <span className="text-5xl leading-none" style={{ color: cssVar(state.role) }} aria-hidden>
            {state.arrow}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{data?.label ?? state.label}</p>
            <p className="text-xs text-muted-foreground">
              {/* `current` is a reading; the two deltas are DIFFERENCES, so they go
                  through `delta` — a plain conversion would be wrong for any unit
                  with an offset, and this line is the pattern other widgets copy. */}
              {data?.current != null ? `${units.format(data.current, 'hPa')} ${units.unitFor('hPa')} now` : 'No reading'}
              {data?.deltaHpa != null
                ? ` · ${data.deltaHpa >= 0 ? '+' : ''}${delta(data.deltaHpa).text} ${delta(data.deltaHpa).unit} / ${hours}h`
                : ''}
              {data?.deltaPerHr != null
                ? ` · ${delta(data.deltaPerHr, 2).text} ${delta(data.deltaPerHr, 2).unit}/hr`
                : ''}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
