import 'server-only';
import { backendJson } from './backend';

export interface AuthOptions {
  /** People may create their own account, pending an administrator's approval. */
  selfSignup: boolean;
  /** An email server is configured, so "forgot password" can send a code. */
  emailReset: boolean;
}

/**
 * What the sign-in pages may offer. A site PC normally has no email, so "forgot
 * password" becomes "ask an administrator", and sign-up is off unless the site
 * turned it on. If the API cannot be asked, offer the least: nothing.
 */
export async function getAuthOptions(): Promise<AuthOptions> {
  try {
    const { res, body } = await backendJson<{ data: AuthOptions }>('/auth/options');
    if (res.ok && body?.data) return body.data;
  } catch {
    // API not up yet — fall through.
  }
  return { selfSignup: false, emailReset: false };
}
