import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';

import { PERMISSIONS } from '../src/common/permissions';

/**
 * POLICY TEST — every permission in the catalogue must be enforced somewhere.
 *
 * The catalogue's own header says a permission only means something if some
 * endpoint enforces it, and that storing it in the database would allow "a lie
 * that no test or type can catch". This is that test.
 *
 * It exists because the audit that produced M25 found 13 of 21 permissions
 * enforcing NOTHING: the role editor offered them, a customer could be granted or
 * denied them, and no request ever consulted one. Read permissions were the worst
 * of it — `data:read` gated no route while a Viewer could DELETE a record.
 *
 * A permission is "enforced" if it appears in a @RequirePermissions decorator or
 * in an actorHasPermission call (the latter for the cases where a permission
 * decides SCOPE inside a handler rather than access to it — share:revokeAny).
 */
describe('permission coverage (policy)', () => {
  const sources: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) sources.push(fs.readFileSync(p, 'utf8'));
    }
  })(path.join(__dirname, '..', 'src'));

  const haystack = sources.join('\n');

  it.each(PERMISSIONS.map((p) => [p]))('%s is enforced by at least one route or handler', (permission) => {
    const quoted = `'${permission}'`;
    const inDecorator = new RegExp(`@RequirePermissions\\([^)]*${quoted}`).test(haystack);
    const inHandler = new RegExp(`actorHasPermission\\([^)]*${quoted}`).test(haystack);
    expect(inDecorator || inHandler).toBe(true);
  });

  it('the catalogue has no duplicates', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });
});
