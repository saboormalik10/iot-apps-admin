'use client';

import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * ConfirmDialog — a guarded confirm step for irreversible or field-affecting
 * actions (soft-delete, and the settings editor whose writes reach live hardware,
 * plan §14 / decision #13). Controlled `open`; the parent owns the async work.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  hideConfirm = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * Drop the confirm button, leaving only Cancel.
   *
   * For the case where the action is not available yet and the dialog is
   * explaining why. A confirm button that is certain to fail invites the click
   * and then blames the user for it; a DISABLED one still says "somebody could
   * press this". Neither is true, so neither is shown.
   */
  hideConfirm?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    try {
      setBusy(true);
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Keep the dialog open on failure; the caller surfaces the error (e.g. toast).
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {hideConfirm ? 'Close' : cancelLabel}
          </Button>
          {hideConfirm ? null : (
            <Button variant={destructive ? 'destructive' : 'default'} onClick={run} disabled={busy}>
              {busy ? '…' : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
