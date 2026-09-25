import { DashboardHome } from '@/features/dashboard/dashboard-home';

/**
 * The portal's home: the live dashboard.
 *
 * It used to fall back to a "welcome, invite your teammates, pair a unit from the
 * mobile app" placeholder behind a feature flag. The flag has been on since Month
 * 8 and cannot be turned off, so that screen was unreachable — and its text
 * described a cloud product with invitations and a mobile app, neither of which
 * exists here.
 */
export default function DashHomePage() {
  return <DashboardHome />;
}
