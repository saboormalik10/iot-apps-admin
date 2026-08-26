import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';


import { claimsFromAccessToken, withClaims } from '@/lib/bff/claims';
import { RbacProvider, useRbac } from '@/lib/rbac/context';
import { Can } from '@/lib/rbac/guard';
import type { SessionUser } from '@/lib/api/types';

/**
 * Permission-aware RBAC (M18 W3).
 *
 * M18 W2 put `perms`/`sup` in the JWT but nothing on the client read them, so the
 * UI still gated on the legacy three-role matrix — an org admin was shown a "New
 * role" button the server would refuse. These cover the claim decoding and, most
 * importantly, that a session predating the claim keeps working.
 */

const token = (payload: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

const user = (over: Partial<SessionUser> = {}): SessionUser =>
  ({
    id: 'u1',
    email: 'a@b.c',
    firstName: 'A',
    lastName: 'B',
    role: 'admin',
    organizationId: 'o1',
    ...over,
  }) as SessionUser;

describe('claimsFromAccessToken', () => {
  it('reads perms and sup', () => {
    expect(claimsFromAccessToken(token({ perms: ['role:read', 'role:write'], sup: true }))).toEqual({
      permissions: ['role:read', 'role:write'],
      isSuperAdmin: true,
      homeOrganizationId: null,
    });
  });

  it('reads homeOrganizationId, which marks a switched session', () => {
    // Present only while a platform admin is acting inside a customer's org —
    // it is what raises the "acting as" banner.
    expect(claimsFromAccessToken(token({ sup: true, homeOrganizationId: 'org-1' })).homeOrganizationId).toBe('org-1');
    expect(claimsFromAccessToken(token({ sup: true })).homeOrganizationId).toBeNull();
  });

  it('ignores a non-string homeOrganizationId', () => {
    expect(claimsFromAccessToken(token({ homeOrganizationId: 42 })).homeOrganizationId).toBeNull();
  });

  it('decodes base64url payloads containing - and _', () => {
    // A JWT is base64URL, not base64: decoding it as the latter mangles any
    // payload whose bytes produce those two characters.
    const claims = claimsFromAccessToken(token({ perms: ['data:read'], org: 'a??b>>c' }));
    expect(claims.permissions).toEqual(['data:read']);
  });

  it('treats sup as super admin only when strictly true', () => {
    expect(claimsFromAccessToken(token({ sup: 'yes' })).isSuperAdmin).toBe(false);
    expect(claimsFromAccessToken(token({ sup: 1 })).isSuperAdmin).toBe(false);
  });

  it('drops non-string grants rather than trusting the shape', () => {
    expect(claimsFromAccessToken(token({ perms: ['role:read', 42, null] })).permissions).toEqual(['role:read']);
  });

  it('degrades quietly on a malformed or absent token', () => {
    const empty = { permissions: [], isSuperAdmin: false, homeOrganizationId: null };
    expect(claimsFromAccessToken(undefined)).toEqual(empty);
    expect(claimsFromAccessToken('not-a-jwt')).toEqual(empty);
    expect(claimsFromAccessToken('a.!!!!.c')).toEqual(empty);
  });

  it('attaches grants to the user without disturbing the rest', () => {
    const merged = withClaims(user(), token({ perms: ['role:read'] }));
    expect(merged).toMatchObject({ id: 'u1', email: 'a@b.c', permissions: ['role:read'], isSuperAdmin: false });
  });
});

function Probe({ permission }: { permission: string }) {
  const { has } = useRbac();
  return <span data-testid="held">{String(has(permission))}</span>;
}

const held = (u: SessionUser | null, permission: string) => {
  // Scoped to this render's own container: `render()`'s bound queries search the
  // whole document, so a case probing two users would find both nodes and throw.
  const { container } = render(
    <RbacProvider user={u}>
      <Probe permission={permission} />
    </RbacProvider>,
  );
  return within(container).getByTestId('held').textContent;
};

describe('useRbac().has', () => {
  it('grants what the token lists and nothing else', () => {
    expect(held(user({ permissions: ['role:read'] }), 'role:read')).toBe('true');
  });

  it('denies a permission the token omits', () => {
    expect(held(user({ permissions: ['role:read'] }), 'role:write')).toBe('false');
  });

  it('gives a super admin everything', () => {
    expect(held(user({ permissions: [], isSuperAdmin: true }), 'role:write')).toBe('true');
  });

  it('falls back to the capability matrix for a pre-M18 session', () => {
    // No `permissions` at all — an admin must keep working rather than lose the UI.
    expect(held(user({ role: 'admin' }), 'role:write')).toBe('true');
    expect(held(user({ role: 'viewer' }), 'role:write')).toBe('false');
  });

  it('distinguishes an empty grant list from an absent one', () => {
    // `[]` is a real answer — the user holds nothing — and must NOT fall back.
    expect(held(user({ role: 'admin', permissions: [] }), 'role:write')).toBe('false');
  });

  it('denies everything when signed out', () => {
    expect(held(null, 'role:read')).toBe('false');
  });
});

describe('<Can>', () => {
  const show = (u: SessionUser, props: React.ComponentProps<typeof Can>) =>
    render(
      <RbacProvider user={u}>
        <Can {...props} />
      </RbacProvider>,
    );

  it('renders children on a held permission', () => {
    show(user({ permissions: ['role:write'] }), { permission: 'role:write', children: <b>edit</b> });
    expect(screen.getByText('edit')).toBeInTheDocument();
  });

  it('renders the fallback without it', () => {
    show(user({ permissions: ['role:read'] }), {
      permission: 'role:write',
      children: <b>edit</b>,
      fallback: <i>read only</i>,
    });
    expect(screen.queryByText('edit')).not.toBeInTheDocument();
    expect(screen.getByText('read only')).toBeInTheDocument();
  });

  it('requires BOTH when a capability and a permission are given', () => {
    show(user({ role: 'viewer', permissions: ['role:write'] }), {
      capability: 'manageOrg',
      permission: 'role:write',
      children: <b>edit</b>,
    });
    expect(screen.queryByText('edit')).not.toBeInTheDocument();
  });

  it('still works as a pure capability guard, as every existing call site uses it', () => {
    show(user({ role: 'admin' }), { capability: 'manageOrg', children: <b>settings</b> });
    expect(screen.getByText('settings')).toBeInTheDocument();
  });
});
