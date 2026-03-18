export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

export const NAV_ITEMS = [
  { href: '/projects', label: 'Projects' },
  { href: '/library', label: 'Library' },
  { href: '/dashboard/weekly-report', label: 'Weekly Report' },
  { href: '/settings', label: 'Settings' },
];
