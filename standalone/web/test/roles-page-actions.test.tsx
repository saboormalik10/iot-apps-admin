import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { RolesPage } from '@/features/roles/roles-page';
import { RbacProvider } from '@/lib/rbac/context';
import messages from '@/messages/en.json';
import type { RoleRow, SessionUser } from '@/lib/api/types';

/**
 * Which roles a customer may CHANGE, and which they may only look at.
 *
 * Organisation Admin holds `role:write` now, so the permission alone no longer
 * answers the question — the built-in roles and any shared role belong to the
 * platform (`organizationId: null`) and the server refuses to change them.
 * Offering Edit on those would 403 on save; offering nothing at all would hide
 * what the role grants, which an admin choosing between roles needs to see.
 * Hence View for the platform's roles, Edit/Delete for the customer's own.
 */

const listRoles = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  listRoles: (...a: unknown[]) => listRoles(...a),
  listPermissionGroups: vi.fn().mockResolvedValue([]),
  getRoleUsage: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
}));
vi.mock('@/lib/hooks/use-api-toast', () => ({ useApiToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

const ORG = 'org-1';

const role = (over: Partial<RoleRow>): RoleRow =>
  ({
    _id: 'r', key: 'k', name: 'Role', description: '', permissions: ['data:read'],
    organizationId: null, isSystem: false, isDefault: false, userCount: 0, ...over,
  }) as RoleRow;

const ROLES: RoleRow[] = [
  role({ _id: 'built', key: 'admin', name: 'Organisation Admin', isSystem: true, organizationId: null }),
  role({ _id: 'shared', key: 'site-sup', name: 'Site Supervisor', isSystem: false, organizationId: null }),
  role({ _id: 'mine', key: 'my-role', name: 'My Own Role', isSystem: false, organizationId: ORG }),
];

const user = (over: Partial<SessionUser> = {}): SessionUser =>
  ({
    id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: 'admin',
    organizationId: ORG, isSuperAdmin: false,
    permissions: ['role:read', 'role:write', 'role:delete'],
    ...over,
  }) as SessionUser;

function setup(u: SessionUser) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={qc}>
        <RbacProvider user={u}>
          <RolesPage />
        </RbacProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

/** The action buttons on one role's card. */
const card = async (name: string) => {
  const heading = await screen.findByText(name);
  return within(heading.closest('.flex.flex-col') ?? heading.parentElement!.parentElement!.parentElement!);
};

beforeEach(() => {
  listRoles.mockReset().mockResolvedValue(ROLES);
});

describe('RolesPage actions for a customer admin', () => {
  it('offers VIEW, not Edit, on a BUILT-IN role', async () => {
    setup(user());
    const c = await card('Organisation Admin');
    expect(c.getByRole('button', { name: /view/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(c.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('offers VIEW, not Edit, on a SHARED role the platform owns', async () => {
    setup(user());
    const c = await card('Site Supervisor');
    expect(c.getByRole('button', { name: /view/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('offers Edit and Delete on a role the customer OWNS', async () => {
    setup(user());
    const c = await card('My Own Role');
    expect(c.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(c.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /view/i })).not.toBeInTheDocument();
  });

  it('lets a SUPER ADMIN edit the built-in roles', async () => {
    setup(user({ isSuperAdmin: true }));
    const c = await card('Organisation Admin');
    expect(c.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /view/i })).not.toBeInTheDocument();
  });

  it('offers View only — never Edit — to someone without role:write', async () => {
    setup(user({ permissions: ['role:read'] }));
    const own = await card('My Own Role');
    expect(own.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });
});
