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
  // ── Month 8: dashboard + devices ──
  http.get('/api/dashboard/summary', () =>
    HttpResponse.json({
      data: {
        totalDevices: 4,
        onlineDevices: 3,
        offlineDevices: 1,
        metLinkDevices: 2,
        nepLinkDevices: 2,
        totalMetRecords: 120,
        totalNepSessions: 45,
        activeAlertRules: 2,
        sparklines: { records: [1, 2, 0, 3, 4, 2, 1, 0, 5, 6, 2, 3, 1, 4], sessions: [0, 1, 1, 2, 0, 3, 1, 2, 1, 0, 2, 1, 3, 2] },
        serverTime: '2026-07-08T00:00:00.000Z',
      },
    }),
  ),
  http.get('/api/dashboard/devices', () =>
    HttpResponse.json({
      data: [
        { _id: 'd1', name: 'Roof Station', bleId: 'MET-001', type: 'MET-LINK', firmwareVersion: '1.4.0', lastSeenAt: '2026-07-08T00:00:00.000Z', isOnline: true, lastBatteryPct: 82, lastBatteryCharging: false },
        { _id: 'd2', name: 'River Probe', bleId: 'NEP-001', type: 'NEP-LINK', firmwareVersion: '2.1.0', lastSeenAt: null, isOnline: false, lastBatteryPct: 12, lastBatteryCharging: false },
      ],
    }),
  ),
  http.get('/api/devices', () =>
    HttpResponse.json({
      data: [
        { _id: 'd1', bleId: 'MET-001', name: 'Roof Station', customName: null, type: 'MET-LINK', serialNo: null, firmwareVersion: '1.4.0', lastSeenAt: null, lastBatteryPct: 82, lastBatteryVoltage: null, lastBatteryCharging: null, isOnline: true, createdAt: '', updatedAt: '' },
      ],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    }),
  ),
  http.get('/api/devices/firmware-status', () =>
    HttpResponse.json({ data: [], meta: { total: 0, outdated: 0 } }),
  ),
];
