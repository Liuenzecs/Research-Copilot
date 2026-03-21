import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { desktopRouter } from '@/desktop/router';
import DesktopStartupScreen from '@/desktop/DesktopStartupScreen';
import { initializeRuntimeConfig, useRuntimeConfig } from '@/lib/runtime';

export default function DesktopApp() {
  const runtimeConfig = useRuntimeConfig();

  useEffect(() => {
    void initializeRuntimeConfig();
  }, []);

  if (runtimeConfig.is_desktop && runtimeConfig.backend_status !== 'ready') {
    return <DesktopStartupScreen />;
  }

  return <RouterProvider router={desktopRouter} />;
}
