import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import messages from '@/messages/en.json';
import type { RoleRow } from '@/lib/api/types';

/**
 * Which role a new person gets when nobody chooses one.
 *
 * The dialog took `options[0]`, and the list is sorted least-privileged first —
 * so ANY custom role narrower than Viewer silently became the default for every
 * account created afterwards. A one-permission role made for a contractor would
 * become what everyone starts with; QA found new accounts being handed a
 * leftover role called "NaN" (24 Sep 2026).
 */
const role = (over: Partial<RoleRow>): RoleRow =>
  ({
    _id: 'r', organizationId: null, key: 'k', name: 'R', description: '',
    permissions: [], isSystem: false, isDefault: false, userCount: 0,
    ...over,
  }) as RoleRow;

// Least-privileged first, exactly as `useAssignableRoles` returns them: a
// one-permission custom role sorts ahead of the built-in Viewer.
const ROLES = [
  role({ _id: 'r-junk', name: 'NaN', permissions: ['data:read'], baseRole: 'viewer' }),
  role({ _id: 'r-viewer', name: 'Viewer', permissions: ['a', 'b', 'c', 'd', 'e'], isSystem: true, isDefault: true, baseRole: 'viewer' }),
  role({ _id: 'r-admin', name: 'Organisation Admin', permissions: new Array(16).fill('p'), isSystem: true, baseRole: 'admin' }),
];

vi.mock('@/features/roles/use-roles', () => ({ useAssignableRoles: () => ({ data: ROLES }) }));
vi.mock('@/lib/hooks/use-api-toast', () => ({ useApiToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({ createUser: vi.fn() }));

const { AddUserDialog } = await import('@/features/org/add-user-dialog');

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <AddUserDialog />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('the role a new person gets by default', () => {
  it('is the site default role, not whichever role has fewest permissions', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /add person/i }));
    // Radix renders the chosen role's NAME in the trigger.
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Viewer');
    expect(trigger).not.toHaveTextContent('NaN');
  });
});
