"use client";

import { useEffect, useState } from 'react';
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
  const [now, setNow] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const pathname = useLocation().pathname;
  const navigate = useNavigate();

  useEffect(() => {
    const renderNow = () =>
      setNow(
        new Date().toLocaleString('zh-CN', {
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    renderNow();
    const timer = window.setInterval(renderNow, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const searchActive = pathname === '/search';

  return (
    <>
      <header className="topbar">
        <Link to="/projects" className="topbar-brand">
          <strong>{APP_BRAND}</strong>
          <span className="subtle">桌面研究工作台，围绕研究问题推进搜索、证据、写作与周报。</span>
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
            className={`topbar-icon-button ${searchActive ? 'active' : ''}`.trim()}
            onClick={() => navigate('/search')}
          >
            搜索论文
          </button>
          <Button className="secondary" type="button" onClick={() => setHelpOpen(true)}>
            帮助
          </Button>
          <div className="subtle topbar-time">{now || '--'}</div>
        </div>
      </header>

      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
