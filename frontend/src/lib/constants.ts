export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

export const NAV_ITEMS = [
  { href: '/dashboard', label: '仪表盘' },
  { href: '/library', label: '阅读' },
  { href: '/reproduction', label: '复现' },
  { href: '/reflections', label: '心得' },
  { href: '/dashboard/weekly-report', label: '周报' },
  { href: '/memory', label: '记忆' },
  { href: '/settings', label: '设置' },
];
