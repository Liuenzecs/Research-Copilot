"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import EmptyState from "@/components/common/EmptyState";
import StatusStack from "@/components/common/StatusStack";
import {
  batchAddProjectPapers,
  createProjectSavedSearch,
  createProjectSearchRun,
  curateProjectReadingList,
  deleteProjectSavedSearch,
  generateProjectSavedSearchCandidateAiReason,
  getPaperCitationTrail,
  getProjectSavedSearch,
  listProjectSavedSearches,
  listProjectSearchRuns,
  rerunProjectSavedSearch,
  searchPapers,
  streamProjectTask,
  updateProjectSavedSearch,
  updateProjectSavedSearchCandidate,
} from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { paperReaderPath } from "@/lib/routes";
import type {
  PaperCitationTrail,
  PaperSearchFilters,
  PaperSearchSortMode,
  ProjectSavedSearch,
  ProjectSavedSearchDetail,
  ProjectSearchRun,
  ResearchProject,
  SearchCandidate,
} from "@/lib/types";

const LIMIT = 24;
const RECENT_KEY = "research-copilot:search-recent";
const AI_BUCKET_OPTIONS = [
  { key: "all", label: "全部" },
  { key: "classic_foundations", label: "基础经典" },
  { key: "core_must_read", label: "核心必读" },
  { key: "recent_frontier", label: "近期前沿" },
  { key: "repro_ready", label: "推荐复现" },
] as const;
const DEFAULT_FILTERS: PaperSearchFilters = {
  sources: ["arxiv", "openalex", "semantic_scholar"],
  year_from: null,
  year_to: null,
  venue_query: "",
  require_pdf: null,
  project_membership: "all",
  has_summary: null,
  has_reflection: null,
  has_reproduction: null,
  reading_status: "",
  repro_interest: "",
};

function fmt(value?: string | null) {
  if (!value) return "刚刚";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
}

function normalizeFilters(filters?: Partial<PaperSearchFilters> | null): PaperSearchFilters {
  return {
    ...DEFAULT_FILTERS,
    ...filters,
    sources: Array.isArray(filters?.sources) && filters.sources.length ? [...filters.sources] : [...DEFAULT_FILTERS.sources],
    year_from: typeof filters?.year_from === "number" ? filters.year_from : null,
    year_to: typeof filters?.year_to === "number" ? filters.year_to : null,
    require_pdf: typeof filters?.require_pdf === "boolean" ? filters.require_pdf : null,
    has_summary: typeof filters?.has_summary === "boolean" ? filters.has_summary : null,
    has_reflection: typeof filters?.has_reflection === "boolean" ? filters.has_reflection : null,
    has_reproduction: typeof filters?.has_reproduction === "boolean" ? filters.has_reproduction : null,
    venue_query: filters?.venue_query ?? "",
    project_membership: filters?.project_membership ?? "all",
    reading_status: filters?.reading_status ?? "",
    repro_interest: filters?.repro_interest ?? "",
  };
}

type LocalRecent = { query: string; filters: PaperSearchFilters; sort_mode: PaperSearchSortMode | string; updated_at: string };

function readLocalRecent(): LocalRecent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as LocalRecent[]) : [];
    return Array.isArray(parsed) ? parsed.map((item) => ({ ...item, filters: normalizeFilters(item.filters) })) : [];
  } catch {
    return [];
  }
}

function writeLocalRecent(next: LocalRecent[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, 6)));
}

function patchItems(items: SearchCandidate[], updated: SearchCandidate) {
  return items.map((item) => (item.paper.id === updated.paper.id ? updated : item));
}

function chips(candidate: SearchCandidate) {
  const values = [
    ...candidate.reason.matched_fields.map((item) => `命中 ${item}`),
    ...candidate.reason.source_signals,
    ...candidate.reason.local_signals,
  ];
  if (candidate.reason.duplicate_count > 1) values.push(`合并 ${candidate.reason.duplicate_count} 个来源`);
  return values.slice(0, 6);
}

function triageText(value: string) {
  if (value === "shortlisted") return "待重点阅读";
  if (value === "rejected") return "已排除";
  return "未筛选";
}

function aiBucketLabel(bucket: string) {
  return AI_BUCKET_OPTIONS.find((item) => item.key === bucket)?.label ?? bucket;
}

function topicScoreLabel(score: number) {
  if (score >= 0.9) return "主题非常贴合";
  if (score >= 0.7) return "主题较贴合";
  if (score >= 0.5) return "主题基本贴合";
  return "主题贴合度一般";
}

export default function ProjectSearchWorkbench({
  projectId,
  project,
  initialQuery,
  onProjectMutated,
}: {
  projectId?: number | null;
  project?: ResearchProject | null;
  initialQuery?: string;
  onProjectMutated?: () => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const searchAbortRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [filters, setFilters] = useState<PaperSearchFilters>(normalizeFilters());
  const [sortMode, setSortMode] = useState<PaperSearchSortMode | string>("relevance");
  const [savedTitle, setSavedTitle] = useState("");
  const [localRecent, setLocalRecent] = useState<LocalRecent[]>([]);
  const [activeSavedSearch, setActiveSavedSearch] = useState<ProjectSavedSearch | null>(null);
  const [activeRun, setActiveRun] = useState<ProjectSearchRun | null>(null);
  const [items, setItems] = useState<SearchCandidate[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<number[]>([]);
  const [activePaperId, setActivePaperId] = useState<number | null>(null);
  const [trail, setTrail] = useState<PaperCitationTrail | null>(null);
  const [trailSelection, setTrailSelection] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiNeed, setAiNeed] = useState(project?.research_question || "");
  const [aiTargetCount, setAiTargetCount] = useState(100);
  const [aiProfile, setAiProfile] = useState<"balanced" | "repro_first" | "frontier_first">("balanced");
  const [aiPreviewBucket, setAiPreviewBucket] = useState<(typeof AI_BUCKET_OPTIONS)[number]["key"]>("all");

  const hasProject = Boolean(projectId);
  const savedSearchesQuery = useQuery({
    queryKey: projectId ? queryKeys.projects.savedSearches(projectId) : ["projects", "saved-searches", "inactive"],
    queryFn: ({ signal }) => listProjectSavedSearches(projectId!, { signal }),
    enabled: Boolean(projectId),
  });
  const runsQuery = useQuery({
    queryKey: projectId ? queryKeys.projects.searchRuns(projectId) : ["projects", "search-runs", "inactive"],
    queryFn: ({ signal }) => listProjectSearchRuns(projectId!, { signal }),
    enabled: Boolean(projectId),
  });
  const savedSearches = savedSearchesQuery.data ?? [];
  const runs = runsQuery.data ?? [];
  const isAiPreview = activeSavedSearch?.search_mode === "ai_curated";
  const displayedItems = useMemo(
    () =>
      isAiPreview && aiPreviewBucket !== "all"
        ? items.filter((item) => item.selection_bucket === aiPreviewBucket)
        : items,
    [aiPreviewBucket, isAiPreview, items],
  );
  const activeCandidate = useMemo(
    () => displayedItems.find((item) => item.paper.id === activePaperId) ?? displayedItems[0] ?? null,
    [activePaperId, displayedItems],
  );
  const selectedCandidates = items.filter((item) => selectedPaperIds.includes(item.paper.id));
  const trailItems = trail ? [...trail.references, ...trail.cited_by] : [];
  const selectedTrailItems = trailItems.filter((item) => trailSelection.includes(item.paper.id));

  async function refreshCollections() {
    if (!projectId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.savedSearches(projectId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.searchRuns(projectId) }),
    ]);
  }

  function applySavedSearchDetail(payload: ProjectSavedSearchDetail) {
    setQuery(payload.saved_search.query);
    setFilters(normalizeFilters(payload.saved_search.filters));
    setSortMode(payload.saved_search.sort_mode);
    setSavedTitle(payload.saved_search.title);
    setActiveSavedSearch(payload.saved_search);
    setActiveRun(payload.last_run ?? null);
    setItems(payload.items);
    setWarnings(payload.last_run?.warnings ?? []);
    if (payload.saved_search.search_mode === "ai_curated") {
      setAiNeed(payload.saved_search.user_need || payload.saved_search.query);
      setAiTargetCount(payload.saved_search.target_count || 100);
      setAiProfile((payload.saved_search.selection_profile as "balanced" | "repro_first" | "frontier_first") || "balanced");
      setAiPreviewBucket("all");
    }
  }

  useEffect(() => {
    if (!query.trim()) {
      const seeded = initialQuery || project?.seed_query || project?.research_question || "";
      if (seeded.trim()) setQuery(seeded);
    }
  }, [initialQuery, project, query]);

  useEffect(() => {
    if (!aiNeed.trim()) {
      const seeded = project?.research_question || initialQuery || project?.seed_query || "";
      if (seeded.trim()) setAiNeed(seeded);
    }
  }, [aiNeed, initialQuery, project]);

  useEffect(() => {
    if (!projectId) {
      setLocalRecent(readLocalRecent());
    }
  }, [projectId]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setSelectedPaperIds((current) => current.filter((paperId) => items.some((item) => item.paper.id === paperId)));
    if (!items.length) {
      setActivePaperId(null);
      setTrail(null);
      setTrailSelection([]);
      return;
    }
    if (!activePaperId || !items.some((item) => item.paper.id === activePaperId)) setActivePaperId(items[0].paper.id);
  }, [activePaperId, items]);

  async function runSearch() {
    if (!query.trim()) return setError("请先输入研究问题或关键词。");
    setLoading(true);
    setError("");
    setNotice("");
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    try {
      if (projectId) {
        const payload = await createProjectSearchRun(
          projectId,
          { query: query.trim(), filters, sort_mode: sortMode },
          { signal: controller.signal },
        );
        setActiveSavedSearch(null);
        setActiveRun(payload.run);
        setSavedTitle("");
        setItems(payload.items);
        setWarnings(payload.run.warnings);
        await refreshCollections();
        setNotice(`已完成一次项目搜索，返回 ${payload.items.length} 条候选。`);
      } else {
        const payload = await searchPapers({
          query: query.trim(),
          sources: filters.sources,
          limit: LIMIT,
          year_from: filters.year_from,
          year_to: filters.year_to,
          venue_query: filters.venue_query,
          require_pdf: filters.require_pdf,
          has_summary: filters.has_summary,
          has_reflection: filters.has_reflection,
          has_reproduction: filters.has_reproduction,
          reading_status: filters.reading_status,
          repro_interest: filters.repro_interest,
          sort_mode: sortMode,
        }, LIMIT, { signal: controller.signal });
        setItems(payload.items);
        setWarnings(payload.warnings ?? []);
        const nextRecent = [{ query: query.trim(), filters, sort_mode: sortMode, updated_at: new Date().toISOString() }, ...readLocalRecent()]
          .filter((item, index, array) => index === array.findIndex((candidate) => candidate.query === item.query && candidate.sort_mode === item.sort_mode))
          .slice(0, 6);
        writeLocalRecent(nextRecent);
        setLocalRecent(nextRecent);
        setNotice(payload.items.length ? `已找到 ${payload.items.length} 条候选。` : "当前没有命中结果。");
      }
    } catch (runError) {
      if (runError instanceof DOMException && runError.name === "AbortError") {
        return;
      }
      setError((runError as Error).message || "搜索失败");
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setLoading(false);
      }
    }
  }

  async function openSavedSearch(searchId: number) {
    if (!projectId) return;
    setBusy("saved");
    setError("");
    try {
      const payload = await queryClient.fetchQuery({
        queryKey: queryKeys.projects.savedSearchDetail(projectId, searchId),
        queryFn: ({ signal }) => getProjectSavedSearch(projectId, searchId, { signal }),
      });
      applySavedSearchDetail(payload);
      setNotice(`已打开“${payload.saved_search.title}”。`);
    } catch (loadError) {
      setError((loadError as Error).message || "已保存搜索加载失败");
    } finally {
      setBusy("");
    }
  }

  async function saveSearch() {
    if (!projectId) return;
    setBusy("save");
    setError("");
    try {
      const payload = await createProjectSavedSearch(projectId, {
        title: savedTitle.trim(),
        query: query.trim(),
        filters,
        sort_mode: sortMode,
        source_run_id: activeRun?.id ?? null,
      });
      applySavedSearchDetail(payload);
      await refreshCollections();
      setNotice(`已保存搜索“${payload.saved_search.title}”。`);
    } catch (saveError) {
      setError((saveError as Error).message || "保存搜索失败");
    } finally {
      setBusy("");
    }
  }

  async function updateCurrentSavedSearch() {
    if (!projectId || !activeSavedSearch) return;
    setBusy("update");
    setError("");
    try {
      await updateProjectSavedSearch(projectId, activeSavedSearch.id, {
        title: savedTitle.trim() || activeSavedSearch.title,
        query: query.trim() || activeSavedSearch.query,
        filters,
        sort_mode: sortMode,
      });
      await rerunSavedSearch(activeSavedSearch.id);
      setNotice("已更新当前已保存搜索。");
    } catch (updateError) {
      setError((updateError as Error).message || "更新失败");
    } finally {
      setBusy("");
    }
  }

  async function rerunSavedSearch(searchId: number) {
    if (!projectId) return;
    setBusy("rerun");
    setError("");
    try {
      const current = savedSearches.find((item) => item.id === searchId) ?? (activeSavedSearch?.id === searchId ? activeSavedSearch : null);
      if (current?.search_mode === "ai_curated") {
        await runAiCuration({
          userNeed: current.user_need || current.query,
          targetCount: current.target_count || 100,
          selectionProfile: current.selection_profile,
          savedSearchId: current.id,
        });
        return;
      }
      const payload = await rerunProjectSavedSearch(projectId, searchId);
      applySavedSearchDetail(payload);
      await refreshCollections();
      setNotice(`已重跑“${payload.saved_search.title}”。`);
    } catch (rerunError) {
      setError((rerunError as Error).message || "重跑失败");
    } finally {
      setBusy("");
    }
  }

  async function runAiCuration(options?: {
    userNeed?: string;
    targetCount?: number;
    selectionProfile?: string;
    savedSearchId?: number | null;
  }) {
    if (!projectId) return;
    const userNeed = (options?.userNeed ?? aiNeed).trim();
    if (!userNeed) {
      setError("请先输入你的研究需求，再让 AI 帮你挑论文。");
      return;
    }

    setBusy("curate");
    setError("");
    setNotice("");
    try {
      const launch = await curateProjectReadingList(projectId, {
        user_need: userNeed,
        target_count: Math.min(200, Math.max(20, Number(options?.targetCount ?? aiTargetCount) || 100)),
        selection_profile: options?.selectionProfile ?? aiProfile,
        saved_search_id: options?.savedSearchId ?? null,
        sources: filters.sources,
      });

      setNotice("AI 选文任务已启动，正在生成预览……");
      let savedSearchId = options?.savedSearchId ?? null;
      await streamProjectTask(projectId, launch.task.id, {
        onEvent: (event) => {
          if (event.type === "progress" && event.step?.message) {
            setNotice(event.step.message);
          }
          if ((event.type === "task_completed" || event.type === "task_failed") && event.task?.output_json) {
            const candidateId = Number((event.task.output_json as Record<string, unknown>).saved_search_id ?? 0);
            if (candidateId > 0) savedSearchId = candidateId;
          }
        },
      });

      if (savedSearchId) {
        await openSavedSearch(savedSearchId);
      }
      await refreshCollections();
      setNotice("AI 选文预览已生成，请先检查后再确认加入项目。");
    } catch (curateError) {
      setError((curateError as Error).message || "AI 选文失败");
    } finally {
      setBusy("");
    }
  }

  async function removeSavedSearch(searchId: number) {
    if (!projectId || !window.confirm("删除这条已保存搜索及其候选状态？")) return;
    setBusy("delete");
    setError("");
    try {
      await deleteProjectSavedSearch(projectId, searchId);
      await refreshCollections();
      if (activeSavedSearch?.id === searchId) {
        setActiveSavedSearch(null);
        setActiveRun(null);
        setSavedTitle("");
        setItems([]);
      }
      setNotice("已删除该已保存搜索。");
    } catch (deleteError) {
      setError((deleteError as Error).message || "删除失败");
    } finally {
      setBusy("");
    }
  }

  async function addCandidatesToProject(targetItems: SearchCandidate[]) {
    if (!projectId || !targetItems.length) return;
    setBusy("add");
    setError("");
    try {
      await batchAddProjectPapers(projectId, {
        items: targetItems.map((item) => ({
          paper_id: item.paper.id,
          saved_search_candidate_id: item.candidate_id ?? null,
        })),
      });
      setItems((current) => current.map((item) => (targetItems.some((target) => target.paper.id === item.paper.id) ? { ...item, is_in_project: true } : item)));
      setTrail((current) =>
        current
          ? {
              paper: current.paper,
              references: current.references.map((item) =>
                targetItems.some((target) => target.paper.id === item.paper.id) ? { ...item, is_in_project: true } : item,
              ),
              cited_by: current.cited_by.map((item) =>
                targetItems.some((target) => target.paper.id === item.paper.id) ? { ...item, is_in_project: true } : item,
              ),
            }
          : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.workspace(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() }),
      ]);
      await Promise.resolve(onProjectMutated?.());
      setNotice(`已加入 ${targetItems.length} 篇论文。`);
    } catch (addError) {
      setError((addError as Error).message || "加入项目失败");
    } finally {
      setBusy("");
    }
  }

  async function batchTriage(nextStatus: "new" | "shortlisted" | "rejected") {
    if (!projectId || !activeSavedSearch || !selectedCandidates.length) return;
    setBusy(`triage-${nextStatus}`);
    setError("");
    try {
      const updated = await Promise.all(
        selectedCandidates
          .filter((item) => item.candidate_id)
          .map((item) => updateProjectSavedSearchCandidate(projectId, activeSavedSearch.id, item.candidate_id!, { triage_status: nextStatus })),
      );
      setItems((current) => updated.reduce((next, item) => patchItems(next, item), current));
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.savedSearchDetail(projectId, activeSavedSearch.id) });
      setNotice("已批量更新候选状态。");
    } catch (triageError) {
      setError((triageError as Error).message || "批量更新失败");
    } finally {
      setBusy("");
    }
  }

  async function generateAiReason(candidate: SearchCandidate) {
    if (!projectId || !activeSavedSearch || !candidate.candidate_id) return setError("请先保存搜索，再生成可持久化的 AI 推荐理由。");
    setBusy(`ai-${candidate.paper.id}`);
    setError("");
    try {
      const payload = await generateProjectSavedSearchCandidateAiReason(projectId, activeSavedSearch.id, candidate.candidate_id);
      setItems((current) => patchItems(current, payload.item));
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.savedSearchDetail(projectId, activeSavedSearch.id) });
      setNotice("已生成 AI 推荐理由。");
    } catch (aiError) {
      setError((aiError as Error).message || "生成 AI 推荐理由失败");
    } finally {
      setBusy("");
    }
  }

  async function loadTrail(candidate: SearchCandidate) {
    setBusy("trail");
    setError("");
    try {
      const payload = await queryClient.fetchQuery({
        queryKey: queryKeys.papers.citationTrail(candidate.paper.id),
        queryFn: ({ signal }) => getPaperCitationTrail(candidate.paper.id, { signal }),
      });
      setTrail(payload);
      setTrailSelection([]);
    } catch (trailError) {
      setError((trailError as Error).message || "引文链加载失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <Card>
      <div className="projects-section-header">
        <div>
          <h2 className="title">搜索与收集台</h2>
          <p className="subtle" style={{ margin: "6px 0 0" }}>
            {hasProject ? "支持保存搜索、搜索历史、批量筛选候选、按需生成 AI 推荐理由和单跳引文链。" : "独立搜索只保留本地最近搜索，不创建项目级持久化对象。"}
          </p>
        </div>
      </div>

      {hasProject ? (
        <div className="project-search-filter-card" style={{ marginBottom: 12 }}>
          <strong>AI 帮我挑论文</strong>
          <p className="subtle" style={{ marginTop: 6 }}>
            输入你的研究需求，先生成预览，再决定是否把这批论文加入项目。
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <textarea
              className="textarea"
              value={aiNeed}
              onChange={(event) => setAiNeed(event.target.value)}
              placeholder="例如：帮我为 LLM Agent 入门与复现整理 100 篇最适合先读的论文，兼顾经典、近期前沿和可复现性。"
              rows={3}
            />
            <div className="project-inline-compact">
              <input
                className="input"
                type="number"
                min={20}
                max={200}
                value={aiTargetCount}
                onChange={(event) => setAiTargetCount(Number(event.target.value) || 100)}
                placeholder="目标篇数"
              />
              <select className="select" value={aiProfile} onChange={(event) => setAiProfile(event.target.value as "balanced" | "repro_first" | "frontier_first")}>
                <option value="balanced">平衡分层</option>
                <option value="repro_first">复现优先</option>
                <option value="frontier_first">前沿优先</option>
              </select>
              <Button type="button" onClick={() => void runAiCuration()} disabled={busy !== ""}>
                {busy === "curate" ? "生成预览中..." : "AI 帮我挑论文"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="project-search-toolbar">
        <input className="input" data-testid="project-search-input" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runSearch()} placeholder="输入研究问题或关键词" />
        <select className="select" value={sortMode} onChange={(event) => setSortMode(event.target.value as PaperSearchSortMode)}>
          <option value="relevance">相关性优先</option>
          <option value="year_desc">年份倒序</option>
          <option value="citation_desc">引用倒序</option>
        </select>
        <Button type="button" data-testid="project-search-run" onClick={() => void runSearch()} disabled={loading}>{loading ? "搜索中..." : "搜索论文"}</Button>
      </div>

      <div className="project-search-advanced-grid">
        <div className="project-search-filter-card">
          <span className="subtle">数据源</span>
          <div className="project-chip-row">
            {["arxiv", "openalex", "semantic_scholar"].map((source) => (
              <button key={source} type="button" className={`project-filter-chip${filters.sources.includes(source) ? " is-active" : ""}`.trim()} onClick={() => setFilters((current) => ({ ...current, sources: current.sources.includes(source) ? current.sources.filter((item) => item !== source) : [...current.sources, source] }))}>{source}</button>
            ))}
          </div>
        </div>
        <div className="project-search-filter-card">
          <span className="subtle">年份区间</span>
          <div className="project-inline-compact">
            <input className="input" value={filters.year_from ?? ""} onChange={(event) => setFilters((current) => ({ ...current, year_from: event.target.value ? Number(event.target.value) : null }))} placeholder="起始" />
            <input className="input" value={filters.year_to ?? ""} onChange={(event) => setFilters((current) => ({ ...current, year_to: event.target.value ? Number(event.target.value) : null }))} placeholder="截止" />
          </div>
        </div>
        <div className="project-search-filter-card">
          <span className="subtle">Venue</span>
          <input className="input" value={filters.venue_query} onChange={(event) => setFilters((current) => ({ ...current, venue_query: event.target.value }))} placeholder="如 ACL / Nature" />
        </div>
        <div className="project-search-filter-card">
          <span className="subtle">PDF</span>
          <select className="select" value={filters.require_pdf === null ? "all" : filters.require_pdf ? "yes" : "no"} onChange={(event) => setFilters((current) => ({ ...current, require_pdf: event.target.value === "all" ? null : event.target.value === "yes" }))}>
            <option value="all">不限</option>
            <option value="yes">必须有 PDF</option>
            <option value="no">仅无 PDF</option>
          </select>
        </div>
        {hasProject ? (
          <div className="project-search-filter-card">
            <span className="subtle">项目关系</span>
            <select className="select" value={filters.project_membership} onChange={(event) => setFilters((current) => ({ ...current, project_membership: event.target.value }))}>
              <option value="all">全部</option>
              <option value="not_in_project">仅未加入项目</option>
              <option value="in_project">仅已在项目</option>
            </select>
          </div>
        ) : null}
        <div className="project-search-filter-card">
          <span className="subtle">本地资产</span>
          <div className="project-inline-compact">
            <select className="select" value={filters.has_summary === null ? "all" : filters.has_summary ? "yes" : "no"} onChange={(event) => setFilters((current) => ({ ...current, has_summary: event.target.value === "all" ? null : event.target.value === "yes" }))}><option value="all">摘要不限</option><option value="yes">已有摘要</option><option value="no">暂无摘要</option></select>
            <select className="select" value={filters.has_reflection === null ? "all" : filters.has_reflection ? "yes" : "no"} onChange={(event) => setFilters((current) => ({ ...current, has_reflection: event.target.value === "all" ? null : event.target.value === "yes" }))}><option value="all">心得不限</option><option value="yes">已有心得</option><option value="no">暂无心得</option></select>
            <select className="select" value={filters.has_reproduction === null ? "all" : filters.has_reproduction ? "yes" : "no"} onChange={(event) => setFilters((current) => ({ ...current, has_reproduction: event.target.value === "all" ? null : event.target.value === "yes" }))}><option value="all">复现不限</option><option value="yes">已有复现</option><option value="no">暂无复现</option></select>
          </div>
        </div>
      </div>

      {hasProject ? (
        <div className="project-search-side-list">
          <div className="project-inline-compact">
            <input className="input" value={savedTitle} onChange={(event) => setSavedTitle(event.target.value)} placeholder="保存搜索名称" />
            <Button type="button" data-testid="save-search-button" onClick={() => void saveSearch()} disabled={!query.trim() || busy !== ""}>{busy === "save" ? "保存中..." : "保存搜索"}</Button>
            {activeSavedSearch ? <Button className="secondary" data-testid="update-saved-search-button" type="button" onClick={() => void updateCurrentSavedSearch()} disabled={busy !== ""}>覆盖当前已保存搜索</Button> : null}
            {activeSavedSearch ? <Button className="secondary" data-testid="delete-saved-search-button" type="button" onClick={() => void removeSavedSearch(activeSavedSearch.id)} disabled={busy !== ""}>删除当前已保存搜索</Button> : null}
          </div>
          <div className="project-saved-search-columns">
            <div className="project-saved-search-list">
              {savedSearches.length === 0 ? <EmptyState title="还没有已保存搜索" hint="先跑一次项目搜索，再把值得复用的查询保存下来。" /> : savedSearches.map((item) => (
                <button key={item.id} type="button" data-testid={`saved-search-${item.id}`} className={`project-run-card${activeSavedSearch?.id === item.id ? " is-active" : ""}`.trim()} onClick={() => void openSavedSearch(item.id)}>
                  <strong>{item.title}</strong>
                  <span className="subtle">{item.query}</span>
                  <span className="subtle">{item.last_result_count} 条 · 更新于 {fmt(item.updated_at)}</span>
                  <div className="projects-inline-actions">
                    <span className="project-stat-chip">{item.sort_mode}</span>
                    <Button className="secondary" type="button" onClick={(event) => { event.stopPropagation(); void rerunSavedSearch(item.id); }} disabled={busy !== ""}>重跑</Button>
                  </div>
                </button>
              ))}
            </div>
            <div className="project-saved-search-list">
              {runs.length === 0 ? <EmptyState title="还没有搜索历史" hint="每一次项目搜索都会记录在这里。" /> : runs.map((item) => (
                <div key={item.id} className="project-run-card">
                  <strong>{item.query}</strong>
                  <span className="subtle">{item.result_count} 条 · {fmt(item.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="project-saved-search-list">
          {localRecent.length === 0 ? <EmptyState title="还没有本地最近搜索" hint="独立搜索模式会把最近查询留在浏览器本地。" /> : localRecent.map((item, index) => (
            <button key={`${item.query}-${index}`} type="button" className="project-run-card" onClick={() => { setQuery(item.query); setFilters(normalizeFilters(item.filters)); setSortMode(item.sort_mode); }}>
              <strong>{item.query}</strong>
              <span className="subtle">{item.sort_mode} · {fmt(item.updated_at)}</span>
            </button>
          ))}
        </div>
      )}

      <StatusStack items={[...(error ? [{ variant: "error" as const, message: error }] : []), ...warnings.map((message) => ({ variant: "warning" as const, message })), ...(notice ? [{ variant: "success" as const, message: notice }] : [])]} />

      {isAiPreview ? (
        <div className="project-search-filter-card" style={{ marginTop: 12 }}>
          <strong>AI 100 篇预览</strong>
          <div className="subtle" style={{ marginTop: 6 }}>
            需求：{activeSavedSearch?.user_need || aiNeed || "未填写"} · 目标篇数 {activeSavedSearch?.target_count || aiTargetCount}
          </div>
          <div className="project-chip-row" style={{ marginTop: 10 }}>
            {AI_BUCKET_OPTIONS.map((bucket) => {
              const count = bucket.key === "all" ? items.length : items.filter((item) => item.selection_bucket === bucket.key).length;
              return (
                <button
                  key={bucket.key}
                  type="button"
                  className={`project-filter-chip${aiPreviewBucket === bucket.key ? " is-active" : ""}`.trim()}
                  onClick={() => setAiPreviewBucket(bucket.key)}
                >
                  {bucket.label} · {count}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="projects-inline-actions" style={{ marginTop: 12 }}>
        <Button type="button" data-testid="project-search-batch-add" onClick={() => void addCandidatesToProject(selectedCandidates)} disabled={!projectId || !selectedCandidates.length || busy !== ""}>{busy === "add" ? "加入中..." : isAiPreview ? `确认加入已勾选论文 (${selectedCandidates.length})` : `批量加入项目 (${selectedCandidates.length})`}</Button>
        <Button className="secondary" type="button" onClick={() => void batchTriage("shortlisted")} disabled={!projectId || !activeSavedSearch || !selectedCandidates.length || busy !== ""}>标为待重点阅读</Button>
        <Button className="secondary" type="button" onClick={() => void batchTriage("rejected")} disabled={!projectId || !activeSavedSearch || !selectedCandidates.length || busy !== ""}>标为排除</Button>
        <Button className="secondary" type="button" onClick={() => void batchTriage("new")} disabled={!projectId || !activeSavedSearch || !selectedCandidates.length || busy !== ""}>清除状态</Button>
        <Button className="secondary" type="button" onClick={() => setSelectedPaperIds(displayedItems.map((item) => item.paper.id))}>全选结果</Button>
      </div>

      <div className="project-search-layout">
        <div className="project-search-result-list">
          {displayedItems.length === 0 ? <EmptyState title="还没有候选结果" hint="先运行一次搜索，或打开一条已保存搜索。" /> : displayedItems.map((candidate) => (
            <button key={candidate.paper.id} type="button" className={`project-paper-search-item project-candidate-card${activeCandidate?.paper.id === candidate.paper.id ? " is-active" : ""}`.trim()} data-testid={`search-result-${candidate.paper.id}`} onClick={() => setActivePaperId(candidate.paper.id)}>
              <div className="project-candidate-head">
                <label className="project-paper-check"><input type="checkbox" checked={selectedPaperIds.includes(candidate.paper.id)} onChange={(event) => setSelectedPaperIds((current) => event.target.checked ? [...new Set([...current, candidate.paper.id])] : current.filter((item) => item !== candidate.paper.id))} /><span>{candidate.is_in_project ? "已在项目中" : "加入本批次"}</span></label>
                <div className="project-chip-row">
                  {candidate.selected_by_ai && candidate.selection_bucket ? <span className="project-filter-chip is-static">{aiBucketLabel(candidate.selection_bucket)}</span> : null}
                  {candidate.selection_rank ? <span className="project-filter-chip is-static">#{candidate.selection_rank}</span> : null}
                  <span className="project-filter-chip is-static">{triageText(candidate.triage_status)}</span>
                </div>
              </div>
              <strong>{candidate.paper.title_en}</strong>
              <div className="subtle">主题分 {candidate.reason.topic_match_score.toFixed(2)} · {topicScoreLabel(candidate.reason.topic_match_score)}</div>
              <div className="subtle">{candidate.reason.ranking_reason || candidate.reason.filter_reason}</div>
              <div className="subtle">{candidate.paper.authors || "作者未知"} · {candidate.paper.year ?? "年份未知"} · 引用 {candidate.paper.citation_count ?? 0}</div>
              <div className="subtle">摘要 {candidate.summary_count} · 心得 {candidate.reflection_count} · 复现 {candidate.reproduction_count}</div>
              <div className="project-chip-row">{chips(candidate).map((chip) => <span key={`${candidate.paper.id}-${chip}`} className="project-filter-chip is-static">{chip}</span>)}</div>
            </button>
          ))}
        </div>

        <div className="project-search-inspector">
          {!activeCandidate ? <EmptyState title="选择一篇候选论文" hint="右侧会展示规则解释、AI 推荐理由和单跳引文链。" /> : (
            <>
              <div className="projects-section-header"><div><h3 className="title" style={{ fontSize: 20 }}>{activeCandidate.paper.title_en}</h3><p className="subtle" style={{ margin: "6px 0 0" }}>{activeCandidate.paper.authors || "作者未知"} · {activeCandidate.paper.venue || "Venue 未知"} · {activeCandidate.paper.year ?? "年份未知"}</p></div><span className="project-stat-chip">排序 #{activeCandidate.rank_position}</span></div>
              <div className="subtle">{activeCandidate.paper.abstract_en || "当前没有摘要。"}</div>
              <div className="project-search-detail-card">
                <strong>为什么这篇值得看</strong>
                <div className="subtle">{activeCandidate.reason.summary || "系统会展示规则解释。"}</div>
                <div className="subtle">主题分 {activeCandidate.reason.topic_match_score.toFixed(2)} · {activeCandidate.reason.passed_topic_gate ? "已通过高精度主题门槛" : "未通过高精度主题门槛"}</div>
                <div className="subtle">{activeCandidate.reason.ranking_reason || activeCandidate.reason.filter_reason}</div>
                {activeCandidate.reason.matched_terms.length > 0 ? (
                  <div className="subtle">命中主题词：{activeCandidate.reason.matched_terms.join("、")}</div>
                ) : null}
                <div className="project-chip-row">{chips(activeCandidate).map((chip) => <span key={`inspector-${chip}`} className="project-filter-chip is-static">{chip}</span>)}</div>
              </div>
              <div className="project-search-detail-card"><strong>AI 推荐理由</strong><div className="subtle">{activeCandidate.ai_reason_text || "默认先展示规则解释；需要时可按需生成 AI 推荐理由。"}</div><div className="projects-inline-actions"><Button className="secondary" data-testid="generate-ai-reason-button" type="button" onClick={() => void generateAiReason(activeCandidate)} disabled={!projectId || !activeSavedSearch || !activeCandidate.candidate_id || busy !== ""}>{busy === `ai-${activeCandidate.paper.id}` ? "生成中..." : "生成 AI 推荐理由"}</Button><Link className="button secondary" to={paperReaderPath(activeCandidate.paper.id, undefined, undefined, projectId)}>打开阅读器</Link>{projectId ? <Button type="button" onClick={() => void addCandidatesToProject([activeCandidate])} disabled={busy !== ""}>{activeCandidate.is_in_project ? "已在项目中" : "加入项目"}</Button> : null}<Button className="secondary" data-testid="load-citation-trail-button" type="button" onClick={() => void loadTrail(activeCandidate)} disabled={busy !== ""}>{busy === "trail" ? "加载中..." : "查看单跳引文链"}</Button></div></div>
              <div className="project-search-detail-card">
                <div className="projects-section-header"><div><strong>单跳引文链</strong><div className="subtle">展示参考文献和被引论文各一跳。</div></div>{projectId ? <Button className="secondary" data-testid="citation-batch-add-button" type="button" onClick={() => void addCandidatesToProject(selectedTrailItems)} disabled={!selectedTrailItems.length || busy !== ""}>{busy === "add" ? "加入中..." : `批量加入项目 (${selectedTrailItems.length})`}</Button> : null}</div>
                {!trail ? <div className="subtle">点击“查看单跳引文链”后，这里会展示相关论文。</div> : <div className="project-citation-grid"><div className="project-citation-column"><strong>参考文献</strong>{trail.references.map((item) => <label key={`ref-${item.paper.id}`} className="project-citation-card">{projectId ? <input type="checkbox" checked={trailSelection.includes(item.paper.id)} onChange={(event) => setTrailSelection((current) => event.target.checked ? [...new Set([...current, item.paper.id])] : current.filter((paperId) => paperId !== item.paper.id))} /> : null}<div><strong>{item.paper.title_en}</strong><div className="subtle">{item.paper.authors || "作者未知"} · {item.paper.year ?? "年份未知"}</div></div></label>)}</div><div className="project-citation-column"><strong>被引论文</strong>{trail.cited_by.map((item) => <label key={`cit-${item.paper.id}`} className="project-citation-card">{projectId ? <input type="checkbox" checked={trailSelection.includes(item.paper.id)} onChange={(event) => setTrailSelection((current) => event.target.checked ? [...new Set([...current, item.paper.id])] : current.filter((paperId) => paperId !== item.paper.id))} /> : null}<div><strong>{item.paper.title_en}</strong><div className="subtle">{item.paper.authors || "作者未知"} · {item.paper.year ?? "年份未知"}</div></div></label>)}</div></div>}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
