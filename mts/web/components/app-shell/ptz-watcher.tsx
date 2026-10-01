'use client';

import { useEffect, useRef, useState } from 'react';
import type { AlertEvent } from '@/lib/api/types';
import { acknowledgeEvent, cameraEvents } from '@/lib/api/endpoints';
import { PtzDialog } from '@/features/alerts/ptz-dialog';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';

/**
 * §7.5: "when standing water is detected at a location, the portal pops up an
 * alert prompting the user to check the PTZ camera". Whichever screen is open.
 *
 * It fires for events that happen while the portal is open — not for ones that
 * were already in the log when it was opened, which the alert list carries — and
 * a snoozed prompt comes back after ten minutes if nobody has acknowledged it.
 */
export function PtzWatcher() {
  const now = useDemoClock();
  useDataRevision();
  const seen = useRef<number>(0);
  const snoozed = useRef<Map<string, number>>(new Map());
  const [open, setOpen] = useState<AlertEvent | null>(null);

  useEffect(() => {
    if (!now) return;
    if (!seen.current || now < seen.current) {
      // First tick, or the demo clock was moved back: start watching from here.
      seen.current = now;
      return;
    }
    if (open) return;
    const pending = cameraEvents().filter((e) => !e.acknowledgement && e.t <= now);
    // Only what has just happened: a jump of several hours should not replay
    // every prompt it skipped over — those wait in the alert list.
    const fresh = pending.find((e) => e.t > seen.current && now - e.t <= 15 * 60_000);
    const due = pending.find((e) => (snoozed.current.get(e.id) ?? Infinity) <= now);
    const next = fresh ?? due;
    seen.current = now;
    if (next) {
      snoozed.current.delete(next.id);
      setOpen(next);
    }
  }, [now, open]);

  return (
    <PtzDialog
      event={open}
      onClose={() => setOpen(null)}
      onAcknowledge={(id) => acknowledgeEvent(id)}
      onSnooze={(id) => snoozed.current.set(id, now + 10 * 60_000)}
    />
  );
}
