"use client";

import { ReactNode, useState } from 'react';

type Tab = {
  label: string;
  content: ReactNode;
};

export default function Tabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {tabs.map((tab, idx) => (
          <button
            key={tab.label}
            className={`button ${idx === active ? '' : 'secondary'}`}
            onClick={() => setActive(idx)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{tabs[active]?.content}</div>
    </div>
  );
}
