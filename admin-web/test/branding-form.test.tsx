import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { renderWithProviders } from './utils';
import { BrandingForm } from '@/features/org/branding-form';
import { RbacProvider } from '@/lib/rbac/context';
import type { SessionUser } from '@/lib/api/types';

/**
 * Branding settings (M20 W1).
 *
 * The form validates the same rules the server does, so a customer is told what
 * is wrong before a round trip — and, more importantly, cannot save a value the
 * server would silently reject.
 */

const getBranding = vi.fn();
const updateBranding = vi.fn();
const uploadLogo = vi.fn();
const removeLogo = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  getBranding: (...a: unknown[]) => getBranding(...a),
  updateBranding: (...a: unknown[]) => updateBranding(...a),
  uploadLogo: (...a: unknown[]) => uploadLogo(...a),
  removeLogo: (...a: unknown[]) => removeLogo(...a),
}));

const success = vi.fn();
vi.mock('@/lib/hooks/use-api-toast', () => ({ useApiToast: () => ({ success, error: vi.fn() }) }));

const BRANDING = {
  displayName: 'Acme Marine',
  logoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/branding/logo.png',
  accentColor: '#1f6feb',
  supportEmail: 'help@acme.example',
  isCustomised: true,
  updatedAt: '2026-08-25T00:00:00.000Z',
};

const user = (perms: string[]): SessionUser =>
  ({
    id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B',
    role: 'admin', organizationId: 'o1', permissions: perms, isSuperAdmin: false,
  }) as SessionUser;

const setup = (perms = ['org:write']) =>
  renderWithProviders(
    <RbacProvider user={user(perms)}>
      <BrandingForm />
    </RbacProvider>,
  );

describe('BrandingForm', () => {
  beforeEach(() => {
    getBranding.mockReset().mockResolvedValue(BRANDING);
    updateBranding.mockReset().mockResolvedValue(BRANDING);
    uploadLogo.mockReset().mockResolvedValue(BRANDING);
    removeLogo.mockReset().mockResolvedValue(BRANDING);
    success.mockReset();
  });

  it('seeds the fields from the server, fallbacks already applied', async () => {
    setup();
    // The field appears one render BEFORE the effect seeds it, so waiting on the
    // element alone is a race — wait on the value.
    await screen.findByLabelText(/display name/i);
    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toHaveValue('Acme Marine'));
    expect(screen.getByLabelText(/accent colour/i)).toHaveValue('#1f6feb');
    expect(screen.getByLabelText(/support email/i)).toHaveValue('help@acme.example');
  });

  it('rejects a colour that is not a hex value, before any round trip', async () => {
    const u = userEvent.setup();
    setup();
    const accent = await screen.findByLabelText(/accent colour/i);
    await u.clear(accent);
    await u.type(accent, 'red');
    await u.click(screen.getByRole('button', { name: /save branding/i }));

    expect(await screen.findByText(/hex value like/i)).toBeInTheDocument();
    expect(updateBranding).not.toHaveBeenCalled();
  });

  it('rejects a malformed support email', async () => {
    const u = userEvent.setup();
    setup();
    const email = await screen.findByLabelText(/support email/i);
    await u.clear(email);
    await u.type(email, 'nope');
    await u.click(screen.getByRole('button', { name: /save branding/i }));

    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
    expect(updateBranding).not.toHaveBeenCalled();
  });

  it('saves the whole form, including a cleared field', async () => {
    const u = userEvent.setup();
    setup();
    const name = await screen.findByLabelText(/display name/i);
    await u.clear(name);
    await u.click(screen.getByRole('button', { name: /save branding/i }));

    await waitFor(() => expect(updateBranding).toHaveBeenCalled());
    // An empty string is meaningful — it clears back to the organisation name.
    expect(updateBranding.mock.calls[0][0]).toMatchObject({ displayName: '' });
    expect(success).toHaveBeenCalled();
  });

  it('accepts an empty accent — that is how you remove it', async () => {
    const u = userEvent.setup();
    setup();
    const accent = await screen.findByLabelText(/accent colour/i);
    await u.clear(accent);
    await u.click(screen.getByRole('button', { name: /save branding/i }));

    await waitFor(() => expect(updateBranding).toHaveBeenCalled());
    expect(screen.queryByText(/hex value like/i)).not.toBeInTheDocument();
  });

  it('hides the save button from someone without org:write', async () => {
    setup(['data:read']);
    await screen.findByLabelText(/display name/i);
    expect(screen.queryByRole('button', { name: /save branding/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only an administrator can change branding/i)).toBeInTheDocument();
  });

  it('surfaces a server rejection rather than claiming success', async () => {
    const u = userEvent.setup();
    updateBranding.mockRejectedValue(new Error('The accent colour must be a hex value like #1f6feb'));
    setup();
    await screen.findByLabelText(/display name/i);
    await u.click(screen.getByRole('button', { name: /save branding/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/hex value/i);
    expect(success).not.toHaveBeenCalled();
  });

  describe('logo', () => {
    const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' });

    it('uploads a PNG', async () => {
      const u = userEvent.setup();
      setup();
      await screen.findByLabelText(/display name/i);
      await u.upload(screen.getByLabelText(/^logo$/i), png());

      await waitFor(() => expect(uploadLogo).toHaveBeenCalled());
      expect((uploadLogo.mock.calls[0][0] as File).name).toBe('logo.png');
    });

    it('REFUSES a non-image before spending the upload', async () => {
      setup();
      await screen.findByLabelText(/display name/i);
      const input = screen.getByLabelText(/^logo$/i) as HTMLInputElement;

      // `fireEvent`, not `userEvent`: the latter honours the `accept` attribute
      // and simply refuses to attach the file, so the handler under test never
      // runs. The browser enforces `accept` too — this covers what gets PAST it,
      // which is the only reason the client-side check exists.
      const csv = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });
      fireEvent.change(input, { target: { files: [csv] } });

      expect(await screen.findByText(/PNG, JPEG or WebP image/i)).toBeInTheDocument();
      expect(uploadLogo).not.toHaveBeenCalled();
    });

    it('refuses an image over 2 MB', async () => {
      const u = userEvent.setup();
      setup();
      await screen.findByLabelText(/display name/i);
      const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
      await u.upload(screen.getByLabelText(/^logo$/i), big);

      expect(await screen.findByText(/larger than 2 MB/i)).toBeInTheDocument();
      expect(uploadLogo).not.toHaveBeenCalled();
    });

    it('offers Replace and Remove once a logo exists', async () => {
      setup();
      expect(await screen.findByRole('button', { name: /replace logo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
    });

    it('offers only Upload when there is none', async () => {
      getBranding.mockResolvedValue({ ...BRANDING, logoUrl: '' });
      setup();
      expect(await screen.findByRole('button', { name: /upload logo/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
    });

    it('removes the logo on request', async () => {
      const u = userEvent.setup();
      setup();
      await u.click(await screen.findByRole('button', { name: /^remove$/i }));
      await waitFor(() => expect(removeLogo).toHaveBeenCalled());
    });

    it('hides both controls from someone without org:write', async () => {
      setup(['data:read']);
      await screen.findByLabelText(/display name/i);
      expect(screen.queryByRole('button', { name: /logo/i })).not.toBeInTheDocument();
    });
  });
});
