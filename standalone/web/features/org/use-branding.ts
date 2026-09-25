'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getBranding, updateBranding, uploadLogo, removeLogo } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import type { BrandingInput } from '@/lib/api/types';

/**
 * This organisation's branding.
 *
 * Long `staleTime`: branding changes when someone edits it, not on its own, and
 * the shell reads this on every page.
 */
export function useBranding() {
  return useQuery({
    queryKey: queryKeys.branding,
    queryFn: ({ signal }) => getBranding(signal),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BrandingInput) => updateBranding(input),
    // Seeded from the response rather than refetched: the server already
    // returned the resolved branding, so a second round trip would only risk
    // showing the old values in between.
    onSuccess: (branding) => qc.setQueryData(queryKeys.branding, branding),
  });
}

/** Upload a logo. The response is the resolved branding, so it seeds the cache. */
export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadLogo(file),
    onSuccess: (branding) => qc.setQueryData(queryKeys.branding, branding),
  });
}

export function useRemoveLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => removeLogo(),
    onSuccess: (branding) => qc.setQueryData(queryKeys.branding, branding),
  });
}
