import {
  LayoutDashboard,
  Cpu,
  Waves,
  FileText,
  BarChart3,
  Droplets,
  Activity,
  Bell,
  Inbox,
  Share2,
  Users,
  Shield,
  Globe,
  Layers,
  ScrollText,
  Settings,
  Upload,
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
  /**
   * Platform administrators only. Distinct from `capability`, which is derived
   * from the role matrix — being a super admin is a flag on the user, not a role,
   * so no capability can express it.
   */
  superAdminOnly?: boolean;
  /**
   * Hidden FROM platform administrators — the opposite of `superAdminOnly`.
   *
   * For screens a customer needs in their own nav, whose cross-customer version
   * lives under Admin controls. Showing both to an administrator is two entries
   * for one thing, and the one they land on decides whether they are looking at
   * a single tenant or all of them — which is exactly the distinction that was
   * getting lost.
   */
  hideForSuperAdmin?: boolean;
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
  { key: 'nepAnalytics', href: '/analytics/nep', labelKey: 'nav.nepAnalytics', icon: Droplets, flag: 'nepAnalytics' },
  { key: 'fleet', href: '/fleet', labelKey: 'nav.fleet', icon: Activity, flag: 'analytics' },
  // Alerts re-enabled in M17.
  { key: 'alerts', href: '/alerts', labelKey: 'nav.alerts', icon: Bell, flag: 'alerts' },
  { key: 'notifications', href: '/notifications', labelKey: 'nav.notifications', icon: Inbox, flag: 'notifications' },
  { key: 'share', href: '/share', labelKey: 'nav.share', icon: Share2, capability: 'exportData', flag: 'share' },
  { key: 'import', href: '/import', labelKey: 'nav.import', icon: Upload, capability: 'importData', flag: 'importExport' },
  // The Organization page was retired from the nav — user management moved to
  // /users (MET / NEP / all people). The /org route itself still exists for
  // direct navigation (org settings + audit log).
  { key: 'users', href: '/users', labelKey: 'nav.users', icon: Users, capability: 'manageOrg' },
  { key: 'roles', href: '/roles', labelKey: 'nav.roles', icon: Shield, capability: 'manageOrg' },
  // Was the third tab of the retired Organization page and became unreachable
  // when the other two tabs moved to /users and /settings.
  { key: 'audit', href: '/audit', labelKey: 'nav.audit', icon: ScrollText, capability: 'manageOrg' },
  // Was "All customers" (/platform), sitting between customer screens with
  // nothing to mark it as platform-wide. Now one entry for every admin tool.
  { key: 'admin', href: '/admin', labelKey: 'nav.admin', icon: Globe, superAdminOnly: true },
  // Visible to customers too, read-only: they see the formats THEIR stations
  // send and whether each is ingesting. The platform endpoint that lists every
  // customer stays super-admin — a customer reading it is refused (403).
  // Customers only: theirs is read-only and scoped to their own stations. The
  // administrator's cross-customer view is a tab under Admin controls.
  {
    key: 'streamTypes',
    href: '/stream-types',
    labelKey: 'nav.streamTypes',
    icon: Layers,
    capability: 'viewData',
    hideForSuperAdmin: true,
  },
  { key: 'settings', href: '/settings', labelKey: 'nav.settings', icon: Settings },
];
