import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// The shared helper supplies next-intl + react-query; `LoadingState` calls
// useTranslations, so a bare render throws.
import { renderWithProviders } from './utils';

import { RoleDeleteDialog } from '@/features/roles/role-delete-dialog';
import type { RoleRow } from '@/lib/api/types';

/**
 * Role deletion with reassignment (M18 W4).
 *
 * The client's requirement: if people hold the role, say how many, offer a
 * replacement, and move them all in one click. So the behaviours pinned here are
 * the count, the forced replacement, and — most importantly — that a role held by
 * somebody can NEVER be deleted without one.
 */

const getRoleUsage = vi.fn();
const deleteRole = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  getRoleUsage: (...a: unknown[]) => getRoleUsage(...a),
  deleteRole: (...a: unknown[]) => deleteRole(...a),
  listRoles: vi.fn().mockResolvedValue([]),
  listPermissionGroups: vi.fn().mockResolvedValue([]),
  createRole: vi.fn(),
  updateRole: vi.fn(),
}));

const success = vi.fn();
vi.mock('@/lib/hooks/use-api-toast', () => ({ useApiToast: () => ({ success, error: vi.fn() }) }));

const role = (over: Partial<RoleRow> = {}): RoleRow =>
  ({ _id: 'r1', key: 'ops', name: 'Ops', description: '', permissions: ['data:read'], isSystem: false, isDefault: false, userCount: 0, ...over }) as RoleRow;

const usage = (userCount: number) => ({
  roleId: 'r1',
  name: 'Ops',
  userCount,
  users: [
    { _id: 'u1', email: 'a@b.c', firstName: 'Ada', lastName: 'Lovelace' },
    { _id: 'u2', email: 'd@e.f', firstName: 'Grace', lastName: 'Hopper' },
  ].slice(0, Math.min(userCount, 2)),
  replacements: [
    { _id: 'r2', name: 'Viewer', permissions: ['data:read'], isSystem: true },
    { _id: 'r3', name: 'Operator', permissions: ['data:read', 'user:write'], isSystem: true },
  ],
});

function setup(r: RoleRow = role()) {
  return renderWithProviders(<RoleDeleteDialog role={r} open onOpenChange={() => {}} />);
}

describe('RoleDeleteDialog', () => {
  beforeEach(() => {
    getRoleUsage.mockReset();
    deleteRole.mockReset().mockResolvedValue({ deleted: 'r1', usersMoved: 0, replacementRoleId: null });
    success.mockReset();
  });

  it('deletes straight away when nobody holds the role', async () => {
    const user = userEvent.setup();
    getRoleUsage.mockResolvedValue(usage(0));
    setup();

    expect(await screen.findByText(/nobody has this role/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete role/i }));

    await waitFor(() => expect(deleteRole).toHaveBeenCalled());
    // No replacement is sent, because none is needed.
    expect(deleteRole.mock.calls[0][1]).toBeUndefined();
  });

  it('says how many people hold the role', async () => {
    getRoleUsage.mockResolvedValue(usage(7));
    setup();
    expect(await screen.findByText(/7 people have/i)).toBeInTheDocument();
  });

  it('uses the singular for one person', async () => {
    getRoleUsage.mockResolvedValue(usage(1));
    setup();
    expect(await screen.findByText(/1 person has/i)).toBeInTheDocument();
  });

  it('REFUSES to delete a held role until a replacement is chosen', async () => {
    const user = userEvent.setup();
    getRoleUsage.mockResolvedValue(usage(3));
    setup();

    await screen.findByText(/3 people have/i);
    await user.click(screen.getByRole('button', { name: /move 3 and delete/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose which role/i);
    expect(deleteRole).not.toHaveBeenCalled();
  });

  it('moves everyone in one click once a replacement is picked', async () => {
    const user = userEvent.setup();
    getRoleUsage.mockResolvedValue(usage(3));
    deleteRole.mockResolvedValue({ deleted: 'r1', usersMoved: 3, replacementRoleId: 'r3' });
    setup();

    await screen.findByText(/3 people have/i);
    await user.click(screen.getByRole('combobox', { name: /move them to/i }));
    await user.click(await screen.findByRole('option', { name: /operator/i }));
    await user.click(screen.getByRole('button', { name: /move 3 and delete/i }));

    await waitFor(() => expect(deleteRole).toHaveBeenCalledWith('r1', 'r3'));
    expect(success).toHaveBeenCalledWith(expect.stringMatching(/3 people moved/i));
  });

  it('offers the replacements the server supplied, and never the role itself', async () => {
    const user = userEvent.setup();
    getRoleUsage.mockResolvedValue(usage(2));
    setup();

    await screen.findByText(/2 people have/i);
    await user.click(screen.getByRole('combobox', { name: /move them to/i }));

    expect(await screen.findByRole('option', { name: /viewer/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /operator/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Ops/ })).not.toBeInTheDocument();
  });

  it('names who is affected, so the decision is informed', async () => {
    getRoleUsage.mockResolvedValue(usage(2));
    setup();
    expect(await screen.findByText(/ada lovelace, grace hopper/i)).toBeInTheDocument();
  });

  it('warns that deleting a shared role affects every organisation', async () => {
    getRoleUsage.mockResolvedValue(usage(0));
    setup(role({ isSystem: true }));
    expect(await screen.findByText(/affects them all/i)).toBeInTheDocument();
  });

  it('surfaces a server refusal rather than claiming success', async () => {
    const user = userEvent.setup();
    getRoleUsage.mockResolvedValue(usage(1));
    // The lockout guard: the replacement grants no user management.
    deleteRole.mockRejectedValue(new Error('That replacement grants no user management'));
    setup();

    await screen.findByText(/1 person has/i);
    await user.click(screen.getByRole('combobox', { name: /move them to/i }));
    await user.click(await screen.findByRole('option', { name: /viewer/i }));
    await user.click(screen.getByRole('button', { name: /move 1 and delete/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no user management/i);
    expect(success).not.toHaveBeenCalled();
  });
});
