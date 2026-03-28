import { useQuery } from "@tanstack/react-query";

import { listProjects } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { projectPath } from "@/lib/routes";

export function usePreferredProject() {
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: ({ signal }) => listProjects({ signal }),
  });

  const preferredProject = projectsQuery.data?.[0] ?? null;

  return {
    ...projectsQuery,
    preferredProject,
    preferredProjectPath: preferredProject ? projectPath(preferredProject.id) : null,
  };
}
