'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { PRESSURE_TENDENCY, cssVar } from '@/lib/api/scales';
import { fmt } from '@/components/charts/chart-utils';
import { LoadingState } from '@/components/screen-states';
import { IntervalSelect } from './interval-select';
import { useMetPressureTendency } from '../use-analytics';

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
  const [hours, setHours] = useState('3');
  const { data, isLoading } = useMetPressureTendency(deviceId, Number(hours));
  const state = PRESSURE_TENDENCY.find((s) => s.tendency === data?.tendency) ?? PRESSURE_TENDENCY[2];

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
              {data?.current != null ? `${fmt(data.current, 1)} hPa now` : 'No reading'}
              {data?.deltaHpa != null ? ` · ${data.deltaHpa >= 0 ? '+' : ''}${fmt(data.deltaHpa, 1)} hPa / ${hours}h` : ''}
              {data?.deltaPerHr != null ? ` · ${fmt(data.deltaPerHr, 2)} hPa/hr` : ''}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
