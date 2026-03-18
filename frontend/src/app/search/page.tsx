"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import EmptyState from "@/components/common/EmptyState";
import Loading from "@/components/common/Loading";
import StatusStack from "@/components/common/StatusStack";
import { addProjectPaper, getProject, searchPapers } from "@/lib/api";
import { paperReaderPath, projectPath } from "@/lib/routes";
import type { Paper, ResearchProject } from "@/lib/types";

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
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      try {
        const nextProject = await getProject(projectId);
        setProject(nextProject);
        setQuery((current) => current || nextProject.seed_query || nextProject.research_question);
      } catch {
        setProject(null);
      }
    })();
  }, [projectId]);

  useEffect(() => {
    if (!requestedPaperId) return;
    router.replace(paperReaderPath(requestedPaperId, requestedSummaryId, undefined, projectId));
  }, [projectId, requestedPaperId, requestedSummaryId, router]);

  async function runSearch() {
    if (!query.trim()) {
      setError("先输入你想找的研究问题或关键词。");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await searchPapers(query.trim(), 12);
      setPapers(result.items ?? []);
      setWarnings(result.warnings ?? []);
      setSelectedIds([]);
      setNotice(result.items?.length ? `找到 ${result.items.length} 篇候选论文。` : "当前没有可用的搜索结果。");
    } catch (searchError) {
      setError((searchError as Error).message || "搜索失败");
    } finally {
      setLoading(false);
    }
  }

  async function addBatchToProject() {
    if (!projectId) return;
    if (selectedIds.length === 0) {
      setError("先勾选至少一篇论文。");
      return;
    }
    setAdding(true);
    setError("");
    try {
      await Promise.all(selectedIds.map((paperId) => addProjectPaper(projectId, { paper_id: paperId })));
      setNotice(`已把 ${selectedIds.length} 篇论文加入项目。`);
      setSelectedIds([]);
    } catch (addError) {
      setError((addError as Error).message || "加入项目失败");
    } finally {
      setAdding(false);
    }
  }

  const resultCards = useMemo(() => {
    return papers.map((paper) => {
      const checked = selectedIds.includes(paper.id);
      return (
        <div key={paper.id} className="project-paper-search-item">
          {projectId ? (
            <label className="project-paper-check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  setSelectedIds((current) => {
                    if (event.target.checked) return Array.from(new Set([...current, paper.id]));
                    return current.filter((id) => id !== paper.id);
                  });
                }}
              />
              <span>加入当前项目</span>
            </label>
          ) : null}
          <strong>{paper.title_en}</strong>
          <div className="subtle">
            {paper.authors || "Unknown"} · {paper.year ?? "N/A"} · {paper.pdf_local_path ? "已下载 PDF" : "未下载 PDF"}
          </div>
          <div className="projects-inline-actions">
            <LinkButton href={paperReaderPath(paper.id, undefined, undefined, projectId)}>打开阅读器</LinkButton>
          </div>
        </div>
      );
    });
  }, [papers, projectId, selectedIds]);

  if (requestedPaperId) {
    return <Loading text="正在跳转到阅读器..." />;
  }

  return (
    <>
      <Card>
        <h2 className="title">搜索论文</h2>
        <p className="subtle">
          {projectId && project
            ? `当前正在为项目“${project.title}”收集论文。`
            : "这里是独立搜索页；点开论文后会进入高级阅读器。"}
        </p>
        <div className="projects-inline-actions" style={{ marginTop: 10 }}>
          {projectId ? (
            <Button className="secondary" type="button" onClick={() => router.push(projectPath(projectId))}>
              返回项目
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="project-search-box">
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runSearch();
              }
            }}
            placeholder="输入研究问题或关键词"
          />
          <Button type="button" onClick={() => void runSearch()} disabled={loading}>
            {loading ? "搜索中..." : "开始搜索"}
          </Button>
        </div>
        {projectId ? (
          <div className="projects-inline-actions" style={{ marginTop: 12 }}>
            <Button type="button" onClick={() => void addBatchToProject()} disabled={adding || selectedIds.length === 0}>
              {adding ? "加入中..." : `批量加入项目 (${selectedIds.length})`}
            </Button>
          </div>
        ) : null}
      </Card>

      <StatusStack
        items={[
          ...(error ? [{ variant: "error" as const, message: error }] : []),
          ...warnings.map((message) => ({ variant: "warning" as const, message })),
          ...(notice ? [{ variant: "success" as const, message: notice }] : []),
        ]}
      />

      {papers.length === 0 ? <EmptyState title="暂无论文结果" hint="先执行一次搜索。" /> : <div style={{ display: "grid", gap: 10 }}>{resultCards}</div>}
    </>
  );
}

function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="button secondary" href={href}>
      {children}
    </Link>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Loading text="正在加载搜索页..." />}>
      <SearchPageContent />
    </Suspense>
  );
}
