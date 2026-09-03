import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import messages from '@/messages/en.json';
import { RbacProvider } from '@/lib/rbac/context';
import { CommandPalette } from '@/components/app-shell/command-palette';
import type { SessionUser } from '@/lib/api/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// The palette's remote groups are covered by their own feature tests; here we
// pin the shell behaviour (shortcut, RBAC filtering, keyboard nav, routing).
vi.mock('@/components/app-shell/use-command-search', () => ({
  useCommandSearch: () => ({ hits: [], isFetching: false }),
}));

const user = (role: SessionUser['role']): SessionUser => ({
  id: 'u1',
  email: 'a@b.c',
  firstName: 'Test',
  lastName: 'User',
  role,
  organizationId: 'o1',
});

function renderPalette(role: SessionUser['role'] = 'admin') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={qc}>
        <RbacProvider user={user(role)}>
          <CommandPalette />
        </RbacProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('CommandPalette (plan §13)', () => {
  beforeEach(() => push.mockClear());

  it('opens on ⌘K and closes on a second press', async () => {
    const u = userEvent.setup();
    renderPalette();
    expect(screen.queryByRole('listbox')).toBeNull();

    await u.keyboard('{Meta>}k{/Meta}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await u.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('opens on Ctrl+K for non-Mac keyboards', async () => {
    const u = userEvent.setup();
    renderPalette();
    await u.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('lists destinations and routes to the chosen one', async () => {
    const u = userEvent.setup();
    renderPalette();
    await u.click(screen.getByRole('button', { name: /search devices, sessions and records/i }));

    // Labelled "Stations" now — the route is unchanged, only the wording.
    const stations = await screen.findByRole('option', { name: /stations/i });
    await u.click(stations);
    expect(push).toHaveBeenCalledWith('/devices');
  });

  it('renders resolved nav labels, not raw i18n keys', async () => {
    const u = userEvent.setup();
    renderPalette();
    await u.click(screen.getByRole('button', { name: /search devices, sessions and records/i }));
    await screen.findByRole('listbox');

    // Regression: nav labelKeys are root-relative, so resolving them through the
    // 'shell' namespace rendered the literal "nav.settings" in every row.
    for (const option of screen.getAllByRole('option')) {
      expect(option.textContent).not.toMatch(/\bnav\./);
    }
    // A concrete resolved label, to prove the loop above is not vacuous on an
    // empty list. "Fleet map" used to serve here; it is gated off now (the SFTP
    // files carry no GPS), so "Stations" stands in.
    expect(screen.getByRole('option', { name: 'Stations' })).toBeInTheDocument();
  });

  it('hides destinations the role has no capability for', async () => {
    const u = userEvent.setup();
    renderPalette('viewer'); // no manageOrg → no Users; no importData → no Import
    await u.click(screen.getByRole('button', { name: /search devices, sessions and records/i }));
    await screen.findByRole('listbox');

    expect(screen.queryByRole('option', { name: /^users$/i })).toBeNull();
    expect(screen.queryByRole('option', { name: /import data/i })).toBeNull();
    // …but a viewer can still reach the dashboard.
    expect(screen.getByRole('option', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('filters destinations as you type', async () => {
    const u = userEvent.setup();
    renderPalette();
    await u.click(screen.getByRole('button', { name: /search devices, sessions and records/i }));
    // Was 'alert' before the alerts section was switched off — that destination
    // no longer exists in the nav, so filter on another one.
    await u.type(screen.getByRole('combobox'), 'notif');

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /notifications/i })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /dashboard/i })).toBeNull();
    });
  });

  it('moves the cursor with the arrow keys and activates with Enter', async () => {
    const u = userEvent.setup();
    renderPalette();
    await u.click(screen.getByRole('button', { name: /search devices, sessions and records/i }));
    await screen.findByRole('listbox');

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await u.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    await u.keyboard('{Enter}');
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('wraps the cursor at both ends', async () => {
    const u = userEvent.setup();
    renderPalette();
    await u.click(screen.getByRole('button', { name: /search devices, sessions and records/i }));
    await screen.findByRole('listbox');
    const count = screen.getAllByRole('option').length;

    // Up from the first wraps to the last.
    await u.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[count - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('points aria-activedescendant at the selected option', async () => {
    const u = userEvent.setup();
    renderPalette();
    await u.click(screen.getByRole('button', { name: /search devices, sessions and records/i }));
    const input = await screen.findByRole('combobox');

    expect(input).toHaveAttribute('aria-activedescendant', 'command-option-0');
    await u.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'command-option-1');
  });

  it('tells the user when nothing matches', async () => {
    const u = userEvent.setup();
    renderPalette();
    await u.click(screen.getByRole('button', { name: /search devices, sessions and records/i }));
    await u.type(screen.getByRole('combobox'), 'zzzznomatch');

    expect(await screen.findByText(/no matches for/i)).toBeInTheDocument();
  });
});
