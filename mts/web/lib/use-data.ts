'use client';

import { useSyncExternalStore } from 'react';
import type { OrgRight } from '@/lib/api/types';
import { actingAs, actingUser, can, getRevision, subscribeToData } from '@/lib/api/endpoints';

/**
 * Re-render when the demo's data changes.
 *
 * The header's alert chip and a page's own count are the same number, and a
 * client will spot it if they disagree for a second after an acknowledgement.
 * Subscribing both to the one revision counter means they change on the same
 * frame instead of waiting for the next clock tick.
 */
export function useDataRevision(): number {
  return useSyncExternalStore(subscribeToData, getRevision, () => 0);
}

/**
 * Who is signed in, and what they may add — re-read on every data change, so
 * granting a right or switching "view as" updates every screen on the same frame.
 */
export function useActing() {
  const revision = useDataRevision();
  const who = actingAs();
  return {
    revision,
    who,
    user: actingUser(),
    isSuperUser: who === 'super-user',
    can: (right: OrgRight, orgId = 'mts') => can(right, orgId),
  };
}
