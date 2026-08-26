import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { RoleEditorDialog } from '@/features/roles/role-editor-dialog';
import type { RoleRow } from '@/lib/api/types';

/**
 * Role editor (M18 W3).
 *
 * The editor is how a super admin decides what everyone else can do, so the
 * behaviours worth pinning are the ones that would silently grant or revoke:
 * the catalogue coming from the SERVER (a hard-coded copy could offer a
 * permission nothing enforces), state re-seeding between roles, and refusing to
 * save a role that grants nothing.
 */

const listPermissionGroups = vi.fn();
const createRole = vi.fn();
const updateRole = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  listPermissionGroups: (...a: unknown[]) => listPermissionGroups(...a),
  listRoles: vi.fn().mockResolvedValue([]),
  getRoleUsage: vi.fn(),
  createRole: (...a: unknown[]) => createRole(...a),
  updateRole: (...a: unknown[]) => updateRole(...a),
}));

const success = vi.fn();
vi.mock('@/lib/hooks/use-api-toast', () => ({
  useApiToast: () => ({ success, error: vi.fn() }),
}));

const GROUPS = [
  {
    group: 'Data',
    permissions: [
      { key: 'data:read', label: 'View data' },
      { key: 'data:export', label: 'Export data' },
    ],
  },
  { group: 'Users', permissions: [{ key: 'user:write', label: 'Manage people' }] },
];

const role = (over: Partial<RoleRow> = {}): RoleRow =>
  ({
    _id: 'r1',
    key: 'viewer',
    name: 'Viewer',
    description: 'Read only',
    permissions: ['data:read'],
    isSystem: false,
    isDefault: false,
    userCount: 2,
    ...over,
  }) as RoleRow;

function setup(props: { role?: RoleRow; open?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RoleEditorDialog role={props.role} open={props.open ?? true} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('RoleEditorDialog', () => {
  beforeEach(() => {
    listPermissionGroups.mockReset().mockResolvedValue(GROUPS);
    createRole.mockReset().mockResolvedValue({});
    updateRole.mockReset().mockResolvedValue({});
    success.mockReset();
  });

  it('renders the permission catalogue the SERVER supplies, not a local copy', async () => {
    setup();
    await screen.findByLabelText('View data');
    expect(screen.getByLabelText('Export data')).toBeInTheDocument();
    expect(screen.getByLabelText('Manage people')).toBeInTheDocument();
    expect(listPermissionGroups).toHaveBeenCalled();
  });

  it('shows the machine key next to each label so a 403 can be traced', async () => {
    setup();
    expect(await screen.findByText('data:read')).toBeInTheDocument();
  });

  it('pre-checks exactly the grants the role already holds', async () => {
    setup({ role: role({ permissions: ['data:read', 'user:write'] }) });
    await waitFor(() => expect(screen.getByLabelText('View data')).toBeChecked());
    expect(screen.getByLabelText('Manage people')).toBeChecked();
    expect(screen.getByLabelText('Export data')).not.toBeChecked();
  });

  it('refuses to save a role that grants nothing', async () => {
    const user = userEvent.setup();
    setup({ role: role({ permissions: ['data:read'] }) });
    await waitFor(() => expect(screen.getByLabelText('View data')).toBeChecked());

    await user.click(screen.getByLabelText('View data'));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one permission/i);
    expect(updateRole).not.toHaveBeenCalled();
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByLabelText('View data');
    await user.click(screen.getByRole('button', { name: /create role/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
    expect(createRole).not.toHaveBeenCalled();
  });

  it('sends the trimmed name and the selected grants', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByLabelText('View data');

    await user.type(screen.getByLabelText('Name'), '  Site Supervisor  ');
    await user.click(screen.getByLabelText('View data'));
    await user.click(screen.getByRole('button', { name: /create role/i }));

    await waitFor(() => expect(createRole).toHaveBeenCalled());
    expect(createRole.mock.calls[0][0]).toMatchObject({
      name: 'Site Supervisor',
      permissions: ['data:read'],
    });
  });

  it('select-all grants a whole group, and toggles back to clear', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByLabelText('View data');

    await user.click(screen.getAllByRole('button', { name: /select all/i })[0]);
    expect(screen.getByLabelText('View data')).toBeChecked();
    expect(screen.getByLabelText('Export data')).toBeChecked();
    expect(screen.getByLabelText('Manage people')).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.getByLabelText('View data')).not.toBeChecked();
  });

  it('warns that editing a shared role affects every organisation', async () => {
    setup({ role: role({ isSystem: true }) });
    expect(await screen.findByText(/affects them all/i)).toBeInTheDocument();
  });

  it('re-seeds when the dialog reopens for a different role', async () => {
    // Editing one role then another must not carry the first one's grants over.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <RoleEditorDialog role={role({ permissions: ['data:read'] })} open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('View data')).toBeChecked());

    rerender(
      <QueryClientProvider client={qc}>
        <RoleEditorDialog
          role={role({ _id: 'r2', name: 'Ops', permissions: ['user:write'] })}
          open
          onOpenChange={() => {}}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('Manage people')).toBeChecked());
    expect(screen.getByLabelText('View data')).not.toBeChecked();
  });

  it('surfaces a server rejection instead of claiming success', async () => {
    const user = userEvent.setup();
    createRole.mockRejectedValue(new Error('A role named "Ops" already exists'));
    setup();
    await screen.findByLabelText('View data');

    await user.type(screen.getByLabelText('Name'), 'Ops');
    await user.click(screen.getByLabelText('View data'));
    await user.click(screen.getByRole('button', { name: /create role/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
    expect(success).not.toHaveBeenCalled();
  });
});
