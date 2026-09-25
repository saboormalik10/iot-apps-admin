import { describe, it, expect } from 'vitest';
import { ApiError, isForbiddenError } from '@/lib/api/errors';

/**
 * "Empty" and "failed" are different claims about a customer's data.
 *
 * Across the portal a failed request rendered the same screen as a genuinely
 * empty result — "No results.", "No MET-LINK device. Pair one from the mobile
 * app.", "Record not found. It may have been deleted." Each is a confident
 * statement, and each is false when the request simply failed. The damage is
 * worst right after a platform administrator switches customer, where the
 * operator has no independent knowledge of what that customer should own.
 *
 * A record or session id also outlives the session that found it — a bookmark,
 * or a detail page left open across a switch. That is a 403: the record exists
 * and belongs to someone else. Reporting it as a deletion is wrong in a way that
 * matters, because "deleted" invites a support ticket about lost data.
 */

describe('forbidden is not the same as missing', () => {
  it('recognises a 403 as "not yours"', () => {
    expect(isForbiddenError(new ApiError(403, 'FORBIDDEN', 'Forbidden'))).toBe(true);
  });

  it('does NOT treat a 404 as forbidden — that one really is gone', () => {
    expect(isForbiddenError(new ApiError(404, 'NOT_FOUND', 'Not found'))).toBe(false);
  });

  it('does not treat a server error or a network failure as forbidden', () => {
    expect(isForbiddenError(new ApiError(500, 'HTTP_500', 'Boom'))).toBe(false);
    expect(isForbiddenError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isForbiddenError(undefined)).toBe(false);
    expect(isForbiddenError(null)).toBe(false);
  });

  it('carries the status through from a real response', async () => {
    const err = await ApiError.fromResponse(
      new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Nope' } }), { status: 403 }),
    );
    expect(isForbiddenError(err)).toBe(true);
    expect(err.status).toBe(403);
  });
});
