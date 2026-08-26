import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { OrganizationsService } from '../src/organizations/organizations.service';
import { Organization } from '../src/models/Organization';
import { PublicService } from '../src/share/public.service';

/**
 * Branding (M20 W1).
 *
 * Fallbacks are resolved SERVER-SIDE so the shell, exports and share pages all
 * render the same values. If each client applied its own rules they would
 * eventually disagree, and the customer would see two different names for
 * themselves.
 */

jest.setTimeout(60_000);

describe('Branding', () => {
  const service = new OrganizationsService();
  const actor = { userId: new Types.ObjectId().toString(), email: 'brand@test.invalid' };
  let orgId: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const org = await Organization.create({
      name: `Brand Co ${Date.now()}`, slug: `brand-${Date.now()}`,
      contactEmail: 'b@test.invalid', country: 'AU', timezone: 'Australia/Sydney',
    });
    orgId = String(org._id);
  });

  afterAll(async () => {
    await Organization.deleteOne({ _id: orgId });
    await mongoose.disconnect();
  });

  it('falls back to the organisation name before anything is set', async () => {
    const b = await service.getBranding(orgId);
    const org = await Organization.findById(orgId).select('name').lean();
    expect(b.displayName).toBe(org!.name);
    expect(b.isCustomised).toBe(false);
  });

  it('reports isCustomised only once something is actually set', async () => {
    expect((await service.getBranding(orgId)).isCustomised).toBe(false);
    await service.updateBranding(orgId, { displayName: 'Brand Short' }, actor);
    expect((await service.getBranding(orgId)).isCustomised).toBe(true);
  });

  it('does not count a support email alone as customised branding', async () => {
    // It changes no visual, so treating it as "branded" would suppress the
    // platform default for no reason.
    const org = await Organization.create({
      name: `Brand Email ${Date.now()}`, slug: `brand-email-${Date.now()}`,
      contactEmail: 'e@test.invalid', country: 'AU', timezone: 'UTC',
    });
    try {
      await service.updateBranding(String(org._id), { supportEmail: 'help@test.invalid' }, actor);
      expect((await service.getBranding(String(org._id))).isCustomised).toBe(false);
    } finally {
      await Organization.deleteOne({ _id: org._id });
    }
  });

  it('stores the accent colour lowercased, so two spellings compare equal', async () => {
    const b = await service.updateBranding(orgId, { accentColor: '#1F6FEB' }, actor);
    expect(b.accentColor).toBe('#1f6feb');
  });

  it('rejects a colour that is not #rrggbb', async () => {
    // Anything else would have to be re-parsed by every surface that renders it.
    for (const bad of ['red', 'rgb(1,2,3)', '#fff', '#12345g', '1f6feb']) {
      await expect(service.updateBranding(orgId, { accentColor: bad }, actor)).rejects.toMatchObject({
        statusCode: 400,
      });
    }
  });

  it('rejects a malformed support email', async () => {
    await expect(service.updateBranding(orgId, { supportEmail: 'nope' }, actor)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects an over-long display name', async () => {
    await expect(service.updateBranding(orgId, { displayName: 'x'.repeat(61) }, actor)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('CLEARS a field back to the default when given an empty string', async () => {
    // This is how a customer removes a logo or accent — no separate reset route.
    await service.updateBranding(orgId, { displayName: 'Temporary' }, actor);
    expect((await service.getBranding(orgId)).displayName).toBe('Temporary');

    await service.updateBranding(orgId, { displayName: '' }, actor);
    const org = await Organization.findById(orgId).select('name').lean();
    expect((await service.getBranding(orgId)).displayName).toBe(org!.name);
  });

  it('leaves untouched fields alone on a partial update', async () => {
    // A colour that passes the contrast guard rails — an arbitrary hex would now
    // be refused, which is the rule working, not a fixture problem.
    await service.updateBranding(orgId, { displayName: 'Keep Me', accentColor: '#1f6feb' }, actor);
    await service.updateBranding(orgId, { supportEmail: 'help@test.invalid' }, actor);

    const b = await service.getBranding(orgId);
    expect(b.displayName).toBe('Keep Me');
    expect(b.accentColor).toBe('#1f6feb');
  });

  it('is a no-op — not an error — when nothing is sent', async () => {
    const before = await service.getBranding(orgId);
    const after = await service.updateBranding(orgId, {}, actor);
    expect(after.displayName).toBe(before.displayName);
    expect(after.accentColor).toBe(before.accentColor);
  });

  it('stamps updatedAt so a stale cache can be spotted', async () => {
    const b = await service.updateBranding(orgId, { displayName: 'Stamped' }, actor);
    expect(b.updatedAt).toBeTruthy();
  });

  it('keeps one organisation’s branding out of another’s', async () => {
    const other = await Organization.create({
      name: `Brand Other ${Date.now()}`, slug: `brand-other-${Date.now()}`,
      contactEmail: 'o@test.invalid', country: 'AU', timezone: 'UTC',
    });
    try {
      await service.updateBranding(orgId, { displayName: 'Mine Only' }, actor);
      expect((await service.getBranding(String(other._id))).displayName).toBe(other.name);
    } finally {
      await Organization.deleteOne({ _id: other._id });
    }
  });

  it('REFUSES an accent that would be unreadable', async () => {
    // A customer branding themselves into an unusable panel is worse than being
    // told no — the buttons would be their colour and nobody could read them.
    for (const bad of ['#ffff00', '#ffffff', '#000000', '#facc15']) {
      await expect(service.updateBranding(orgId, { accentColor: bad }, actor)).rejects.toMatchObject({
        statusCode: 400,
        code: 'ACCENT_CONTRAST',
      });
    }
  });

  it('explains why, naming the ratio', async () => {
    await expect(service.updateBranding(orgId, { accentColor: '#facc15' }, actor)).rejects.toMatchObject({
      message: expect.stringMatching(/1\.5:1/),
    });
  });

  it('accepts a readable accent and derives its foreground', async () => {
    const dark = await service.updateBranding(orgId, { accentColor: '#1f6feb' }, actor);
    expect(dark.accentForeground).toBe('#ffffff');

    const light = await service.updateBranding(orgId, { accentColor: '#0d9488' }, actor);
    expect(light.accentForeground).toBe('#000000');
  });

  it('leaves the foreground empty when no accent is set', async () => {
    const b = await service.updateBranding(orgId, { accentColor: '' }, actor);
    expect(b.accentColor).toBe('');
    expect(b.accentForeground).toBe('');
  });

  it('still rejects a malformed hex before it ever reaches the contrast check', async () => {
    await expect(service.updateBranding(orgId, { accentColor: 'teal' }, actor)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  describe('on a public share page', () => {
    const publicService = new PublicService();

    it('exposes name, logo and accent to an unauthenticated viewer', async () => {
      // The recipient has no session, so the page cannot call the authenticated
      // branding endpoint — it would 401. This payload is the only route by
      // which a shared page can carry the customer's identity.
      await service.updateBranding(orgId, { displayName: 'Shared Co', accentColor: '#1f6feb' }, actor);
      const b = await (publicService as unknown as {
        publicBranding: (id: string) => Promise<Record<string, unknown> | null>;
      }).publicBranding(orgId);

      expect(b).toMatchObject({ displayName: 'Shared Co', accentColor: '#1f6feb', accentForeground: '#ffffff' });
    });

    it('WITHHOLDS the support email from a link anyone can forward', async () => {
      await service.updateBranding(orgId, { supportEmail: 'help@test.invalid' }, actor);
      const b = await (publicService as unknown as {
        publicBranding: (id: string) => Promise<Record<string, unknown> | null>;
      }).publicBranding(orgId);

      expect(b).not.toHaveProperty('supportEmail');
      expect(JSON.stringify(b)).not.toContain('help@test.invalid');
    });

    it('falls back to the organisation name for an unbranded customer', async () => {
      const plain = await Organization.create({
        name: `Plain Share ${Date.now()}`, slug: `plain-share-${Date.now()}`,
        contactEmail: 'p@test.invalid', country: 'AU', timezone: 'UTC',
      });
      try {
        const b = await (publicService as unknown as {
          publicBranding: (id: string) => Promise<Record<string, unknown> | null>;
        }).publicBranding(String(plain._id));
        expect(b).toMatchObject({ displayName: plain.name, logoUrl: '', accentColor: '', accentForeground: '' });
      } finally {
        await Organization.deleteOne({ _id: plain._id });
      }
    });
  });
});
