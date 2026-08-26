'use client';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useRbac } from '@/lib/rbac/context';
import { useOrganizations, useSwitchOrganization } from './use-org-switch';

/**
 * Persistent reminder that you are inside someone else's data.
 *
 * Deliberately unmissable and NOT dismissible: a platform administrator who
 * forgets they are switched can edit a customer's devices, alerts or people
 * believing they are in their own organisation. The banner is the only thing
 * standing between that mistake and the customer.
 */
export function ActingAsBanner() {
  const { user, isSuperAdmin } = useRbac();
  const { data: orgs = [] } = useOrganizations();
  const switchOrg = useSwitchOrganization();

  const homeId = user?.homeOrganizationId ?? null;
  if (!isSuperAdmin || !homeId) return null;

  const acting = orgs.find((o) => o._id === user?.organizationId);

  return (
    <div
      role="status"
      // Named, not an anonymous live region: several loading states also use
      // role="status", so without this a screen reader (and any test) cannot
      // tell the tenancy warning apart from "Loading map…".
      aria-label="Acting as another organisation"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-status-warn/40 bg-status-warn/10 px-4 py-2 text-sm md:px-6"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-status-warn" aria-hidden />
      <span className="min-w-0">
        You are viewing and editing <strong>{acting?.name ?? 'another organisation'}</strong>. Changes you make
        here affect that customer.
      </span>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto h-7"
        disabled={switchOrg.isPending}
        onClick={() => switchOrg.mutate(null)}
      >
        {switchOrg.isPending ? 'Leaving…' : 'Return to my organisation'}
      </Button>
    </div>
  );
}
