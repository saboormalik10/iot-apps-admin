import { http } from '@/lib/api/http';
import type { SessionUser } from '@/lib/api/types';

/** Browser → BFF auth calls. Tokens never touch the client; only `{ user }` returns. */
export const authApi = {
  login: (email: string, password: string) =>
    http.post<{ user: SessionUser }>('/auth/login', { email, password }),
  forgotPassword: (email: string) => http.post<unknown>('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    http.post<unknown>('/auth/reset-password', { token, newPassword }),
  acceptInvite: (token: string, password: string) =>
    http.post<{ user: SessionUser }>('/auth/accept-invite', { token, password }),
  logout: () => http.post<unknown>('/auth/logout'),
};
