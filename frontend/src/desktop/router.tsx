import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';

import RouteLoadingFallback from '@/desktop/RouteLoadingFallback';
import Topbar from '@/components/layout/Topbar';
const ProjectsEntryRoute = lazy(() => import('@/routes/projects/ProjectsEntryRoute'));
const ProjectWorkspaceRoute = lazy(() => import('@/routes/projects/ProjectWorkspaceRoute'));
const PaperReaderRoute = lazy(() => import('@/routes/papers/PaperReaderRoute'));
const SearchRoute = lazy(() => import('@/routes/search/SearchRoute'));
const LibraryRoute = lazy(() => import('@/routes/library/LibraryRoute'));
const ReflectionsRoute = lazy(() => import('@/routes/reflections/ReflectionsRoute'));
const ReproductionRoute = lazy(() => import('@/routes/reproduction/ReproductionRoute'));
const MemoryRoute = lazy(() => import('@/routes/memory/MemoryRoute'));
const WeeklyReportRoute = lazy(() => import('@/routes/reports/WeeklyReportRoute'));
const SettingsRoute = lazy(() => import('@/routes/settings/SettingsRoute'));

function AppShell() {
  return (
    <div className="workbench">
      <Topbar />
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}

function lazyPage(element: ReactNode) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

export const desktopRouter = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate replace to="/projects" />,
      },
      {
        path: 'dashboard',
        element: <Navigate replace to="/projects" />,
      },
      {
        path: 'projects',
        element: lazyPage(<ProjectsEntryRoute />),
      },
      {
        path: 'projects/:projectId',
        element: lazyPage(<ProjectWorkspaceRoute />),
      },
      {
        path: 'papers/:paperId',
        element: lazyPage(<PaperReaderRoute />),
      },
      {
        path: 'search',
        element: lazyPage(<SearchRoute />),
      },
      {
        path: 'library',
        element: lazyPage(<LibraryRoute />),
      },
      {
        path: 'reflections',
        element: lazyPage(<ReflectionsRoute />),
      },
      {
        path: 'reproduction',
        element: lazyPage(<ReproductionRoute />),
      },
      {
        path: 'memory',
        element: lazyPage(<MemoryRoute />),
      },
      {
        path: 'dashboard/weekly-report',
        element: lazyPage(<WeeklyReportRoute />),
      },
      {
        path: 'settings',
        element: lazyPage(<SettingsRoute />),
      },
      {
        path: '*',
        element: <Navigate replace to="/projects" />,
      },
    ],
  },
]);
