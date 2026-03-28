"use client";

import { Link, useLocation } from 'react-router-dom';

import { NAV_ITEMS } from '@/lib/constants';
import { usePreferredProject } from '@/lib/usePreferredProject';

export default function Sidebar() {
  const pathname = useLocation().pathname;
  const preferredProject = usePreferredProject();
  const sidebarItems = NAV_ITEMS.map((item) => {
    const active = item.href === '/projects'
      ? pathname === '/' || pathname === '/dashboard' || pathname === '/projects' || pathname.startsWith('/projects/')
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return { ...item, href: item.href === '/projects' ? (preferredProject.preferredProjectPath ?? item.href) : item.href, active };
  });

  return (
    <aside className="sidebar">
      <h1 className="title">Research Copilot</h1>
      <p className="subtle">本地优先项目工作台</p>
      <nav className="nav-list" aria-label="主导航">
        {sidebarItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className={`nav-item ${item.active ? 'active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
