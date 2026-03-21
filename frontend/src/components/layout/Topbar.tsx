"use client";

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import Button from '@/components/common/Button';
import HelpDrawer from '@/components/layout/HelpDrawer';
import { APP_BRAND } from '@/lib/branding';
import { NAV_ITEMS } from '@/lib/constants';

function isActivePath(href: string, pathname: string): boolean {
  if (href === '/projects') {
    return pathname === '/' || pathname === '/dashboard' || pathname === '/projects' || pathname.startsWith('/projects/');
  }

  if (href === '/library') {
    return pathname === '/library' || pathname.startsWith('/papers/');
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Topbar() {
  const [helpOpen, setHelpOpen] = useState(false);
  const pathname = useLocation().pathname;
  const navigate = useNavigate();

  const searchActive = pathname === '/search';

  return (
    <>
      <header className="topbar">
        <Link to="/projects" className="topbar-brand">
          <span className="topbar-brand-mark">桌面研究工具</span>
          <div className="topbar-brand-copy">
            <strong className="topbar-brand-title">{APP_BRAND}</strong>
            <span className="topbar-brand-note">项目、检索、阅读、证据与写作统一工作台</span>
          </div>
        </Link>

        <nav className="topbar-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={`topbar-link ${isActivePath(item.href, pathname) ? 'active' : ''}`.trim()}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="topbar-actions">
          <button
            type="button"
            aria-label="搜索论文"
            title="搜索论文"
            className={`topbar-icon-button topbar-search-button ${searchActive ? 'active' : ''}`.trim()}
            onClick={() => navigate('/search')}
          >
            搜索
          </button>
          <Button className="secondary" type="button" onClick={() => setHelpOpen(true)}>
            帮助
          </Button>
        </div>
      </header>

      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
