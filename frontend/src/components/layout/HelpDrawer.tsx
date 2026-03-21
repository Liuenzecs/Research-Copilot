"use client";

import { useEffect } from 'react';

import Button from '@/components/common/Button';
import { HELP_HEADER, HELP_QUICK_ACTIONS, HELP_SECTIONS } from '@/lib/helpContent';

export default function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="help-drawer-overlay" onClick={onClose}>
      <aside className="help-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="help-drawer-header">
          <div style={{ display: 'grid', gap: 6 }}>
            <h2 className="title">{HELP_HEADER.title}</h2>
            <p className="subtle" style={{ margin: 0 }}>
              {HELP_HEADER.subtitle}
            </p>
          </div>
          <Button className="secondary" type="button" onClick={onClose}>
            关闭
          </Button>
        </div>

        <div className="help-drawer-body">
          <section className="help-section">
            <h3 className="title" style={{ fontSize: 16 }}>
              快速开始
            </h3>
            <div className="help-quick-grid">
              {HELP_QUICK_ACTIONS.map((item) => (
                <div key={item.title} className="help-quick-card">
                  <strong>{item.title}</strong>
                  <p className="subtle" style={{ margin: '6px 0 0' }}>
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {HELP_SECTIONS.map((section) => (
            <section key={section.title} className="help-section">
              <div className="help-section-card">
                <h3 className="title" style={{ fontSize: 16 }}>
                  {section.title}
                </h3>
                {section.description ? (
                  <p className="subtle" style={{ margin: '4px 0 0' }}>
                    {section.description}
                  </p>
                ) : null}
                <ul className="help-bullet-list">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
