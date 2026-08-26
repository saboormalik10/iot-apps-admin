import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

import { ServiceCredential, IServiceCredential, ServiceCredentialKind } from '../../models/ServiceCredential';
import { fromCache, toCache } from '../../utils/cache.util';

/**
 * Authenticates a MACHINE, not a user.
 *
 * The station never signs in to our API — it writes files over SFTP. The ingest
 * agent that reads those files needs its own credential, and it is deliberately
 * NOT a user JWT: it belongs to no person, has no role, and must never satisfy
 * `RolesGuard` or resolve through `@CurrentUser()`.
 *
 * That separation is enforced by attaching to `request.serviceCredential` rather
 * than `request.user`. A service call therefore cannot reach a user endpoint even
 * if one were misconfigured, and vice versa.
 *
 * Token format: `obsi_<prefix>_<secret>` for ingest, `obsp_…` for provisioning.
 * Lookup is by the public prefix; the secret is verified against a stored SHA-256
 * with `timingSafeEqual`, so a wrong token cannot be narrowed down by timing.
 */

const CRED_TTL_MS = 30_000;

export interface AuthenticatedService {
  credentialId: string;
  organizationId: string;
  kind: ServiceCredentialKind;
  name: string;
  deviceScope: string[] | null;
}

const unauthorized = (code: string, message: string) =>
  new UnauthorizedException({ error: { code, message } });

/**
 * 403, not 401: the credential IS valid, it is simply the wrong kind for this
 * endpoint. Returning 401 told an operator their token was bad when the real
 * problem was that they had wired the ingest token into the provisioning agent —
 * a mistake that then looks like an authentication failure.
 */
const forbidden = (code: string, message: string) => new ForbiddenException({ error: { code, message } });

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time compare of two hex digests of equal length. */
function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

@Injectable()
export class ServiceCredentialGuard implements CanActivate {
  /** Subclasses narrow this; the base guard accepts any kind. */
  protected readonly requiredKind: ServiceCredentialKind | null = null;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string | undefined>;
    const authorization = headers['authorization'];

    if (!authorization?.startsWith('Bearer ')) {
      throw unauthorized('UNAUTHORIZED', 'Missing or invalid Authorization header');
    }

    const token = authorization.slice(7).trim();
    // Shape-check before touching the database, so malformed input costs nothing.
    const parts = token.split('_');
    if (parts.length !== 3 || !parts[1] || !parts[2]) {
      throw unauthorized('TOKEN_INVALID', 'Malformed service credential');
    }
    const prefix = parts[1];

    const cacheKey = `svccred:${prefix}`;
    // `fromCache` returns null for BOTH a miss and a cached null, so negatives are
    // deliberately not cached — a miss simply costs one indexed lookup.
    let cred = fromCache<IServiceCredential>(cacheKey);
    if (!cred) {
      cred = await ServiceCredential.findOne({ tokenPrefix: prefix, revokedAt: null }).lean<IServiceCredential>();
      // Cached for 30s, matching the app's other caches. A revoke therefore takes
      // up to 30 seconds to bite — acceptable for ingest, and documented here so
      // nobody assumes it is instant.
      if (cred) toCache(cacheKey, cred, CRED_TTL_MS);
    }

    if (!cred) throw unauthorized('TOKEN_INVALID', 'Service credential not recognised');
    if (!hashesMatch(hashToken(token), cred.tokenHash)) {
      throw unauthorized('TOKEN_INVALID', 'Service credential not recognised');
    }
    if (cred.expiresAt && cred.expiresAt.getTime() < Date.now()) {
      throw unauthorized('TOKEN_EXPIRED', 'Service credential has expired');
    }
    if (this.requiredKind && cred.kind !== this.requiredKind) {
      throw forbidden('FORBIDDEN_KIND', `This endpoint requires a '${this.requiredKind}' credential`);
    }

    const service: AuthenticatedService = {
      credentialId: String(cred._id),
      organizationId: String(cred.organizationId),
      kind: cred.kind,
      name: cred.name,
      deviceScope: cred.deviceScope?.map(String) ?? null,
    };
    request['serviceCredential'] = service;
    // Never populate `user` — a machine must not satisfy a user guard.
    request['user'] = undefined;

    // Best-effort, throttled to once a minute so a per-minute agent does not
    // add a write to every request.
    const seenKey = `svccred:seen:${prefix}`;
    if (!fromCache<boolean>(seenKey)) {
      toCache(seenKey, true, 60_000);
      const ip = (headers['x-forwarded-for']?.split(',')[0] ?? (request['ip'] as string) ?? '').trim() || null;
      void ServiceCredential.updateOne({ _id: cred._id }, { $set: { lastUsedAt: new Date(), lastUsedIp: ip } }).catch(
        () => void 0,
      );
    }

    return true;
  }
}

/** Accepts only `kind: 'ingest'` credentials. */
@Injectable()
export class IngestCredentialGuard extends ServiceCredentialGuard {
  protected readonly requiredKind: ServiceCredentialKind = 'ingest';
}

/**
 * Accepts only `kind: 'provision'` credentials.
 *
 * A SEPARATE credential from ingest, deliberately. The ingest token lives on the
 * same box and is used every minute; the provisioning token can create OS
 * accounts. Sharing one would mean a leaked ingest token — the far more exposed
 * of the two — could mint Unix logins.
 */
@Injectable()
export class ProvisionCredentialGuard extends ServiceCredentialGuard {
  protected readonly requiredKind: ServiceCredentialKind = 'provision';
}
