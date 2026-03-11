"use client";

import { useEffect, useState } from 'react';

export default function Topbar() {
  const [now, setNow] = useState('');

  useEffect(() => {
    const renderNow = () => setNow(new Date().toLocaleString('zh-CN'));
    renderNow();
    const timer = window.setInterval(renderNow, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="topbar">
      <div>
        <strong>专业研究工作流</strong>
        <div className="subtle">搜索、总结、复现、长期记忆、研究心得</div>
      </div>
      <div className="subtle">{now || '--'}</div>
    </header>
  );
}
