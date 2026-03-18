"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS } from '@/lib/constants';

export default function Sidebar() {
  const pathname = usePathname();
  const sidebarItems = NAV_ITEMS.map((item) => {
    const active = item.href === '/projects'
      ? pathname === '/' || pathname === '/dashboard' || pathname === '/projects' || pathname.startsWith('/projects/')
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return { ...item, active };
  });

  return (
    <aside className="sidebar">
      <h1 className="title">Research Copilot</h1>
      <p className="subtle">本地优先项目工作台</p>
      <nav className="nav-list" aria-label="主导航">
        {sidebarItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${item.active ? 'active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
