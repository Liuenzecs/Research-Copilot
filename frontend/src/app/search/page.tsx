"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Card from "@/components/common/Card";
import Loading from "@/components/common/Loading";
import ProjectContextBanner from "@/components/projects/ProjectContextBanner";
import ProjectSearchWorkbench from "@/components/projects/ProjectSearchWorkbench";
import { getProject } from "@/lib/api";
import { paperReaderPath } from "@/lib/routes";
import { usePageTitle } from "@/lib/usePageTitle";
import type { ResearchProject } from "@/lib/types";

function parsePositiveInt(raw: string | null) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPaperId = parsePositiveInt(searchParams.get("paper_id"));
  const requestedSummaryId = parsePositiveInt(searchParams.get("summary_id"));
  const projectId = parsePositiveInt(searchParams.get("project_id"));

  const [project, setProject] = useState<ResearchProject | null>(null);

  usePageTitle(projectId ? "项目内论文搜索" : "论文搜索");

  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      try {
        setProject(await getProject(projectId));
      } catch {
        setProject(null);
      }
    })();
  }, [projectId]);

  useEffect(() => {
    if (!requestedPaperId) return;
    router.replace(paperReaderPath(requestedPaperId, requestedSummaryId, undefined, projectId));
  }, [projectId, requestedPaperId, requestedSummaryId, router]);

  if (requestedPaperId) {
    return <Loading text="正在跳转到阅读器..." />;
  }

  return (
    <>
      <Card>
        <h2 className="title">论文搜索</h2>
        <p className="subtle">
          {projectId
            ? "当前页复用项目搜索与收集台：支持保存搜索、搜索历史、批量加入项目和单跳引文链。"
            : "当前页为独立搜索模式：保留本地最近搜索，但不创建项目级已保存搜索。"}
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

export default function SearchPage() {
  return (
    <Suspense fallback={<Loading text="正在加载搜索页..." />}>
      <SearchPageContent />
    </Suspense>
  );
}
