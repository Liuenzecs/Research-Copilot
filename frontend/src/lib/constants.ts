export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

export const NAV_ITEMS = [
  { href: '/projects', label: '项目' },
  { href: '/library', label: '文库' },
  { href: '/dashboard/weekly-report', label: '周报' },
  { href: '/settings', label: '设置' },
];
