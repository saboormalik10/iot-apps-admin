/**
 * The navigation, in the order the client's mockups show it:
 * Map · Trends · Flood · Station · History · Alerts · Admin, with Health added.
 */
import { SHOW_EXTRAS } from '@/lib/extras';

export interface NavItem {
  href: string;
  label: string;
  /** Opens a list of the stations instead of going straight to one (client, 9 Nov 2026). */
  stations?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Map' },
  { href: '/trends', label: 'Trends' },
  { href: '/flood', label: 'Flood' },
  { href: '/stations', label: 'Station', stations: true },
  { href: '/history', label: 'History' },
  { href: '/alerts', label: 'Alerts' },
  ...(SHOW_EXTRAS ? [{ href: '/health', label: 'Health' }] : []),
  { href: '/admin/users', label: 'Admin' },
];
