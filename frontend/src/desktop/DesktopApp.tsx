import { RouterProvider } from 'react-router-dom';

import { desktopRouter } from '@/desktop/router';

export default function DesktopApp() {
  return <RouterProvider router={desktopRouter} />;
}
