'use client';

import Link from 'next/link';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * §8.4: "automatic inactivity timeout". A portal that may hold pump control
 * cannot stay signed in on an unattended desk — but signing a controller out
 * mid-event without warning is its own hazard. So a minute's notice comes
 * first, with the choice to stay.
 *
 * In the prototype the idle period is 15 minutes, and Settings can show the
 * warning straight away.
 */
const IDLE_MS = 15 * 60_000;
const WARN_S = 60;
export const PREVIEW_EVENT = 'mts:inactivity-preview';

export function InactivityWarning() {
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(WARN_S);

  useEffect(() => {
    let timer = window.setTimeout(() => setOpen(true), IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setOpen(true), IDLE_MS);
    };
    const preview = () => setOpen(true);
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    window.addEventListener(PREVIEW_EVENT, preview);
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
      window.removeEventListener(PREVIEW_EVENT, preview);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setLeft(WARN_S);
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-sev-warning-strong" aria-hidden /> Are you still there?
          </DialogTitle>
          <DialogDescription>
            You will be signed out in <span className="tabular font-semibold text-foreground">{left} s</span> because the portal has been
            idle. Anything you have not saved will be lost.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/login" onClick={() => setOpen(false)}>
              Sign out now
            </Link>
          </Button>
          <Button onClick={() => setOpen(false)}>Stay signed in</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
