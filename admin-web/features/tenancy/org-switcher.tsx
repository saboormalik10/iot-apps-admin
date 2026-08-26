'use client';

import { useState } from 'react';
import { Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRbac } from '@/lib/rbac/context';
import { useOrganizations, useSwitchOrganization } from './use-org-switch';

/**
 * Customer picker for platform administrators.
 *
 * Renders nothing for everyone else — a customer must not even learn that other
 * customers exist, and the endpoint behind it 403s for them anyway.
 */
export function OrgSwitcher() {
  const { user, isSuperAdmin } = useRbac();
  const { data: orgs = [], isLoading } = useOrganizations();
  const switchOrg = useSwitchOrganization();
  const [open, setOpen] = useState(false);

  if (!isSuperAdmin) return null;

  const actingId = user?.organizationId;
  const homeId = user?.homeOrganizationId ?? null;
  const current = orgs.find((o) => o._id === actingId);

  const go = (id: string | null) => {
    setOpen(false);
    switchOrg.mutate(id);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-[16rem] gap-2"
          disabled={switchOrg.isPending}
          aria-label="Switch organisation"
        >
          {switchOrg.isPending ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">{current?.name ?? (isLoading ? 'Loading…' : 'Organisation')}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Viewing data for</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {orgs.map((o) => (
          <DropdownMenuItem key={o._id} onSelect={() => go(o._id === homeId ? null : o._id)}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{o.name}</span>
              <span className="text-xs text-muted-foreground">
                {o.deviceCount} station{o.deviceCount === 1 ? '' : 's'} · {o.userCount} user
                {o.userCount === 1 ? '' : 's'}
              </span>
            </span>
            {o._id === actingId ? <Check className="ml-2 h-4 w-4 shrink-0" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}

        {homeId ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => go(null)}>Return to my organisation</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
