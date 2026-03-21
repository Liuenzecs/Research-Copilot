import type { Dispatch, SetStateAction } from "react";
import { Link } from "react-router-dom";

import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import EmptyState from "@/components/common/EmptyState";
import StatusStack from "@/components/common/StatusStack";
import { paperReaderPath } from "@/lib/routes";
import type {
  PaperCitationTrail,
  PaperSearchFilters,
  PaperSearchSortMode,
  ProjectSavedSearch,
  ProjectSearchRun,
  SearchCandidate,
} from "@/lib/types";

const AI_BUCKET_OPTIONS = [
  { key: "all", label: "全部" },
  { key: "classic_foundations", label: "基础经典" },
  { key: "core_must_read", label: "核心必读" },
  { key: "recent_frontier", label: "近期前沿" },
  { key: "repro_ready", label: "推荐复现" },
] as const;

type LocalRecentItem = {
  query: string;
  filters: PaperSearchFilters;
  sort_mode: PaperSearchSortMode | string;
  updated_at: string;
};

function fmt(value?: string | null) {
  if (!value) return "刚刚";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
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
  if (score >= 0.9) return "强主题匹配";
  if (score >= 0.7) return "较强主题匹配";
  if (score >= 0.5) return "基础主题匹配";
  return "边缘命中，建议人工复核";
}

type Props = {
  hasProject: boolean;
  projectId?: number | null;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  filters: PaperSearchFilters;
  setFilters: Dispatch<SetStateAction<PaperSearchFilters>>;
  sortMode: PaperSearchSortMode | string;
  setSortMode: Dispatch<SetStateAction<PaperSearchSortMode | string>>;
  loading: boolean;
  busy: string;
  error: string;
  warnings: string[];
  notice: string;
  savedTitle: string;
  setSavedTitle: Dispatch<SetStateAction<string>>;
  savedSearches: ProjectSavedSearch[];
  runs: ProjectSearchRun[];
  localRecent: LocalRecentItem[];
  onLoadLocalRecent: (item: LocalRecentItem) => void;
  activeSavedSearch: ProjectSavedSearch | null;
  activeCandidate: SearchCandidate | null;
  displayedItems: SearchCandidate[];
  items: SearchCandidate[];
  setActivePaperId: Dispatch<SetStateAction<number | null>>;
  selectedPaperIds: number[];
  setSelectedPaperIds: Dispatch<SetStateAction<number[]>>;
  selectedCandidates: SearchCandidate[];
  trail: PaperCitationTrail | null;
  trailSelection: number[];
  setTrailSelection: Dispatch<SetStateAction<number[]>>;
  selectedTrailItems: SearchCandidate[];
  aiNeed: string;
  setAiNeed: Dispatch<SetStateAction<string>>;
  aiTargetCount: number;
  setAiTargetCount: Dispatch<SetStateAction<number>>;
  aiProfile: "balanced" | "repro_first" | "frontier_first";
  setAiProfile: Dispatch<SetStateAction<"balanced" | "repro_first" | "frontier_first">>;
  aiPreviewBucket: (typeof AI_BUCKET_OPTIONS)[number]["key"];
  setAiPreviewBucket: Dispatch<SetStateAction<(typeof AI_BUCKET_OPTIONS)[number]["key"]>>;
  aiPanelOpen: boolean;
  setAiPanelOpen: Dispatch<SetStateAction<boolean>>;
  advancedFiltersOpen: boolean;
  setAdvancedFiltersOpen: Dispatch<SetStateAction<boolean>>;
  hasActiveFilters: boolean;
  filterSummary: string[];
  isAiPreview: boolean;
  onRunSearch: () => Promise<void> | void;
  onSaveSearch: () => Promise<void> | void;
  onUpdateSavedSearch: () => Promise<void> | void;
  onDeleteSavedSearch: (searchId: number) => Promise<void> | void;
  onOpenSavedSearch: (searchId: number) => Promise<void> | void;
  onRerunSavedSearch: (searchId: number) => Promise<void> | void;
  onRunAiCuration: () => Promise<void> | void;
  onAddCandidatesToProject: (items: SearchCandidate[]) => Promise<void> | void;
  onBatchTriage: (nextStatus: "new" | "shortlisted" | "rejected") => Promise<void> | void;
  onGenerateAiReason: (candidate: SearchCandidate) => Promise<void> | void;
  onLoadTrail: (candidate: SearchCandidate) => Promise<void> | void;
};

export default function ProjectSearchWorkbenchLayout(props: Props) {
  const {
    hasProject,
    projectId,
    query,
    setQuery,
    filters,
    setFilters,
    sortMode,
    setSortMode,
    loading,
    busy,
    error,
    warnings,
    notice,
    savedTitle,
    setSavedTitle,
    savedSearches,
    runs,
    localRecent,
    onLoadLocalRecent,
    activeSavedSearch,
    activeCandidate,
    displayedItems,
    items,
    setActivePaperId,
    selectedPaperIds,
    setSelectedPaperIds,
    selectedCandidates,
    trail,
    trailSelection,
    setTrailSelection,
    selectedTrailItems,
    aiNeed,
    setAiNeed,
    aiTargetCount,
    setAiTargetCount,
    aiProfile,
    setAiProfile,
    aiPreviewBucket,
    setAiPreviewBucket,
    aiPanelOpen,
    setAiPanelOpen,
    advancedFiltersOpen,
    setAdvancedFiltersOpen,
    hasActiveFilters,
    filterSummary,
    isAiPreview,
    onRunSearch,
    onSaveSearch,
    onUpdateSavedSearch,
    onDeleteSavedSearch,
    onOpenSavedSearch,
    onRerunSavedSearch,
    onRunAiCuration,
    onAddCandidatesToProject,
    onBatchTriage,
    onGenerateAiReason,
    onLoadTrail,
  } = props;

  return (
    <Card className="search-workbench-shell">
      <div className="page-toolbar-row">
        <div>
          <h2 className="title">搜索与收集台</h2>
          <p className="subtle" style={{ margin: "6px 0 0" }}>
            {hasProject ? "先看结果，再逐步展开筛选、保存搜索、候选筛选和单跳引文链。" : "独立搜索模式只保留本地最近搜索，不创建项目级持久化对象。"}
          </p>
        </div>
        <div className="tool-chip-row">
          <span className="project-filter-chip is-static">结果 {displayedItems.length}</span>
          <span className="project-filter-chip is-static">排序 {sortMode}</span>
          {hasProject ? <span className="project-filter-chip is-static">已保存搜索 {savedSearches.length}</span> : null}
        </div>
      </div>

      <div className="search-query-bar">
        <div className="search-query-main">
          <input
            className="input"
            data-testid="project-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void onRunSearch()}
            placeholder="输入研究问题或关键词"
          />
          <select className="select" value={sortMode} onChange={(event) => setSortMode(event.target.value as PaperSearchSortMode)}>
            <option value="relevance">相关性优先</option>
            <option value="year_desc">年份倒序</option>
            <option value="citation_desc">引用倒序</option>
          </select>
          <Button type="button" data-testid="project-search-run" onClick={() => void onRunSearch()} disabled={loading}>
            {loading ? "搜索中..." : "搜索论文"}
          </Button>
        </div>

        <div className="search-summary-strip">
          <div className="search-filter-summary">
            <strong>当前筛选</strong>
            <span className="subtle">{hasActiveFilters ? filterSummary.join(" · ") : "未启用高级筛选"}</span>
          </div>
          <div className="tool-action-row" style={{ justifyContent: "flex-start" }}>
            <Button className="secondary" type="button" onClick={() => setAdvancedFiltersOpen((current) => !current)}>
              {advancedFiltersOpen ? "收起高级筛选" : "展开高级筛选"}
            </Button>
            {hasProject ? (
              <Button className="secondary" type="button" onClick={() => setAiPanelOpen((current) => !current)}>
                {aiPanelOpen ? "收起 AI 选文" : "AI 帮我挑论文"}
              </Button>
            ) : null}
          </div>
        </div>

        {advancedFiltersOpen ? (
          <div className="search-filter-grid">
            <div className="project-search-filter-card">
              <span className="subtle">数据源</span>
              <div className="project-chip-row">
                {["arxiv", "openalex", "semantic_scholar"].map((source) => (
                  <button
                    key={source}
                    type="button"
                    className={`project-filter-chip${filters.sources.includes(source) ? " is-active" : ""}`.trim()}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        sources: current.sources.includes(source)
                          ? current.sources.filter((item) => item !== source)
                          : [...current.sources, source],
                      }))
                    }
                  >
                    {source}
                  </button>
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
                <select className="select" value={filters.has_summary === null ? "all" : filters.has_summary ? "yes" : "no"} onChange={(event) => setFilters((current) => ({ ...current, has_summary: event.target.value === "all" ? null : event.target.value === "yes" }))}>
                  <option value="all">摘要不限</option>
                  <option value="yes">已有摘要</option>
                  <option value="no">暂无摘要</option>
                </select>
                <select className="select" value={filters.has_reflection === null ? "all" : filters.has_reflection ? "yes" : "no"} onChange={(event) => setFilters((current) => ({ ...current, has_reflection: event.target.value === "all" ? null : event.target.value === "yes" }))}>
                  <option value="all">心得不限</option>
                  <option value="yes">已有心得</option>
                  <option value="no">暂无心得</option>
                </select>
                <select className="select" value={filters.has_reproduction === null ? "all" : filters.has_reproduction ? "yes" : "no"} onChange={(event) => setFilters((current) => ({ ...current, has_reproduction: event.target.value === "all" ? null : event.target.value === "yes" }))}>
                  <option value="all">复现不限</option>
                  <option value="yes">已有复现</option>
                  <option value="no">暂无复现</option>
                </select>
              </div>
            </div>
          </div>
        ) : null}

        {hasProject && aiPanelOpen ? (
          <div className="search-ai-panel">
            <strong>AI 帮我挑论文</strong>
            <p className="subtle" style={{ margin: 0 }}>
              先输入研究需求，系统会生成预览，你确认后再批量加入项目。
            </p>
            <textarea className="textarea" value={aiNeed} onChange={(event) => setAiNeed(event.target.value)} placeholder="例如：帮我为 LLM Agent 入门与复现整理 100 篇最适合先读的论文，兼顾经典、近期前沿和可复现性。" rows={3} />
            <div className="project-inline-compact">
              <input className="input" type="number" min={20} max={200} value={aiTargetCount} onChange={(event) => setAiTargetCount(Number(event.target.value) || 100)} placeholder="目标篇数" />
              <select className="select" value={aiProfile} onChange={(event) => setAiProfile(event.target.value as "balanced" | "repro_first" | "frontier_first")}>
                <option value="balanced">平衡分层</option>
                <option value="repro_first">复现优先</option>
                <option value="frontier_first">前沿优先</option>
              </select>
              <Button type="button" onClick={() => void onRunAiCuration()} disabled={busy !== ""}>
                {busy === "curate" ? "生成预览中..." : "生成 AI 预览"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <StatusStack items={[...(error ? [{ variant: "error" as const, message: error }] : []), ...warnings.map((message) => ({ variant: "warning" as const, message })), ...(notice ? [{ variant: "success" as const, message: notice }] : [])]} />

      {isAiPreview ? (
        <div className="search-ai-panel">
          <strong>AI 100 篇预览</strong>
          <div className="subtle">
            需求：{activeSavedSearch?.user_need || aiNeed || "未填写"} · 目标篇数 {activeSavedSearch?.target_count || aiTargetCount}
          </div>
          <div className="project-chip-row">
            {AI_BUCKET_OPTIONS.map((bucket) => {
              const count = bucket.key === "all" ? items.length : items.filter((item) => item.selection_bucket === bucket.key).length;
              return (
                <button key={bucket.key} type="button" className={`project-filter-chip${aiPreviewBucket === bucket.key ? " is-active" : ""}`.trim()} onClick={() => setAiPreviewBucket(bucket.key)}>
                  {bucket.label} · {count}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="tool-action-row" style={{ justifyContent: "flex-start" }}>
        <Button type="button" data-testid="project-search-batch-add" onClick={() => void onAddCandidatesToProject(selectedCandidates)} disabled={!projectId || !selectedCandidates.length || busy !== ""}>
          {busy === "add" ? "加入中..." : isAiPreview ? `确认加入已勾选论文 (${selectedCandidates.length})` : `批量加入项目 (${selectedCandidates.length})`}
        </Button>
        <Button className="secondary" type="button" onClick={() => void onBatchTriage("shortlisted")} disabled={!projectId || !activeSavedSearch || !selectedCandidates.length || busy !== ""}>标为待重点阅读</Button>
        <Button className="secondary" type="button" onClick={() => void onBatchTriage("rejected")} disabled={!projectId || !activeSavedSearch || !selectedCandidates.length || busy !== ""}>标为排除</Button>
        <Button className="secondary" type="button" onClick={() => void onBatchTriage("new")} disabled={!projectId || !activeSavedSearch || !selectedCandidates.length || busy !== ""}>清除状态</Button>
        <Button className="secondary" type="button" onClick={() => setSelectedPaperIds(displayedItems.map((item) => item.paper.id))}>全选当前结果</Button>
      </div>

      <div className="search-layout-grid">
        <div className="search-left-rail">
          {hasProject ? (
            <>
              <div className="search-rail-section">
                <div>
                  <strong>已保存搜索</strong>
                  <div className="subtle">把能复用的查询留在项目里，后续可重跑。</div>
                </div>
                <div className="project-inline-compact">
                  <input className="input" value={savedTitle} onChange={(event) => setSavedTitle(event.target.value)} placeholder="保存搜索名称" />
                  <Button type="button" data-testid="save-search-button" onClick={() => void onSaveSearch()} disabled={!query.trim() || busy !== ""}>{busy === "save" ? "保存中..." : "保存搜索"}</Button>
                </div>
                {activeSavedSearch ? (
                  <div className="tool-action-row" style={{ justifyContent: "flex-start" }}>
                    <Button className="secondary" data-testid="update-saved-search-button" type="button" onClick={() => void onUpdateSavedSearch()} disabled={busy !== ""}>覆盖当前搜索</Button>
                    <Button className="secondary" data-testid="delete-saved-search-button" type="button" onClick={() => void onDeleteSavedSearch(activeSavedSearch.id)} disabled={busy !== ""}>删除当前搜索</Button>
                  </div>
                ) : null}
                <div className="project-saved-search-list">
                  {savedSearches.length === 0 ? <EmptyState title="还没有已保存搜索" hint="先跑一次项目搜索，再把值得复用的查询保存下来。" /> : savedSearches.map((item) => (
                    <div key={item.id} className={`search-row-card${activeSavedSearch?.id === item.id ? " is-active" : ""}`.trim()}>
                      <div className="search-row-meta">
                        <strong>{item.title}</strong>
                        <span className="project-filter-chip is-static">{item.sort_mode}</span>
                      </div>
                      <div className="subtle">{item.query}</div>
                      <div className="subtle">{item.last_result_count} 条 · 更新于 {fmt(item.updated_at)}</div>
                      <div className="search-row-actions">
                        <Button className="secondary" type="button" data-testid={`saved-search-${item.id}`} onClick={() => void onOpenSavedSearch(item.id)}>打开</Button>
                        <Button className="secondary" type="button" onClick={() => void onRerunSavedSearch(item.id)} disabled={busy !== ""}>重跑</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="search-rail-section">
                <div>
                  <strong>最近搜索历史</strong>
                  <div className="subtle">保留每次项目搜索运行，方便回看你怎么筛到当前结果。</div>
                </div>
                <div className="project-run-list">
                  {runs.length === 0 ? <EmptyState title="还没有搜索历史" hint="每次项目搜索都会记录在这里。" /> : runs.map((item) => (
                    <div key={item.id} className="search-row-card">
                      <strong>{item.query}</strong>
                      <div className="subtle">{item.result_count} 条 · {fmt(item.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="search-rail-section">
              <div>
                <strong>最近搜索</strong>
                <div className="subtle">独立搜索模式只把最近查询保存在本地。</div>
              </div>
              <div className="project-run-list">
                {localRecent.length === 0 ? <EmptyState title="还没有本地最近搜索" hint="独立搜索模式会把最近查询留在浏览器本地。" /> : localRecent.map((item, index) => (
                  <div key={`${item.query}-${index}`} className="search-row-card">
                    <strong>{item.query}</strong>
                    <div className="subtle">{item.sort_mode} · {fmt(item.updated_at)}</div>
                    <div className="search-row-actions">
                      <Button className="secondary" type="button" onClick={() => onLoadLocalRecent(item)}>载入</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="search-center-stage">
          <div className="search-rail-section">
            <div>
              <strong>候选结果</strong>
              <div className="subtle">{displayedItems.length > 0 ? `当前显示 ${displayedItems.length} 条候选。` : "先运行搜索，或打开一条已保存搜索。"}</div>
            </div>
            <div className="project-search-result-list">
              {displayedItems.length === 0 ? <EmptyState title="还没有候选结果" hint="先运行一次搜索，或打开一条已保存搜索。" /> : displayedItems.map((candidate) => {
                const checked = selectedPaperIds.includes(candidate.paper.id);
                return (
                  <article key={candidate.paper.id} className={`search-row-card${activeCandidate?.paper.id === candidate.paper.id ? " is-active" : ""}`.trim()} data-testid={`search-result-${candidate.paper.id}`}>
                    <div className="search-row-meta">
                      <label className="project-paper-check">
                        <input type="checkbox" checked={checked} onChange={(event) => setSelectedPaperIds((current) => event.target.checked ? [...new Set([...current, candidate.paper.id])] : current.filter((item) => item !== candidate.paper.id))} />
                        <span>{candidate.is_in_project ? "已在项目中" : "勾选加入本批次"}</span>
                      </label>
                      <div className="project-chip-row">
                        {candidate.selected_by_ai && candidate.selection_bucket ? <span className="project-filter-chip is-static">{aiBucketLabel(candidate.selection_bucket)}</span> : null}
                        {candidate.selection_rank ? <span className="project-filter-chip is-static">#{candidate.selection_rank}</span> : null}
                        <span className="project-filter-chip is-static">{triageText(candidate.triage_status)}</span>
                      </div>
                    </div>
                    <strong>{candidate.paper.title_en}</strong>
                    <div className="subtle">{candidate.reason.ranking_reason || candidate.reason.filter_reason}</div>
                    <div className="subtle">{candidate.paper.authors || "作者未知"} · {candidate.paper.year ?? "年份未知"} · 引用 {candidate.paper.citation_count ?? 0}</div>
                    <div className="subtle">{topicScoreLabel(candidate.reason.topic_match_score)} · 摘要 {candidate.summary_count} · 心得 {candidate.reflection_count} · 复现 {candidate.reproduction_count}</div>
                    <div className="project-chip-row">{chips(candidate).map((chip) => <span key={`${candidate.paper.id}-${chip}`} className="project-filter-chip is-static">{chip}</span>)}</div>
                    <div className="search-row-actions">
                      <div className="subtle">主题分 {candidate.reason.topic_match_score.toFixed(2)}</div>
                      <div className="tool-action-row" style={{ justifyContent: "flex-start" }}>
                        <Button className="secondary" type="button" onClick={() => setActivePaperId(candidate.paper.id)}>查看详情</Button>
                        {projectId ? <Button type="button" onClick={() => void onAddCandidatesToProject([candidate])} disabled={busy !== ""}>{candidate.is_in_project ? "已在项目中" : "加入项目"}</Button> : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        <div className="search-right-rail">
          {!activeCandidate ? (
            <div className="search-inspector-card">
              <EmptyState title="选择一篇候选论文" hint="右侧会展示规则解释、AI 推荐理由和单跳引文链。" />
            </div>
          ) : (
            <>
              <div className="search-inspector-card">
                <div className="page-toolbar-row">
                  <div>
                    <h3 className="title" style={{ fontSize: 20 }}>{activeCandidate.paper.title_en}</h3>
                    <p className="subtle" style={{ margin: "6px 0 0" }}>{activeCandidate.paper.authors || "作者未知"} · {activeCandidate.paper.venue || "Venue 未知"} · {activeCandidate.paper.year ?? "年份未知"}</p>
                  </div>
                  <span className="project-stat-chip">排序 #{activeCandidate.rank_position}</span>
                </div>
                <div className="subtle">{activeCandidate.paper.abstract_en || "当前没有摘要。"}</div>
              </div>

              <div className="search-inspector-card">
                <strong>为什么进入结果前排</strong>
                <div className="subtle">{activeCandidate.reason.summary || "系统会展示规则解释。"}</div>
                <div className="subtle">主题分 {activeCandidate.reason.topic_match_score.toFixed(2)} · {activeCandidate.reason.passed_topic_gate ? "已通过高精度主题门槛" : "未通过高精度主题门槛"}</div>
                <div className="subtle">{activeCandidate.reason.ranking_reason || activeCandidate.reason.filter_reason}</div>
                {activeCandidate.reason.matched_terms.length > 0 ? <div className="subtle">命中主题词：{activeCandidate.reason.matched_terms.join("、")}</div> : null}
                <div className="project-chip-row">{chips(activeCandidate).map((chip) => <span key={`inspector-${chip}`} className="project-filter-chip is-static">{chip}</span>)}</div>
              </div>

              <div className="search-inspector-card">
                <strong>AI 推荐理由</strong>
                <div className="subtle">{activeCandidate.ai_reason_text || "默认先展示规则解释；需要时可按需生成 AI 推荐理由。"}</div>
                <div className="tool-action-row" style={{ justifyContent: "flex-start" }}>
                  <Button className="secondary" data-testid="generate-ai-reason-button" type="button" onClick={() => void onGenerateAiReason(activeCandidate)} disabled={!projectId || !activeSavedSearch || !activeCandidate.candidate_id || busy !== ""}>{busy === `ai-${activeCandidate.paper.id}` ? "生成中..." : "生成 AI 推荐理由"}</Button>
                  <Link className="button secondary" to={paperReaderPath(activeCandidate.paper.id, undefined, undefined, projectId)}>打开阅读器</Link>
                  <Button className="secondary" data-testid="load-citation-trail-button" type="button" onClick={() => void onLoadTrail(activeCandidate)} disabled={busy !== ""}>{busy === "trail" ? "加载中..." : "查看单跳引文链"}</Button>
                </div>
              </div>

              <div className="search-inspector-card">
                <div className="page-toolbar-row">
                  <div>
                    <strong>单跳引文链</strong>
                    <div className="subtle">展示参考文献和被引论文各一跳。</div>
                  </div>
                  {projectId ? <Button className="secondary" data-testid="citation-batch-add-button" type="button" onClick={() => void onAddCandidatesToProject(selectedTrailItems)} disabled={!selectedTrailItems.length || busy !== ""}>{busy === "add" ? "加入中..." : `批量加入项目 (${selectedTrailItems.length})`}</Button> : null}
                </div>
                {!trail ? (
                  <div className="subtle">点击“查看单跳引文链”后，这里会展示相关论文。</div>
                ) : (
                  <div className="project-citation-grid">
                    <div className="project-citation-column">
                      <strong>参考文献</strong>
                      <div className="search-citation-list">
                        {trail.references.map((item) => (
                          <div key={`ref-${item.paper.id}`} className="search-citation-item">
                            {projectId ? <label className="project-paper-check"><input type="checkbox" checked={trailSelection.includes(item.paper.id)} onChange={(event) => setTrailSelection((current) => event.target.checked ? [...new Set([...current, item.paper.id])] : current.filter((paperId) => paperId !== item.paper.id))} /><span>勾选加入项目</span></label> : null}
                            <strong>{item.paper.title_en}</strong>
                            <div className="subtle">{item.paper.authors || "作者未知"} · {item.paper.year ?? "年份未知"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="project-citation-column">
                      <strong>被引论文</strong>
                      <div className="search-citation-list">
                        {trail.cited_by.map((item) => (
                          <div key={`cit-${item.paper.id}`} className="search-citation-item">
                            {projectId ? <label className="project-paper-check"><input type="checkbox" checked={trailSelection.includes(item.paper.id)} onChange={(event) => setTrailSelection((current) => event.target.checked ? [...new Set([...current, item.paper.id])] : current.filter((paperId) => paperId !== item.paper.id))} /><span>勾选加入项目</span></label> : null}
                            <strong>{item.paper.title_en}</strong>
                            <div className="subtle">{item.paper.authors || "作者未知"} · {item.paper.year ?? "年份未知"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
