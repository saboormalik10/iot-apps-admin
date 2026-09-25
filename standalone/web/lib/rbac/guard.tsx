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
  permission,
  children,
  fallback = null,
}: {
  capability?: Capability;
  /** Backend permission key (M18). Both must pass when given alongside `capability`. */
  permission?: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, has } = useRbac();
  const allowed = (capability ? can(capability) : true) && (permission ? has(permission) : true);
  return <>{allowed ? children : fallback}</>;
}
