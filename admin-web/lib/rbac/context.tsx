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
        /**
         * No grants means holds nothing — NOT "fall back to the role".
         *
         * The old fallback returned `can(role, 'manageOrg')` for ANY permission,
         * so an administrator was treated as holding all of them. That is not
         * true of the seeded Organisation Admin, which carries `role:read` and
         * deliberately not `role:write` or `role:delete` — so the Roles page
         * offered Create, Edit and Delete buttons that the backend then refused.
         *
         * It was written for the M18 W2 rollout, when live tokens genuinely
         * carried no `perms`. Access tokens last 15 minutes, so no such token has
         * existed for months; the backend now always sends an array, empty at
         * worst. Showing a control the server will refuse is worse than hiding
         * one, so the safe direction here is closed, not open.
         */
        return user?.permissions?.includes(permission) ?? false;
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
