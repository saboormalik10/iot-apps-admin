'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Can } from '@/lib/rbac/guard';
import type { ShareResourceType } from '@/lib/api/types';
import { ShareDialog } from './share-dialog';

/**
 * Share entry point for a session/record detail (plan §Month 11). Creating share
 * links is available to all roles (§3.3 "create share links"), so it's gated by
 * `exportData`. Opens the create-share dialog for this resource.
 */
export function ShareButton({
  resourceType,
  resourceId,
  resourceLabel,
}: {
  resourceType: ShareResourceType;
  resourceId: string;
  resourceLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Can capability="exportData">
      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setOpen(true)}>
        <Share2 className="h-3.5 w-3.5" /> Share
      </Button>
      <ShareDialog
        resourceType={resourceType}
        resourceId={resourceId}
        resourceLabel={resourceLabel}
        open={open}
        onOpenChange={setOpen}
      />
    </Can>
  );
}
