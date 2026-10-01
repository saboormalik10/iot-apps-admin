import { AlertTriangle, CheckCircle2, CircleSlash, Info, ShieldCheck } from 'lucide-react';
import type { ReadingStatus, Severity, StationStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/**
 * Status, said three ways at once: a colour, a shape and a word.
 *
 * Eight states cannot be told apart by hue — not by a colour-blind controller, not
 * on a sun-washed screen, and not on the black-and-white printout of this proposal
 * that somebody will inevitably be reading in the meeting. So every pill carries an
 * icon and a label, and colour is the fastest channel rather than the only one.
 */

type Tone = 'alert' | 'warning' | 'information' | 'normal' | 'cleared' | 'offline';

const TONE: Record<Tone, { className: string; Icon: typeof AlertTriangle; label: string }> = {
  alert: {
    className: 'bg-sev-alert-tint text-sev-alert-strong ring-sev-alert/30',
    Icon: AlertTriangle,
    label: 'Alert',
  },
  warning: {
    className: 'bg-sev-warning-tint text-sev-warning-strong ring-sev-warning/30',
    Icon: AlertTriangle,
    label: 'Warning',
  },
  information: {
    className: 'bg-sev-info-tint text-sev-info-strong ring-sev-info/30',
    Icon: Info,
    label: 'Information',
  },
  normal: {
    className: 'bg-sev-normal-tint text-sev-normal-strong ring-sev-normal/30',
    Icon: CheckCircle2,
    label: 'OK',
  },
  cleared: {
    className: 'bg-sev-cleared-tint text-sev-cleared-strong ring-sev-cleared/30',
    Icon: ShieldCheck,
    label: 'Cleared',
  },
  offline: {
    className: 'bg-sev-offline-tint text-sev-offline-strong ring-sev-offline/30',
    Icon: CircleSlash,
    label: 'Offline',
  },
};

export function StatusPill({
  tone,
  label,
  size = 'md',
  className,
}: {
  tone: Tone;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { className: toneClass, Icon, label: fallback } = TONE[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        toneClass,
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
      {label ?? fallback}
    </span>
  );
}

export function severityTone(severity: Severity): Tone {
  return severity === 'information' ? 'information' : severity;
}

export function readingTone(status: ReadingStatus): Tone {
  if (status === 'alert') return 'alert';
  if (status === 'warning') return 'warning';
  if (status === 'stale' || status === 'missing') return 'offline';
  return 'normal';
}

export function stationTone(status: StationStatus): Tone {
  return status === 'offline' ? 'offline' : status === 'alert' ? 'alert' : status === 'warning' ? 'warning' : 'normal';
}

/** The bare dot, for map pins and table cells where a full pill is too heavy. */
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  const map: Record<Tone, string> = {
    alert: 'bg-sev-alert',
    warning: 'bg-sev-warning',
    information: 'bg-sev-info',
    normal: 'bg-sev-normal',
    cleared: 'bg-sev-cleared',
    offline: 'bg-sev-offline',
  };
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', map[tone], className)} aria-hidden />;
}
