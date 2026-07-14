import {
  LayoutDashboard,
  Cpu,
  Waves,
  FileText,
  BarChart3,
  Droplets,
  Activity,
  Bell,
  Users,
  Settings,
  Map as MapIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Capability } from '@/lib/rbac/capabilities';
import type { FeatureFlag } from '@/lib/config/flags';

export interface NavItem {
  key: string;
  href: string;
  labelKey: string;
  icon: LucideIcon;
  /** Requires this capability to be shown (RBAC nav visibility). */
  capability?: Capability;
  /** Gated by this feature flag (Month 8–12 sections stay off in Month 7). */
  flag?: FeatureFlag;
}

/**
 * Nav is driven by the RBAC matrix + feature flags. In Month 7 only Dashboard
 * (welcome placeholder), Organization (admin), and Settings ship; the Month 8–12
 * sections are present but flagged off, so there are no dead links.
 */
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { key: 'devices', href: '/devices', labelKey: 'nav.devices', icon: Cpu, flag: 'devices' },
  { key: 'map', href: '/map', labelKey: 'nav.map', icon: MapIcon, flag: 'maps' },
  { key: 'sessions', href: '/sessions', labelKey: 'nav.sessions', icon: Waves, flag: 'sessions' },
  { key: 'records', href: '/records', labelKey: 'nav.records', icon: FileText, flag: 'records' },
  { key: 'analytics', href: '/analytics', labelKey: 'nav.metAnalytics', icon: BarChart3, flag: 'analytics' },
  { key: 'nepAnalytics', href: '/analytics/nep', labelKey: 'nav.nepAnalytics', icon: Droplets, flag: 'analytics' },
  { key: 'fleet', href: '/fleet', labelKey: 'nav.fleet', icon: Activity, flag: 'analytics' },
  { key: 'alerts', href: '/alerts', labelKey: 'nav.alerts', icon: Bell, flag: 'alerts' },
  // The Organization page was retired from the nav — user management moved to
  // /users (MET / NEP / all people). The /org route itself still exists for
  // direct navigation (org settings + audit log).
  { key: 'users', href: '/users', labelKey: 'nav.users', icon: Users, capability: 'manageOrg' },
  { key: 'settings', href: '/settings', labelKey: 'nav.settings', icon: Settings },
];
