"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS } from '@/lib/constants';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <h1 className="title">Research Copilot</h1>
      <p className="subtle">本地优先研究工作台</p>
      <nav className="nav-list" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname === item.href ? 'active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
