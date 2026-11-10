import type { StationLocation } from '@/lib/api/types';
import type { ThresholdMark } from '@/components/charts/series';
import { THRESHOLDS, THRESHOLD_LABELS } from '@/lib/mock/seed/thresholds';

/**
 * The lines a station's water level is judged against — the pump set points at
 * Marrickville, standing water elsewhere, and the rail foot everywhere. Used by
 * the station page's Flood panel and the Trends screen. (The station's charts
 * themselves now live in its panels: station-panels.tsx.)
 */
export function levelThresholds(station: StationLocation): ThresholdMark[] {
  const F = THRESHOLDS.flood;
  return station.pumpStation
    ? [
        { value: F.railFootMm, label: THRESHOLD_LABELS.railFoot, tone: 'critical' },
        { value: F.highHighMm, label: THRESHOLD_LABELS.highHigh, tone: 'setpoint' },
        { value: F.pumpStartMm, label: THRESHOLD_LABELS.pumpStart, tone: 'setpoint' },
      ]
    : [
        { value: F.railFootMm, label: THRESHOLD_LABELS.railFoot, tone: 'critical' },
        { value: F.standingWaterMm, label: `standing water +${F.standingWaterMm} mm (verify)`, tone: 'setpoint' },
      ];
}
