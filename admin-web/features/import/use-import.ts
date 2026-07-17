'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { importCsv } from '@/lib/api/endpoints';
import type { ImportSummary } from '@/lib/api/types';
import type { ImportKind } from './csv-contract';

export interface ImportInput {
  kind: ImportKind;
  file: File;
  deviceId: string;
}

/**
 * Import mutation (plan §Month 12). A successful import writes NepSessions/
 * NepSamples or a MetRecord/MetMeasures and an audit row, so it invalidates every
 * surface that reads them rather than hand-patching caches (plan §3.1 "refetch is
 * truth"). Progress is XHR-driven; `progress` is 0–1 while in flight.
 */
export function useImportCsv() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState(0);

  const mutation = useMutation<ImportSummary, unknown, ImportInput>({
    mutationFn: ({ kind, file, deviceId }) => {
      setProgress(0);
      return importCsv(kind, file, deviceId, { onProgress: setProgress });
    },
    onSuccess: (_data, { kind }) => {
      // Imported rows land in the lists, the analytics windows, and the dashboard
      // counts — invalidate the roots rather than guess at which keys moved.
      if (kind === 'nep') {
        qc.invalidateQueries({ queryKey: ['sessions'] });
      } else {
        qc.invalidateQueries({ queryKey: ['records'] });
      }
      qc.invalidateQueries({ queryKey: ['analytics'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });

  return { ...mutation, progress };
}
