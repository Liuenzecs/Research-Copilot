"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import Card from "@/components/common/Card";
import Loading from "@/components/common/Loading";
import ProjectContextBanner from "@/components/projects/ProjectContextBanner";
import ProjectSearchWorkbench from "@/components/projects/ProjectSearchWorkbench";
import { getProject } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { paperReaderPath } from "@/lib/routes";
import { usePageTitle } from "@/lib/usePageTitle";

function parsePositiveInt(raw: string | null) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export default function SearchRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedPaperId = parsePositiveInt(searchParams.get("paper_id"));
  const requestedSummaryId = parsePositiveInt(searchParams.get("summary_id"));
  const projectId = parsePositiveInt(searchParams.get("project_id"));

  const projectQuery = useQuery({
    queryKey: projectId ? queryKeys.projects.detail(projectId) : ["projects", "detail", "none"],
    queryFn: ({ signal }) => getProject(projectId!, { signal }),
    enabled: Boolean(projectId),
  });

  usePageTitle(projectId ? "项目内论文搜索" : "论文搜索");

  useEffect(() => {
    if (!requestedPaperId) return;
    navigate(paperReaderPath(requestedPaperId, requestedSummaryId, undefined, projectId), { replace: true });
  }, [navigate, projectId, requestedPaperId, requestedSummaryId]);

  if (requestedPaperId) {
    return <Loading text="正在跳转到阅读器..." />;
  }

  const project = projectQuery.data ?? null;

  return (
    <>
      <Card className="page-header-card">
        <span className="page-kicker">{projectId ? "项目内搜索" : "独立搜索"}</span>
        <h2 className="page-shell-title">论文搜索</h2>
        <p className="page-shell-copy">
          {projectId
            ? "当前页复用项目搜索与收集台：支持保存搜索、搜索历史、批量加入项目和单跳引文链。"
            : "当前页为独立搜索模式：保留本地最近搜索，但不创建项目级保存搜索。"}
        </p>
        <ProjectContextBanner
          projectId={projectId}
          message={project ? `当前正在为项目“${project.title}”收集论文。` : "当前为项目上下文论文搜索视图。"}
        />
      </Card>

      <ProjectSearchWorkbench
        projectId={projectId}
        project={project}
        initialQuery={project?.seed_query || project?.research_question || ""}
      />
    </>
  );
}
