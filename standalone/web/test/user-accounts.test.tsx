import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import messages from '@/messages/en.json';
import { RbacProvider } from '@/lib/rbac/context';
import { ApiError } from '@/lib/api/errors';
import type { OrgUser, SessionUser } from '@/lib/api/types';

/**
 * Phase 5 — accounts on a site PC, where there is no email: an administrator
 * approves sign-ups and sets passwords; a user given a password chooses their own.
 */

const listUsers = vi.fn();
const updateUser = vi.fn();
const removeUser = vi.fn();
const resetUserPassword = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  listUsers: (...a: unknown[]) => listUsers(...a),
  updateUser: (...a: unknown[]) => updateUser(...a),
  removeUser: (...a: unknown[]) => removeUser(...a),
  resetUserPassword: (...a: unknown[]) => resetUserPassword(...a),
  createUser: vi.fn(),
}));
vi.mock('@/features/roles/use-roles', () => ({
  useAssignableRoles: () => ({ data: [{ _id: 'r-viewer', name: 'Viewer' }, { _id: 'r-admin', name: 'Organisation Admin' }] }),
}));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@/lib/hooks/use-api-toast', () => ({ useApiToast: () => toast }));

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
const login = vi.fn();
vi.mock('@/features/auth/auth-client', () => ({ authApi: { login: (...a: unknown[]) => login(...a) } }));
const patch = vi.fn();
vi.mock('@/lib/api/http', () => ({ http: { patch: (...a: unknown[]) => patch(...a) } }));

import { UsersTable } from '@/features/org/users-table';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { LoginForm } from '@/features/auth/login-form';

const ME: SessionUser = {
  id: 'me', email: 'admin@site', firstName: 'Ada', lastName: 'Admin', role: 'admin', organizationId: 'o',
  permissions: ['user:read', 'user:write'],
} as SessionUser;

const row = (over: Partial<OrgUser>): OrgUser =>
  ({ id: 'x', email: 'x@site', firstName: 'X', lastName: '', role: 'viewer', roleId: 'r-viewer', roleName: 'Viewer',
     isActive: true, pendingApproval: false, mustChangePassword: false, lastLoginAt: null, ...over }) as OrgUser;

function renderUi(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={qc}>
        <RbacProvider user={ME}>{ui}</RbacProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const menuFor = async (email: string) => {
  const cell = await screen.findByText(email);
  return within(cell.closest('tr')!).getByRole('button');
};

beforeEach(() => {
  vi.clearAllMocks();
  listUsers.mockResolvedValue({
    rows: [
      row({ id: 'me', email: 'admin@site', role: 'admin', roleId: 'r-admin', roleName: 'Organisation Admin' }),
      row({ id: 'sam', email: 'sam@site', firstName: 'Sam', isActive: false, pendingApproval: true }),
      row({ id: 'kim', email: 'kim@site', firstName: 'Kim', roleName: 'Site Supervisor', mustChangePassword: true }),
    ],
    total: 3, page: 1, pageCount: 1,
  });
  updateUser.mockResolvedValue(row({}));
  resetUserPassword.mockResolvedValue(row({ mustChangePassword: true }));
});

describe('Users screen', () => {
  it('puts accounts awaiting approval first, says how many, and approves one', async () => {
    const u = userEvent.setup();
    renderUi(<UsersTable />);
    expect(await screen.findByText('1 account is waiting for approval.')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('sam@site')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Awaiting approval')).toBeInTheDocument();

    await u.click(await menuFor('sam@site'));
    await u.click(await screen.findByRole('menuitem', { name: 'Approve' }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith('sam', { isActive: true }));
  });

  it('shows the role actually held — a custom role by its own name — and who must change their password', async () => {
    renderUi(<UsersTable />);
    const kim = (await screen.findByText('kim@site')).closest('tr')!;
    expect(within(kim).getByText('Site Supervisor')).toBeInTheDocument();
    expect(within(kim).getByText('Must change password')).toBeInTheDocument();
  });

  it('sets a password for someone: suggested, sent, then shown once to pass on', async () => {
    const u = userEvent.setup();
    renderUi(<UsersTable />);
    await u.click(await menuFor('kim@site'));
    await u.click(await screen.findByRole('menuitem', { name: 'Reset password' }));

    const field = (await screen.findByLabelText('Password')) as HTMLInputElement;
    // A 12-character suggestion without look-alikes.
    expect(field.value).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    await u.clear(field);
    await u.type(field, 'Temp-Pass-99');
    await u.click(screen.getByRole('button', { name: 'Set password' }));

    await waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith('kim', 'Temp-Pass-99'));
    expect(await screen.findByText(/Password set\. Give it to Kim/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy password' })).toBeInTheDocument();
  });

  it('will not open the menu on your own row — your password is on your profile', async () => {
    renderUi(<UsersTable />);
    expect(await menuFor('admin@site')).toBeDisabled();
  });
});

describe('choosing your own password after an admin set one', () => {
  it('changes it, signs in again with it, and goes on to the portal', async () => {
    const u = userEvent.setup();
    patch.mockResolvedValue({});
    login.mockResolvedValue({ user: {} });
    renderUi(<ChangePasswordForm email="kim@site" />);
    await u.type(screen.getByLabelText('Current password'), 'Temp-Pass-99');
    await u.type(screen.getByLabelText('New password'), 'Kims-Own-Pass');
    await u.type(screen.getByLabelText('Confirm password'), 'Kims-Own-Pass');
    await u.click(screen.getByRole('button', { name: 'Save and continue' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(patch).toHaveBeenCalledWith('/users/me', { currentPassword: 'Temp-Pass-99', newPassword: 'Kims-Own-Pass' });
    expect(login).toHaveBeenCalledWith('kim@site', 'Kims-Own-Pass');
  });

  it('says so when the current password is wrong, and stays', async () => {
    const u = userEvent.setup();
    patch.mockRejectedValue(new ApiError(400, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect'));
    renderUi(<ChangePasswordForm email="kim@site" />);
    await u.type(screen.getByLabelText('Current password'), 'nope-nope');
    await u.type(screen.getByLabelText('New password'), 'Kims-Own-Pass');
    await u.type(screen.getByLabelText('Confirm password'), 'Kims-Own-Pass');
    await u.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(await screen.findByText('The current password is incorrect')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('sign-in', () => {
  it('tells someone awaiting approval why they cannot sign in', async () => {
    const u = userEvent.setup();
    login.mockRejectedValue(new ApiError(403, 'ACCOUNT_PENDING', 'pending'));
    renderUi(<LoginForm />);
    await u.type(screen.getByLabelText('Email'), 'sam@site.local');
    await u.type(screen.getByLabelText('Password'), 'Signup@12345');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('waiting for an administrator to approve it');
  });

  it('offers "Create an account" only when the site allows sign-up', () => {
    const { unmount } = renderUi(<LoginForm />);
    expect(screen.queryByRole('link', { name: 'Create an account' })).not.toBeInTheDocument();
    unmount();
    renderUi(<LoginForm selfSignup />);
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup');
  });
});
