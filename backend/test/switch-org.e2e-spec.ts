import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { AuthService } from '../src/auth/auth.service';
import { SwitchOrgDto } from '../src/auth/dto';
import { Organization } from '../src/models/Organization';
import { User } from '../src/models/User';
import { RefreshToken } from '../src/models/RefreshToken';
import { verifyAccessToken } from '../src/utils/jwt';

/**
 * Super-admin organisation switching (M19 W1).
 *
 * The design rule: switching RE-POINTS `organizationId` at the customer, it does
 * not bypass tenancy. Every existing filter in the codebase then scopes
 * correctly with no change — which is only true if the claim really changes.
 */

jest.setTimeout(60_000);

describe('AuthService.switchOrganization', () => {
  const service = new AuthService();
  let superUser: any;
  let plainUser: any;
  let homeOrg: Types.ObjectId;
  let otherOrg: Types.ObjectId;
  const madeUsers: Types.ObjectId[] = [];
  const madeOrgs: Types.ObjectId[] = [];

  const claims = (token: string) => verifyAccessToken(token);

  /** A fresh refresh token for a user, as login would mint. */
  const sessionFor = async (user: any) => {
    const res = await (service as any).buildAuthResult(user, 'jest');
    return res as { accessToken: string; refreshToken: string };
  };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });

    const mk = async (name: string) => {
      const o = await Organization.create({
        name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`,
        contactEmail: 'x@test.invalid', country: 'AU', timezone: 'Australia/Sydney',
      });
      madeOrgs.push(o._id as Types.ObjectId);
      return o._id as Types.ObjectId;
    };
    homeOrg = await mk('Switch Home');
    otherOrg = await mk('Switch Target');

    superUser = await User.create({
      organizationId: homeOrg, email: `sw-super-${Date.now()}@test.invalid`,
      passwordHash: 'x'.repeat(60), firstName: 'S', lastName: 'A',
      role: 'admin', isSuperAdmin: true, isActive: true,
    });
    plainUser = await User.create({
      organizationId: homeOrg, email: `sw-plain-${Date.now()}@test.invalid`,
      passwordHash: 'x'.repeat(60), firstName: 'P', lastName: 'U',
      role: 'admin', isSuperAdmin: false, isActive: true,
    });
    madeUsers.push(superUser._id, plainUser._id);
  });

  afterAll(async () => {
    await RefreshToken.deleteMany({ userId: { $in: madeUsers } });
    await User.deleteMany({ _id: { $in: madeUsers } });
    await Organization.deleteMany({ _id: { $in: madeOrgs } });
    await mongoose.disconnect();
  });

  it('RE-POINTS organizationId at the customer, so existing filters just work', async () => {
    const s = await sessionFor(superUser);
    const res = await service.switchOrganization(String(superUser._id), String(otherOrg), s.refreshToken);
    expect(claims(res.accessToken).organizationId).toBe(String(otherOrg));
  });

  it('remembers the home organisation, for the "acting as" banner', async () => {
    const s = await sessionFor(superUser);
    const res = await service.switchOrganization(String(superUser._id), String(otherOrg), s.refreshToken);
    expect(claims(res.accessToken).homeOrganizationId).toBe(String(homeOrg));
  });

  it('keeps the assumption across a REFRESH, instead of teleporting home', async () => {
    // The whole point: without this the session silently reverts to the admin's
    // own organisation within 15 minutes, mid-investigation.
    const s = await sessionFor(superUser);
    const sw = await service.switchOrganization(String(superUser._id), String(otherOrg), s.refreshToken);
    const refreshed = await service.refreshAccessToken(sw.refreshToken);
    expect(claims(refreshed.accessToken).organizationId).toBe(String(otherOrg));
  });

  it('revokes the refresh token presented at the switch', async () => {
    const s = await sessionFor(superUser);
    await service.switchOrganization(String(superUser._id), String(otherOrg), s.refreshToken);
    await expect(service.refreshAccessToken(s.refreshToken)).rejects.toMatchObject({ code: 'TOKEN_REVOKED' });
  });

  it('switches back when given null, clearing the banner', async () => {
    const s = await sessionFor(superUser);
    const sw = await service.switchOrganization(String(superUser._id), String(otherOrg), s.refreshToken);
    const back = await service.switchOrganization(String(superUser._id), null, sw.refreshToken);
    expect(claims(back.accessToken).organizationId).toBe(String(homeOrg));
    expect(claims(back.accessToken).homeOrganizationId).toBeUndefined();
  });

  it('REFUSES a user who is not a platform administrator', async () => {
    const s = await sessionFor(plainUser);
    await expect(
      service.switchOrganization(String(plainUser._id), String(otherOrg), s.refreshToken),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('checks super-admin against the DATABASE, not the token', async () => {
    // A demoted administrator still holding a valid token must not be able to
    // walk into a customer's data.
    const s = await sessionFor(superUser);
    await User.updateOne({ _id: superUser._id }, { $set: { isSuperAdmin: false } });
    try {
      await expect(
        service.switchOrganization(String(superUser._id), String(otherOrg), s.refreshToken),
      ).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await User.updateOne({ _id: superUser._id }, { $set: { isSuperAdmin: true } });
    }
  });

  it('drops an existing assumption once the user is demoted', async () => {
    // Their switched session must not outlive the privilege that granted it.
    const s = await sessionFor(superUser);
    const sw = await service.switchOrganization(String(superUser._id), String(otherOrg), s.refreshToken);
    await User.updateOne({ _id: superUser._id }, { $set: { isSuperAdmin: false } });
    try {
      const refreshed = await service.refreshAccessToken(sw.refreshToken);
      expect(claims(refreshed.accessToken).organizationId).toBe(String(homeOrg));
      expect(claims(refreshed.accessToken).sup).toBe(false);
    } finally {
      await User.updateOne({ _id: superUser._id }, { $set: { isSuperAdmin: true } });
    }
  });

  it('404s an unknown or malformed organisation', async () => {
    const s = await sessionFor(superUser);
    await expect(
      service.switchOrganization(String(superUser._id), '000000000000000000000000', s.refreshToken),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.switchOrganization(String(superUser._id), 'not-an-id', s.refreshToken),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('treats switching to your own organisation as switching back', async () => {
    const s = await sessionFor(superUser);
    const res = await service.switchOrganization(String(superUser._id), String(homeOrg), s.refreshToken);
    expect(claims(res.accessToken).organizationId).toBe(String(homeOrg));
    expect(claims(res.accessToken).homeOrganizationId).toBeUndefined();
  });
});

describe('SwitchOrgDto', () => {
  it('carries real validators, so the whitelist pipe cannot strip its fields', async () => {
    // Swagger-only DTOs are fine on handlers that type the body inline, but a
    // handler annotated with a DTO CLASS has every undecorated property removed
    // by `whitelist: true` — which made every switch silently a no-op.
    const dto = plainToInstance(SwitchOrgDto, { organizationId: 'abc', refreshToken: 'def' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.organizationId).toBe('abc');
    expect(dto.refreshToken).toBe('def');
  });

  it('accepts an empty body — that means "switch back to my own"', async () => {
    expect(await validate(plainToInstance(SwitchOrgDto, {}))).toEqual([]);
  });
});
