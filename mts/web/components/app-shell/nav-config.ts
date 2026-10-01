/**
 * The navigation, in the order the client's mockups show it:
 * Map · Trends · Flood · Station · History · Alerts · Admin, with Health added.
 */
export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Map' },
  { href: '/trends', label: 'Trends' },
  { href: '/flood', label: 'Flood' },
  { href: '/stations/marrickville', label: 'Station' },
  { href: '/history', label: 'History' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/health', label: 'Health' },
  { href: '/admin/users', label: 'Admin' },
];
