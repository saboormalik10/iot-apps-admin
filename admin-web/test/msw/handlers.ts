import { http, HttpResponse } from 'msw';

/**
 * Default BFF mocks for component tests. Individual tests override as needed with
 * server.use(...). All paths are the same-origin `/api/**` the client calls.
 */
export const handlers = [
  http.get('/api/auth/session', () =>
    HttpResponse.json({
      data: {
        id: 'u1',
        email: 'admin@observator.com',
        firstName: 'Dana',
        lastName: 'Galbraith',
        role: 'admin',
        organizationId: 'o1',
      },
    }),
  ),
  http.get('/api/organizations/me', () =>
    HttpResponse.json({
      data: { id: 'o1', name: 'Observator AU', contactEmail: 'a@b.com', country: 'AU', timezone: 'UTC' },
    }),
  ),
  http.get('/api/organizations/me/users', () =>
    HttpResponse.json({
      data: [
        {
          id: 'u1',
          email: 'admin@observator.com',
          firstName: 'Dana',
          lastName: 'Galbraith',
          role: 'admin',
          isActive: true,
          lastLoginAt: null,
          invitedAt: null,
        },
      ],
    }),
  ),
  http.get('/api/notifications', () =>
    HttpResponse.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, unreadCount: 0 }),
  ),
];
