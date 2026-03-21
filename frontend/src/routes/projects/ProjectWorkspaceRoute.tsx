import { Navigate, useParams } from 'react-router-dom';

import ProjectWorkspace from '@/components/projects/ProjectWorkspace';

function parseRouteNumber(raw?: string): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export default function ProjectWorkspaceRoute() {
  const params = useParams();
  const projectId = parseRouteNumber(params.projectId);

  if (!projectId) {
    return <Navigate replace to="/projects" />;
  }

  return <ProjectWorkspace projectId={projectId} />;
}
