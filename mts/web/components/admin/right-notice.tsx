import { Lock } from 'lucide-react';
import type { OrgRight } from '@/lib/api/types';
import { RIGHT_LABELS } from '@/lib/api/endpoints';

/**
 * Said in place of an Add button the organisation has not been granted: what is
 * off, and who can turn it on — never a button that silently does nothing.
 */
export function RightNotice({ right, orgName = 'Metro Trains Sydney' }: { right: OrgRight; orgName?: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="text-foreground">{RIGHT_LABELS[right].label}</strong> is turned off for {orgName}. Only the Super
        User can do this, or grant it to your Administrator under Administration → Organisations.
      </span>
    </p>
  );
}
