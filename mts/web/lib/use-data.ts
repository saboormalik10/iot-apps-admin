'use client';

import { useSyncExternalStore } from 'react';
import { getRevision, subscribeToData } from '@/lib/api/endpoints';

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
