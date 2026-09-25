'use client';

import Image from 'next/image';

import { useBranding } from '@/features/org/use-branding';

/**
 * The customer's name and logo in the sidebar.
 *
 * Falls back to the platform wordmark while the branding request is in flight
 * and for any customer who has not set one — never to a half-applied identity,
 * which is why the server resolves `displayName` and `isCustomised` rather than
 * leaving each surface to work them out.
 *
 * A platform administrator switched into a customer sees THAT customer's mark,
 * because the token's `organizationId` is re-pointed. Combined with the amber
 * "acting as" banner, the shell then says whose data you are looking at twice.
 */
export function BrandMark({ fallbackName, initial }: { fallbackName: string; initial: string }) {
  const { data: branding } = useBranding();

  const name = branding?.displayName?.trim() || fallbackName;
  const logo = branding?.logoUrl?.trim() ?? '';

  return (
    <>
      {logo ? (
        <Image
          src={logo}
          alt=""
          width={28}
          height={28}
          // `object-contain` so a wide or tall logo is letterboxed rather than
          // cropped — a customer's mark should never be silently trimmed.
          className="h-7 w-7 shrink-0 rounded object-contain"
          unoptimized
        />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground">
          <span className="text-sm font-bold">{initial}</span>
        </div>
      )}
      {/* The name is the accessible label for the mark above, which is why the
          image carries an empty alt rather than repeating it. */}
      <span className="truncate text-sm font-semibold">{name}</span>
    </>
  );
}
