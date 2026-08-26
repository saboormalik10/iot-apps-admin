import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { renderWithProviders } from './utils';
import { CreateCustomerDialog } from '@/features/tenancy/create-customer-dialog';

/**
 * Customer creation (M19 W4).
 *
 * The client asked for no email invites: the platform administrator sets the
 * password and hands it over. So the behaviours that matter are that the
 * credentials are shown ONCE and clearly, and that the form refuses input the
 * server would reject anyway.
 */

const createCustomer = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({ createCustomer: (...a: unknown[]) => createCustomer(...a) }));

const success = vi.fn();
vi.mock('@/lib/hooks/use-api-toast', () => ({ useApiToast: () => ({ success, error: vi.fn() }) }));

const CREATED = {
  organizationId: 'o1',
  name: 'Acme Marine Services',
  slug: 'acme-marine-services',
  uploadFolder: 'Acme Marine',
  timezone: 'Australia/Sydney',
  admin: { id: 'u1', email: 'ops@acme.example' },
};

const setup = () => renderWithProviders(<CreateCustomerDialog open onOpenChange={() => {}} />);

async function fillValid(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText(/customer name/i), 'Acme Marine Services');
  await u.type(screen.getByLabelText(/first name/i), 'Dana');
  await u.type(screen.getByLabelText(/last name/i), 'Galbraith');
  await u.type(screen.getByLabelText(/^email$/i), 'ops@acme.example');
  await u.type(screen.getByLabelText(/^password$/i), 'Passw0rd!');
}

describe('CreateCustomerDialog', () => {
  beforeEach(() => {
    createCustomer.mockReset().mockResolvedValue(CREATED);
    success.mockReset();
  });

  it('requires a customer name', async () => {
    const u = userEvent.setup();
    setup();
    await u.click(screen.getByRole('button', { name: /create customer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it('requires BOTH administrator names — the model rejects an empty one', async () => {
    const u = userEvent.setup();
    setup();
    await u.type(screen.getByLabelText(/customer name/i), 'Acme');
    await u.type(screen.getByLabelText(/first name/i), 'Dana');
    await u.click(screen.getByRole('button', { name: /create customer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/first and last name/i);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    const u = userEvent.setup();
    setup();
    await u.type(screen.getByLabelText(/customer name/i), 'Acme');
    await u.type(screen.getByLabelText(/first name/i), 'Dana');
    await u.type(screen.getByLabelText(/last name/i), 'Galbraith');
    await u.type(screen.getByLabelText(/^email$/i), 'not-an-email');
    await u.type(screen.getByLabelText(/^password$/i), 'Passw0rd!');
    await u.click(screen.getByRole('button', { name: /create customer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid administrator email/i);
  });

  it('rejects a password under 8 characters, matching the server rule', async () => {
    const u = userEvent.setup();
    setup();
    await u.type(screen.getByLabelText(/customer name/i), 'Acme');
    await u.type(screen.getByLabelText(/first name/i), 'Dana');
    await u.type(screen.getByLabelText(/last name/i), 'Galbraith');
    await u.type(screen.getByLabelText(/^email$/i), 'ops@acme.example');
    await u.type(screen.getByLabelText(/^password$/i), 'short');
    await u.click(screen.getByRole('button', { name: /create customer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
  });

  it('sends the whole payload, omitting an empty upload folder so the server defaults it', async () => {
    const u = userEvent.setup();
    setup();
    await fillValid(u);
    await u.click(screen.getByRole('button', { name: /create customer/i }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalled());
    expect(createCustomer.mock.calls[0][0]).toMatchObject({
      name: 'Acme Marine Services',
      uploadFolder: undefined,
      admin: { email: 'ops@acme.example', password: 'Passw0rd!', firstName: 'Dana', lastName: 'Galbraith' },
    });
  });

  it('shows the credentials ONCE after creating, including the upload folder', async () => {
    const u = userEvent.setup();
    setup();
    await fillValid(u);
    await u.click(screen.getByRole('button', { name: /create customer/i }));

    expect(await screen.findByText(/Acme Marine Services created/i)).toBeInTheDocument();
    expect(screen.getByText('ops@acme.example')).toBeInTheDocument();
    expect(screen.getByText('Passw0rd!')).toBeInTheDocument();
    expect(screen.getByText('Acme Marine')).toBeInTheDocument();
    // The form is gone — there is nothing left to submit twice.
    expect(screen.queryByRole('button', { name: /create customer/i })).not.toBeInTheDocument();
  });

  it('warns that the password cannot be shown again', async () => {
    const u = userEvent.setup();
    setup();
    await fillValid(u);
    await u.click(screen.getByRole('button', { name: /create customer/i }));
    expect(await screen.findByText(/cannot be shown again/i)).toBeInTheDocument();
  });

  it('spells out where the station files go', async () => {
    const u = userEvent.setup();
    setup();
    await fillValid(u);
    await u.click(screen.getByRole('button', { name: /create customer/i }));
    expect(await screen.findByText(/Acme Marine\/<Tower>\//)).toBeInTheDocument();
  });

  it('surfaces a server rejection instead of claiming success', async () => {
    const u = userEvent.setup();
    createCustomer.mockRejectedValue(new Error('The folder "Acme Marine" is already used by another customer'));
    setup();
    await fillValid(u);
    await u.click(screen.getByRole('button', { name: /create customer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already used by another customer/i);
    expect(success).not.toHaveBeenCalled();
  });
});
