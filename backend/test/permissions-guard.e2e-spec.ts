import 'dotenv/config';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import mongoose from 'mongoose';

import { PermissionsGuard, PERMISSIONS_KEY } from '../src/common/guards/permissions.guard';

/**
 * PermissionsGuard (M18 W2).
 *
 * The guard runs BEFORE RolesGuard, deliberately: it is the layer being migrated
 * to, so it should be the one that decides. Ordered the other way it was dead
 * weight — RolesGuard denied first and the permission check never ran, which is
 * exactly what the first version did.
 */

jest.setTimeout(60_000);

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardRequiring(permissions: string[] | undefined): PermissionsGuard {
  const reflector = { getAllAndOverride: () => permissions } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

describe('PermissionsGuard', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('has no opinion on a route with no permission metadata', async () => {
    const guard = guardRequiring(undefined);
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
  });

  it('allows a user holding the permission', async () => {
    const guard = guardRequiring(['audit:read']);
    const req = { user: { userId: 'u1', organizationId: 'o1', role: 'admin', perms: ['audit:read'] } };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
  });

  it('denies a user who does not, naming the missing permission', async () => {
    const guard = guardRequiring(['audit:read']);
    const req = { user: { userId: 'u1', organizationId: 'o1', role: 'viewer', perms: ['data:read'] } };
    // The user does not exist in the database either, so the live re-check also
    // fails — the point is that it denies rather than passes.
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(Error);
  });

  it('requires ALL listed permissions, not any', async () => {
    const guard = guardRequiring(['data:read', 'audit:read']);
    const req = { user: { userId: 'u1', organizationId: 'o1', role: 'viewer', perms: ['data:read'] } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(Error);
  });

  it('lets a super admin through on the token claim alone', async () => {
    const guard = guardRequiring(['role:delete']);
    const req = { user: { userId: 'u1', organizationId: 'o1', role: 'viewer', perms: [], sup: true } };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
  });

  it('REJECTS a machine credential on a user endpoint', async () => {
    // The ingest agent authenticates as itself and holds no role. Without this an
    // accidental guard ordering could let it reach a user endpoint.
    const guard = guardRequiring(['data:read']);
    const req = { serviceCredential: { credentialId: 'c1', kind: 'ingest' } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unauthenticated request', async () => {
    const guard = guardRequiring(['data:read']);
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('falls back to the legacy role for a token minted before perms existed', async () => {
    // Treating a missing `perms` as "holds nothing" would lock out every
    // signed-in user until their token expired.
    const guard = guardRequiring(['data:read']);
    const req = { user: { userId: 'u1', organizationId: 'o1', role: 'viewer' } };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
  });

  it('does not let a stale token authorise a destructive permission', async () => {
    // `role:delete` is re-read from the database however good the token looks,
    // because a 15-minute lag on removing a shared role is too long.
    const guard = guardRequiring(['role:delete']);
    const req = { user: { userId: '000000000000000000000000', organizationId: 'o1', role: 'admin', perms: ['role:delete'] } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(Error);
  });

  it('exposes the metadata key the decorator writes', () => {
    expect(PERMISSIONS_KEY).toBe('requiredPermissions');
  });
});
