import type { ReactNode } from 'react';

import Topbar from '@/components/layout/Topbar';
import { APP_BRAND } from '@/lib/branding';

import '../styles/globals.css';

export const metadata = {
  title: {
    default: APP_BRAND,
    template: `%s | ${APP_BRAND}`,
  },
  description: '本地优先的项目制科研工作台',
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
