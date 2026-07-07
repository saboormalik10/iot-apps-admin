'use client';

import type { ReactNode } from 'react';
import { useRbac } from './context';
import type { Capability } from './capabilities';

/**
 * Element guard: render children only if the current role has the capability.
 * Optional `fallback` (e.g. a disabled state or an explanatory note).
 */
export function Can({
  capability,
  children,
  fallback = null,
}: {
  capability: Capability;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useRbac();
  return <>{can(capability) ? children : fallback}</>;
}
