'use client';

import { useTranslations } from 'next-intl';
import { toast } from './use-toast';
import { ApiError, messageKeyForError } from '@/lib/api/errors';

/**
 * Maps the consistent backend `{ error: { code, message } }` (surfaced as
 * ApiError) to a toast (plan §10.3). Success/failure of every mutation and auth
 * action routes through here.
 */
export function useApiToast() {
  const t = useTranslations();

  return {
    success: (message: string) =>
      toast({ variant: 'success', title: t('toast.success'), description: message }),
    info: (message: string) => toast({ variant: 'info', description: message }),
    error: (err: unknown) => {
      const key = messageKeyForError(err);
      const fallback = t(key);
      // Prefer the backend's own message when it's specific; else the mapped copy.
      const description = err instanceof ApiError && err.message ? err.message : fallback;
      toast({ variant: 'error', title: t('toast.error'), description });
    },
  };
}
