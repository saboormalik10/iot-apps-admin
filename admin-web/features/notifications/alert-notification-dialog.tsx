'use client';

import { useRouter } from 'next/navigation';
import { ExternalLink, Radio } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/charts/status-badge';
import { formatDateTime, formatRelative } from '@/lib/time';
import { useDashboardDevices } from '@/features/dashboard/use-dashboard';
import { RuleTimeline, peakWord } from '@/features/alerts/rule-timeline';
import { useAlertTimeline } from '@/features/alerts/use-alerts';
import type { AppNotification } from '@/lib/api/types';

const CONDITION_SIGN: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤' };

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * What actually happened when an alert fired.
 *
 * The feed row can only carry one line, which leaves the two questions an
 * operator actually has unanswered: how far over the threshold was it, and what
 * was the wind doing either side of that moment? Both are here, and the chart is
 * CENTRED on the trigger rather than ending at it — a gust that spiked and
 * dropped looks identical to a rising storm if you only see the run-up.
 */
export function AlertNotificationDialog({
  notification,
  open,
  onOpenChange,
}: {
  notification: AppNotification | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { data: devices = [] } = useDashboardDevices();

  const d = notification?.data ?? {};
  const ruleId = str(d.ruleId);
  const deviceId = str(d.deviceId);
  const unit = str(d.unit) ?? '';
  const sensor = str(d.sensor) ?? '';
  const condition = str(d.condition) ?? 'gt';
  const threshold = num(d.threshold);
  // `displayValue` is the reading in the rule's unit. Older notifications only
  // carry `sensorValue`, which is the STORED unit — showing it beside a km/h
  // threshold would read as "1.67 > 3", so it is labelled with its own unit.
  const displayValue = num(d.displayValue);
  const storedValue = num(d.sensorValue);
  const storedUnit = str(d.storedUnit);
  // The reading's own timestamp. Absent on older entries, where the only time we
  // have is when the server processed it — which during a backlog drain can be
  // hours after the wind it describes.
  const measuredAtMs = num(d.measuredAtMs);
  const firedAtMs = notification ? new Date(notification.createdAt).getTime() : undefined;
  const centre = measuredAtMs ?? firedAtMs;

  const station = devices.find((x) => x._id === deviceId);

  /**
   * The same query the chart below runs, so React Query serves both from one
   * request. It is read here only for the sensor's STORED unit: notifications
   * written before that was recorded carry a bare number, and printing it
   * beside a km/h threshold is the very mismatch this screen exists to stop.
   * Nothing is converted here — the server owns that.
   */
  const { data: ctx } = useAlertTimeline(ruleId ?? '', 30, centre, open && Boolean(ruleId));
  const storedUnitLabel = storedUnit ?? ctx?.storedUnit ?? undefined;

  const over =
    displayValue != null && threshold != null ? Math.abs(displayValue - threshold) : undefined;
  // Only claim a reading in the rule's unit when we actually have one.
  const readingInRuleUnit = displayValue != null;
  const readingText = readingInRuleUnit
    ? `${displayValue}${unit}`
    : storedValue != null
      ? `${storedValue}${storedUnitLabel ? ` ${storedUnitLabel}` : ''}`
      : '–';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {notification?.title ?? 'Alert'}
            <StatusBadge tone="error" label="Alert" />
          </DialogTitle>
          <DialogDescription>
            {station?.name ?? 'Unknown station'} ·{' '}
            {measuredAtMs != null ? (
              <>measured {formatDateTime(measuredAtMs)}</>
            ) : firedAtMs != null ? (
              <>processed {formatDateTime(firedAtMs)}</>
            ) : null}{' '}
            {firedAtMs != null ? <span className="text-muted-foreground">({formatRelative(notification!.createdAt)})</span> : null}
          </DialogDescription>
        </DialogHeader>

        {/* The headline is the comparison, not a chart — it is the whole reason
            the notification exists, so it is read before anything is plotted. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Figure
            label={`Reading (${peakWord(condition)})`}
            value={readingText}
            note={
              readingInRuleUnit || storedValue == null
                ? undefined
                : storedUnitLabel
                  ? `sensor unit — threshold is in ${unit || 'the rule unit'}`
                  : 'sensor unit not recorded for this alert'
            }
            emphasis
          />
          <Figure
            label="Threshold"
            value={threshold != null ? `${CONDITION_SIGN[condition] ?? '>'} ${threshold}${unit}` : '–'}
          />
          <Figure
            label="Over by"
            value={over != null ? `${over.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit}` : '–'}
          />
        </div>

        {measuredAtMs == null && firedAtMs != null ? (
          <p className="rounded-md border border-status-warn/40 bg-status-warn/10 px-3 py-2 text-xs">
            This alert predates measurement-time recording, so the chart is centred on when it was processed. If
            the station was catching up on a backlog, the reading may have been taken earlier.
          </p>
        ) : null}

        {ruleId ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              {sensor.replace(/_/g, ' ')} around this alert
            </h3>
            <RuleTimeline ruleId={ruleId} minutes={30} at={centre} enabled={open} compact />
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            This notification carries no rule reference, so its readings cannot be shown.
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              router.push('/alerts');
            }}
          >
            <ExternalLink className="h-4 w-4" /> Open Alerts
          </Button>
          {deviceId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                router.push(`/devices/${deviceId}`);
              }}
            >
              <Radio className="h-4 w-4" /> View station
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Figure({
  label,
  value,
  note,
  emphasis,
}: {
  label: string;
  value: string;
  /** Why this figure is not directly comparable to the one beside it. */
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={emphasis ? 'text-xl font-semibold tabular-nums' : 'text-xl tabular-nums'}>{value}</p>
      {note ? <p className="mt-0.5 text-[11px] text-status-warn-strong">{note}</p> : null}
    </div>
  );
}
