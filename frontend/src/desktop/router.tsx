import { Navigate, Outlet, createBrowserRouter, useParams, useSearchParams } from 'react-router-dom';

import Topbar from '@/components/layout/Topbar';
import PaperReaderScreen from '@/components/papers/PaperReaderScreen';
import ProjectsHome from '@/components/projects/ProjectsHome';
import LibraryPage from '@/app/library/page';
import MemoryPage from '@/app/memory/page';
import ReflectionsPage from '@/app/reflections/page';
import ReproductionPage from '@/app/reproduction/page';
import SearchPage from '@/app/search/page';
import SettingsPage from '@/app/settings/page';
import WeeklyReportPage from '@/app/dashboard/weekly-report/page';
import ProjectWorkspace from '@/components/projects/ProjectWorkspace';

function parseRouteNumber(raw?: string): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

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

function ProjectWorkspaceRoute() {
  const params = useParams();
  const projectId = parseRouteNumber(params.projectId);

  if (!projectId) {
    return <Navigate replace to="/projects" />;
  }

  return <ProjectWorkspace projectId={projectId} />;
}

function PaperReaderRoute() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const paperId = parseRouteNumber(params.paperId);
  const requestedSummaryId = parseRouteNumber(searchParams.get('summary_id') ?? undefined);
  const requestedParagraphId = parseRouteNumber(searchParams.get('paragraph_id') ?? undefined);
  const projectId = parseRouteNumber(searchParams.get('project_id') ?? undefined);

  if (!paperId) {
    return <Navigate replace to="/library" />;
  }

  return (
    <PaperReaderScreen
      paperId={paperId}
      projectId={projectId}
      requestedParagraphId={requestedParagraphId}
      requestedSummaryId={requestedSummaryId}
    />
  );
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
        element: <ProjectsHome />,
      },
      {
        path: 'projects/:projectId',
        element: <ProjectWorkspaceRoute />,
      },
      {
        path: 'papers/:paperId',
        element: <PaperReaderRoute />,
      },
      {
        path: 'search',
        element: <SearchPage />,
      },
      {
        path: 'library',
        element: <LibraryPage />,
      },
      {
        path: 'reflections',
        element: <ReflectionsPage />,
      },
      {
        path: 'reproduction',
        element: <ReproductionPage />,
      },
      {
        path: 'memory',
        element: <MemoryPage />,
      },
      {
        path: 'dashboard/weekly-report',
        element: <WeeklyReportPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: '*',
        element: <Navigate replace to="/projects" />,
      },
    ],
  },
]);
