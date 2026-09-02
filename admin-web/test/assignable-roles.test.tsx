import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { RbacProvider } from '@/lib/rbac/context';
import { useAssignableRoles } from '@/features/roles/use-roles';
import type { RoleRow, SessionUser } from '@/lib/api/types';

/**
 * M25 — which roles a person may hand out.
 *
 * The server refuses to let anyone grant a permission they do not hold, because
 * accepting a `roleId` is otherwise a way to manufacture authority: an
 * Organisation Admin cannot create roles, but could point a new user at one that
 * carries `role:write` and then sign in as them, with the password they just set.
 *
 * These assert the CLIENT mirrors that rule — not as the enforcement, which stays
 * on the server, but so the menu never offers an action guaranteed to 403.
 */

const ROLES: RoleRow[] = [
  { _id: 'r-viewer', organizationId: null, key: 'viewer', name: 'Viewer', description: '', permissions: ['data:read', 'data:export'], isSystem: true, isDefault: false, userCount: 1 },
  { _id: 'r-admin', organizationId: null, key: 'admin', name: 'Organisation Admin', description: '', permissions: ['data:read', 'data:export', 'user:write'], isSystem: true, isDefault: false, userCount: 1 },
  { _id: 'r-super', organizationId: null, key: 'super', name: 'Everything', description: '', permissions: ['data:read', 'data:export', 'user:write', 'role:write'], isSystem: false, isDefault: false, userCount: 0 },
];

vi.mock('@/lib/api/endpoints', () => ({
  listRoles: vi.fn(async () => ROLES),
  listPermissionGroups: vi.fn(async () => []),
  getRoleUsage: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
}));

function wrapper(user: Partial<SessionUser>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <RbacProvider user={{ id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: 'admin', organizationId: 'o1', ...user } as SessionUser}>
          {children}
        </RbacProvider>
      </QueryClientProvider>
    );
  };
}

describe('useAssignableRoles', () => {
  it('hides a role granting more than the user holds', async () => {
    const { result } = renderHook(() => useAssignableRoles(), {
      wrapper: wrapper({ permissions: ['data:read', 'data:export', 'user:write'] }),
    });
    await vi.waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    const names = result.current.data.map((r) => r.name);
    expect(names).toContain('Viewer');
    expect(names).toContain('Organisation Admin');
    // `role:write` is held by no seeded role — offering it would be an action the
    // server is certain to refuse.
    expect(names).not.toContain('Everything');
  });

  it('offers everything to a super admin', async () => {
    const { result } = renderHook(() => useAssignableRoles(), {
      wrapper: wrapper({ permissions: [], isSuperAdmin: true }),
    });
    await vi.waitFor(() => expect(result.current.data.length).toBe(3));
    expect(result.current.data.map((r) => r.name)).toContain('Everything');
  });

  it('orders least-privileged first, so the default selection is the safest', async () => {
    const { result } = renderHook(() => useAssignableRoles(), {
      wrapper: wrapper({ permissions: ['data:read', 'data:export', 'user:write', 'role:write'] }),
    });
    await vi.waitFor(() => expect(result.current.data.length).toBe(3));
    expect(result.current.data.map((r) => r.name)).toEqual(['Viewer', 'Organisation Admin', 'Everything']);
  });

  it('offers nothing beyond a viewer to someone holding only read grants', async () => {
    const { result } = renderHook(() => useAssignableRoles(), {
      wrapper: wrapper({ permissions: ['data:read', 'data:export'] }),
    });
    await vi.waitFor(() => expect(result.current.data.length).toBe(1));
    expect(result.current.data.map((r) => r.name)).toEqual(['Viewer']);
  });
});
