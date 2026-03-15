import type { ReactNode } from 'react';

import Topbar from '@/components/layout/Topbar';

import '../styles/globals.css';

export const metadata = {
  title: 'Research Copilot',
  description: 'Local-first research workbench',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <div className="workbench">
          <Topbar />
          <main className="workspace">{children}</main>
        </div>
      </body>
    </html>
  );
}
