'use client';

import { useState } from 'react';
import { ErrorState } from '@/components/screen-states';
import { useShares } from './use-share';
import { ShareTable } from './share-table';

/**
 * Share-links management (plan §Month 11) — list every public link in the org with
 * its view count, expiry and status, and revoke (admin). Links are *created* from a
 * session or record detail (the Share button), so this page is the registry, not a
 * builder — its empty state points there.
 */
export function SharePage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useShares({ page, limit: 20 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Share links</h1>
        <p className="text-xs text-muted-foreground">
          Public read-only links to sessions and records. Links are not indexed and expire; revoke any time.
        </p>
      </div>

      {isError ? (
        <ErrorState title="Couldn't load share links" onRetry={() => refetch()} />
      ) : (
        <ShareTable
          rows={data?.rows ?? []}
          page={data?.page}
          pageCount={data?.pageCount}
          total={data?.total}
          onPageChange={setPage}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
