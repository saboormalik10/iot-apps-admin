'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import type { ShareResourceType } from '@/lib/api/types';
import { publicShareUrl } from './share-url';
import { useCreateShare } from './use-share';

const EXPIRY_OPTIONS: { key: string; label: string; days: number }[] = [
  { key: '7', label: 'in 7 days', days: 7 },
  { key: '30', label: 'in 30 days', days: 30 },
  { key: '90', label: 'in 90 days', days: 90 },
  { key: '365', label: 'in 1 year', days: 365 },
];

/**
 * Create-share dialog (plan §Month 11) — makes a public read-only link for a NEP
 * session or MET record. The backend `url` points at the API origin, so the panel
 * builds its OWN shareable `/s/<token>` link (client-side, from window.origin).
 * Every share link expires (the backend enforces it); we surface the choice.
 */
export function ShareDialog({
  resourceType,
  resourceId,
  resourceLabel,
  open,
  onOpenChange,
}: {
  resourceType: ShareResourceType;
  resourceId: string;
  resourceLabel?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const toast = useApiToast();
  const create = useCreateShare();
  const [expiry, setExpiry] = useState('30');
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset when re-opened for a fresh resource.
  useEffect(() => {
    if (open) {
      setToken(null);
      setExpiry('30');
      setCopied(false);
    }
  }, [open]);

  const url = token ? publicShareUrl(token) : '';

  const submit = async () => {
    const days = EXPIRY_OPTIONS.find((o) => o.key === expiry)?.days ?? 30;
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    try {
      const link = await create.mutateAsync({ resourceType, resourceId, expiresAt });
      setToken(link.token);
    } catch (e) {
      toast.error(e);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(new Error('Could not copy to clipboard'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Share {resourceType === 'nepSession' ? 'session' : 'record'}
          </DialogTitle>
          <DialogDescription>
            Anyone with the link can view a read-only snapshot of{' '}
            <span className="font-medium">{resourceLabel ?? resourceId}</span> — no sign-in required. The link is not
            indexed by search engines and stops working when it expires or you revoke it.
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <div className="space-y-2">
            <Label>Shareable link</Label>
            <div className="flex gap-2">
              <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copy} aria-label="Copy link">
                {copied ? <Check className="h-4 w-4 text-status-ok" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" asChild aria-label="Open link">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Manage or revoke this link any time from the Share page.</p>
          </div>
        ) : (
          <div className="space-y-1">
            <Label>Link expires</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          {token ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} disabled={create.isPending}>Create link</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
