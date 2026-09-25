'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';

/**
 * "Are you sure?" in the portal's own voice.
 *
 * The browser's `window.confirm` was doing this job: an unstyled grey box titled
 * "127.0.0.1:3301 says", which ignores dark mode and, on a screen in a control
 * room, reads as a browser fault rather than part of the product.
 */
export interface ConfirmRequest {
  title: string;
  body: string;
  /** The button that does it. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Red button for something that cannot be undone. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const tc = useTranslations('common');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!request) return;
    setBusy(true);
    try {
      await request.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.body}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {tc('cancel')}
          </Button>
          <Button
            type="button"
            onClick={run}
            disabled={busy}
            className={request?.destructive ? 'bg-status-error text-white hover:bg-status-error/90' : undefined}
          >
            {request?.confirmLabel ?? tc('confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
