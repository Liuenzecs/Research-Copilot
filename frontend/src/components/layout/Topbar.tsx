"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import Button from '@/components/common/Button';
import HelpDrawer from '@/components/layout/HelpDrawer';
import { NAV_ITEMS } from '@/lib/constants';

function isActivePath(href: string, pathname: string): boolean {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }

  if (href === '/search') {
    return pathname === '/search' || pathname.startsWith('/papers/');
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Topbar() {
  const [now, setNow] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const renderNow = () => setNow(new Date().toLocaleString('zh-CN'));
    renderNow();
    const timer = window.setInterval(renderNow, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <header className="topbar">
        <Link href="/dashboard" className="topbar-brand">
          <strong>Research Copilot</strong>
          <span className="subtle">本地优先研究工作台</span>
        </Link>

        <nav className="topbar-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`topbar-link ${isActivePath(item.href, pathname) ? 'active' : ''}`.trim()}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="topbar-actions">
          <Button className="secondary" type="button" onClick={() => setHelpOpen(true)}>
            功能说明
          </Button>
          <div className="subtle topbar-time">{now || '--'}</div>
        </div>
      </header>

      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
