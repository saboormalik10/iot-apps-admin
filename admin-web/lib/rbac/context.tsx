'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SessionUser, Role } from '../api/types';
import { can, type Capability } from './capabilities';

interface RbacValue {
  user: SessionUser | null;
  role: Role | null;
  can: (capability: Capability) => boolean;
  /** True if the signed-in user holds this backend permission. */
  has: (permission: string) => boolean;
  isSuperAdmin: boolean;
}

const RbacContext = createContext<RbacValue | null>(null);

/**
 * Seeded from the server (the (dash) layout reads the session and passes the
 * current user down). Role/active changes propagate on the user's next BFF
 * refresh — the backend re-signs role/isActive from the DB — so this context is
 * always at most one refresh stale, without a re-login.
 */
export function RbacProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  const value = useMemo<RbacValue>(
    () => ({
      user,
      role: user?.role ?? null,
      can: (capability: Capability) => can(user?.role, capability),
      has: (permission: string) => {
        if (user?.isSuperAdmin) return true;
        // A session predating M18 W2 carries no grants. Falling back to the
        // capability matrix keeps those users working; treating "no perms" as
        // "holds nothing" would blank the UI for everyone until they signed out.
        if (!user?.permissions) return can(user?.role, 'manageOrg');
        return user.permissions.includes(permission);
      },
      isSuperAdmin: user?.isSuperAdmin === true,
    }),
    [user],
  );
  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

export function useRbac(): RbacValue {
  const ctx = useContext(RbacContext);
  if (!ctx) throw new Error('useRbac must be used within <RbacProvider>');
  return ctx;
}

/** Current authenticated user (throws outside the provider). */
export function useCurrentUser(): SessionUser | null {
  return useRbac().user;
}
