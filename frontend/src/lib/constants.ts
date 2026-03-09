export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

export const NAV_ITEMS = [
  { href: '/dashboard', label: '仪表盘' },
  { href: '/search', label: '论文搜索' },
  { href: '/library', label: '文献库' },
  { href: '/brainstorm', label: '灵感构思' },
  { href: '/reproduction', label: '复现计划' },
  { href: '/reflections', label: '研究心得' },
  { href: '/memory', label: '长期记忆' },
  { href: '/settings', label: '设置' },
];
