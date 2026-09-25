import {
  LayoutDashboard,
  Cpu,
  FileText,
  Table2,
  BarChart3,
  Bell,
  Inbox,
  Users,
  Shield,
  ScrollText,
  Settings,
  Activity,
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
  /** Requires this backend permission — the API enforces the same one. */
  permission?: string;
  /** Gated by this feature flag (Month 8–12 sections stay off in Month 7). */
  flag?: FeatureFlag;
}

/** Nav is driven by the RBAC matrix + feature flags. */
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { key: 'devices', href: '/devices', labelKey: 'nav.devices', icon: Cpu, flag: 'devices' },
  { key: 'records', href: '/records', labelKey: 'nav.records', icon: FileText, flag: 'records' },
  { key: 'query', href: '/query', labelKey: 'nav.query', icon: Table2, capability: 'viewData' },
  { key: 'analytics', href: '/analytics', labelKey: 'nav.metAnalytics', icon: BarChart3, flag: 'analytics' },
  { key: 'alerts', href: '/alerts', labelKey: 'nav.alerts', icon: Bell, flag: 'alerts' },
  { key: 'notifications', href: '/notifications', labelKey: 'nav.notifications', icon: Inbox, flag: 'notifications' },
  { key: 'users', href: '/users', labelKey: 'nav.users', icon: Users, capability: 'manageOrg' },
  { key: 'roles', href: '/roles', labelKey: 'nav.roles', icon: Shield, capability: 'manageOrg' },
  { key: 'audit', href: '/audit', labelKey: 'nav.audit', icon: ScrollText, capability: 'manageOrg' },
  // The station PC's own health — for the people who keep it running, not for
  // read-only viewers: it names the data folder, the backups and the disk.
  { key: 'system', href: '/system', labelKey: 'nav.system', icon: Activity, permission: 'system:read' },
  { key: 'settings', href: '/settings', labelKey: 'nav.settings', icon: Settings },
];
