import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { OrgSwitcher } from '@/features/tenancy/org-switcher';
import { ActingAsBanner } from '@/features/tenancy/acting-as-banner';
import { RbacProvider } from '@/lib/rbac/context';
import messages from '@/messages/en.json';
import type { SessionUser } from '@/lib/api/types';

/**
 * Organisation switcher and "acting as" banner (M19 W2).
 *
 * Two behaviours carry real risk: a customer must never see that other
 * customers exist, and a switch must CLEAR the query cache — every cached query
 * was fetched under the previous organisation's token, so leaving it in place
 * renders one customer's data under another customer's name.
 */

const listOrganizations = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  listOrganizations: (...a: unknown[]) => listOrganizations(...a),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const ORGS = [
  { _id: 'home', name: 'Observator Instruments AU', slug: 'obs', timezone: 'Australia/Sydney', country: 'AU', deviceCount: 3, userCount: 4 },
  { _id: 'acme', name: 'Acme Marine Services', slug: 'acme', timezone: 'Australia/Sydney', country: 'AU', deviceCount: 1, userCount: 2 },
];

const user = (over: Partial<SessionUser> = {}): SessionUser =>
  ({
    id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B',
    role: 'admin', organizationId: 'home', isSuperAdmin: true, permissions: [],
    ...over,
  }) as SessionUser;

let qc: QueryClient;

function setup(ui: React.ReactElement, u: SessionUser | null) {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={qc}>
        <RbacProvider user={u}>{ui}</RbacProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  listOrganizations.mockReset().mockResolvedValue(ORGS);
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { user: {} } }) }));
});

describe('OrgSwitcher', () => {
  it('renders nothing for a customer — they must not learn other customers exist', () => {
    setup(<OrgSwitcher />, user({ isSuperAdmin: false }));
    expect(screen.queryByRole('button', { name: /switch organisation/i })).not.toBeInTheDocument();
    // ...and the 403-ing endpoint is never even called.
    expect(listOrganizations).not.toHaveBeenCalled();
  });

  it('renders nothing when signed out', () => {
    setup(<OrgSwitcher />, null);
    expect(screen.queryByRole('button', { name: /switch organisation/i })).not.toBeInTheDocument();
  });

  it('shows the organisation currently being acted in', async () => {
    setup(<OrgSwitcher />, user());
    expect(await screen.findByText('Observator Instruments AU')).toBeInTheDocument();
  });

  it('lists customers with their station and user counts', async () => {
    const u = userEvent.setup();
    setup(<OrgSwitcher />, user());
    await screen.findByText('Observator Instruments AU');
    await u.click(screen.getByRole('button', { name: /switch organisation/i }));

    expect(await screen.findByText('Acme Marine Services')).toBeInTheDocument();
    expect(screen.getByText(/1 station · 2 users/)).toBeInTheDocument();
    expect(screen.getByText(/3 stations · 4 users/)).toBeInTheDocument();
  });

  it('CLEARS the query cache on switch, so no data survives under the new org', async () => {
    const u = userEvent.setup();
    setup(<OrgSwitcher />, user());
    await screen.findByText('Observator Instruments AU');

    // Something cached under the previous organisation's token.
    qc.setQueryData(['devices'], [{ id: 'device-from-home-org' }]);
    expect(qc.getQueryData(['devices'])).toBeDefined();

    await u.click(screen.getByRole('button', { name: /switch organisation/i }));
    await u.click(await screen.findByText('Acme Marine Services'));

    await waitFor(() => expect(qc.getQueryData(['devices'])).toBeUndefined());
  });

  it('posts the switch through the BFF, never straight to the backend', async () => {
    const u = userEvent.setup();
    setup(<OrgSwitcher />, user());
    await screen.findByText('Observator Instruments AU');

    await u.click(screen.getByRole('button', { name: /switch organisation/i }));
    await u.click(await screen.findByText('Acme Marine Services'));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/auth/switch-org');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ organizationId: 'acme' });
  });

  it('sends null when picking the home org, so the assumption is cleared', async () => {
    const u = userEvent.setup();
    setup(<OrgSwitcher />, user({ organizationId: 'acme', homeOrganizationId: 'home' }));
    await screen.findByText('Acme Marine Services');

    await u.click(screen.getByRole('button', { name: /switch organisation/i }));
    await u.click(await screen.findByText('Observator Instruments AU'));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ organizationId: null });
  });

  it('re-runs the server components so the shell picks up the new session', async () => {
    const u = userEvent.setup();
    setup(<OrgSwitcher />, user());
    await screen.findByText('Observator Instruments AU');
    await u.click(screen.getByRole('button', { name: /switch organisation/i }));
    await u.click(await screen.findByText('Acme Marine Services'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('ActingAsBanner', () => {
  it('stays hidden while acting in your own organisation', () => {
    setup(<ActingAsBanner />, user());
    expect(screen.queryByRole('status', { name: /acting as/i })).not.toBeInTheDocument();
  });

  it('warns immediately, before the organisation list has even loaded', async () => {
    // Fails safe: the warning must not wait on a fetch, because the window where
    // an admin acts without realising is exactly while the page is settling.
    setup(<ActingAsBanner />, user({ organizationId: 'acme', homeOrganizationId: 'home' }));
    expect(screen.getByRole('status', { name: /acting as/i })).toHaveTextContent(/affect that customer/i);
  });

  it('names the customer once the list resolves', async () => {
    setup(<ActingAsBanner />, user({ organizationId: 'acme', homeOrganizationId: 'home' }));
    await waitFor(() => expect(screen.getByRole('status', { name: /acting as/i })).toHaveTextContent(/Acme Marine Services/));
  });

  it('offers a one-click way back', async () => {
    const u = userEvent.setup();
    setup(<ActingAsBanner />, user({ organizationId: 'acme', homeOrganizationId: 'home' }));
    await u.click(await screen.findByRole('button', { name: /return to my organisation/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ organizationId: null });
  });

  it('never appears for a customer, even with a stray home id', () => {
    // Defence in depth: the banner is a super-admin affordance only.
    setup(<ActingAsBanner />, user({ isSuperAdmin: false, organizationId: 'acme', homeOrganizationId: 'home' }));
    expect(screen.queryByRole('status', { name: /acting as/i })).not.toBeInTheDocument();
  });
});
