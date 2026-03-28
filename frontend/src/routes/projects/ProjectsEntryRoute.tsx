import { Navigate, useSearchParams } from "react-router-dom";

import Loading from "@/components/common/Loading";
import ProjectsHome from "@/components/projects/ProjectsHome";
import { usePreferredProject } from "@/lib/usePreferredProject";

export default function ProjectsEntryRoute() {
  const [searchParams] = useSearchParams();
  const manageView = searchParams.get("view") === "manage";
  const preferredProjectQuery = usePreferredProject();

  if (manageView) {
    return <ProjectsHome />;
  }

  if (preferredProjectQuery.isLoading) {
    return <Loading text="正在进入最近打开的项目..." />;
  }

  if (preferredProjectQuery.preferredProjectPath) {
    return <Navigate replace to={preferredProjectQuery.preferredProjectPath} />;
  }

  return <ProjectsHome />;
}
