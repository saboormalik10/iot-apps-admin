import { http } from '@/lib/api/http';
import type { SessionUser } from '@/lib/api/types';

/** Browser → BFF auth calls. Tokens never touch the client; only `{ user }` returns. */
export const authApi = {
  login: (email: string, password: string) =>
    http.post<{ user: SessionUser }>('/auth/login', { email, password }),
  forgotPassword: (email: string) => http.post<unknown>('/auth/forgot-password', { email }),
  /** Step 2 — verify the 6-digit code, receive a single-use reset token. */
  verifyResetCode: (email: string, code: string) =>
    http.post<{ resetToken: string }>('/auth/verify-reset-code', { email, code }),
  /** Step 3 — set the new password with the reset token from verifyResetCode. */
  resetPassword: (resetToken: string, newPassword: string) =>
    http.post<unknown>('/auth/reset-password', { resetToken, newPassword }),
  acceptInvite: (token: string, password: string) =>
    http.post<{ user: SessionUser }>('/auth/accept-invite', { token, password }),
  logout: () => http.post<unknown>('/auth/logout'),
};
