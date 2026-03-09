import type { ReactNode } from 'react';

import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import ContextPanel from '@/components/layout/ContextPanel';

import '../styles/globals.css';

export const metadata = {
  title: 'Research Copilot',
  description: 'Local-first research workbench',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="workbench">
          <Sidebar />
          <main className="main-col">
            <Topbar />
            <section className="workspace">{children}</section>
          </main>
          <ContextPanel />
        </div>
      </body>
    </html>
  );
}
