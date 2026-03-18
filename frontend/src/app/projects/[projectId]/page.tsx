import ProjectWorkspace from '@/components/projects/ProjectWorkspace';

function parseNumber(raw?: string | string[] | null): number | null {
  if (!raw || Array.isArray(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolvedParams = await params;
  const projectId = parseNumber(resolvedParams.projectId);

  if (!projectId) {
    return null;
  }

  return <ProjectWorkspace projectId={projectId} />;
}
