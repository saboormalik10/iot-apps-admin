'use client';

import Image from 'next/image';

import { useBranding } from '@/features/org/use-branding';
import observatorLogo from './observator-logo.png';

/**
 * The customer's name and logo in the sidebar.
 *
 * Until a site uploads its own logo (Settings > Branding), the Observator logo
 * stands in the corner (client, 10 Oct 2026). It also stands there while the
 * branding request is in flight — never to a half-applied identity,
 * which is why the server resolves `displayName` and `isCustomised` rather than
 * leaving each surface to work them out.
 *
 * A platform administrator switched into a customer sees THAT customer's mark,
 * because the token's `organizationId` is re-pointed. Combined with the amber
 * "acting as" banner, the shell then says whose data you are looking at twice.
 */
export function BrandMark({ fallbackName }: { fallbackName: string }) {
  const { data: branding } = useBranding();

  const name = branding?.displayName?.trim() || fallbackName;
  const logo = branding?.logoUrl?.trim() ?? '';

  if (!logo) {
    return (
      <Image
        src={observatorLogo}
        alt={`Observator group - ${name}`}
        title={name}
        priority
        // The wordmark is dark grey: on the dark theme it sits on a white tile.
        className="h-10 w-auto shrink-0 dark:rounded dark:bg-white dark:px-1.5 dark:py-0.5"
      />
    );
  }

  return (
    <>
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
      {/* The name is the accessible label for the mark above, which is why the
          image carries an empty alt rather than repeating it. */}
      <span className="truncate text-sm font-semibold">{name}</span>
    </>
  );
}
