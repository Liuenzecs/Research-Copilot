"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import EmptyState from "@/components/common/EmptyState";
import Loading from "@/components/common/Loading";
import StatusStack from "@/components/common/StatusStack";
import ProjectSearchWorkbench from "@/components/projects/ProjectSearchWorkbench";
import { loadPaperReaderSession, type PaperReaderSession } from "@/lib/paperReaderSession";
import { reproductionStatusLabel, summaryTypeLabel, taskTypeLabel as sharedTaskTypeLabel } from "@/lib/presentation";
import {
  addProjectPaper,
  batchUpdateProjectPaperState,
  createProjectEvidence,
  deleteProjectEvidence,
  draftProjectLiteratureReview,
  ensureProjectSummaries,
  extractProjectEvidence,
  fetchProjectPdfs,
  generateProjectCompareTable,
  getProjectTask,
  getProjectWorkspace,
  insertProjectReviewEvidence,
  listProjectDuplicates,
  mergeProjectDuplicates,
  refreshProjectMetadata,
  reorderProjectEvidence,
  searchPapers,
  streamProjectTask,
  updateProject,
  updateProjectEvidence,
  updateProjectOutput,
} from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { memoryPath, paperReaderPath, projectPath, reflectionsPath, reproductionPath, weeklyReportPath } from "@/lib/routes";
import { usePageTitle } from "@/lib/usePageTitle";
import type {
  AutoSaveState,
  Paper,
  ProjectDuplicateGroup,
  ProjectReviewCitation,
  ProjectActionLaunchResponse,
  ResearchProjectEvidenceItem,
  ResearchProjectLinkedArtifacts,
  ResearchProjectOutput,
  ResearchProjectTask,
  ResearchProjectTaskDetail,
  ResearchProjectTaskEvent,
  ResearchProjectWorkspace,
} from "@/lib/types";

type CompareTableDraft = {
  columns: string[];
  rows: Array<Record<string, string>>;
  instruction: string;
};

type WorkspaceFocusAction = {
  label: string;
  onClick: () => void;
  secondary?: boolean;
};

type WorkspaceFocusSnapshot = {
  label: string;
  value: string;
  detail: string;
  accent: "teal" | "amber" | "rose";
};

type ProjectPaperReadingState = {
  paperId: number;
  paperTitle: string;
  session: PaperReaderSession;
  resumePath: string;
};

type ProjectPaperReadingSection = {
  key: "revisit" | "continue" | "parked";
  title: string;
  hint: string;
  items: ResearchProjectWorkspace["papers"][number][];
};

type ProjectPaperReadingFocus = "all" | ProjectPaperReadingSection["key"];
type ProjectPaperScopeOrigin = "default" | "smart_view" | "reader_focus" | "reader_overview";

type SearchScopeFilter = "all" | "not_in_project" | "in_project";
type DownloadFilter = "all" | "downloaded" | "not_downloaded";

const DEFAULT_COMPARE_COLUMNS = [
  "Paper",
  "Research Question",
  "Method",
  "Dataset / Setting",
  "Metrics",
  "Main Result",
  "Limitations",
  "Reproduction Value",
  "User Note",
];

const PROJECT_PAPER_READING_FOCUS_OPTIONS: Array<{
  key: ProjectPaperReadingFocus;
  label: string;
  hint: string;
}> = [
  {
    key: "all",
    label: "全部接续状态",
    hint: "保留当前智能视图里的全部论文，并按阅读接续优先级组织列表。",
  },
  {
    key: "revisit",
    label: "只看优先回看",
    hint: "只保留有待回看段落的论文，并按待回看段落数和最近保存时间排序。",
  },
  {
    key: "continue",
    label: "只看继续阅读",
    hint: "只保留已有会话但暂时没有待回看段落的论文，并按最近阅读时间排序。",
  },
  {
    key: "parked",
    label: "只看先留在池里",
    hint: "只保留还没有建立本地阅读会话的论文，并沿用项目原始排序。",
  },
];

const EVIDENCE_AUTOSAVE_DELAY = 1200;
const OUTPUT_AUTOSAVE_DELAY = 1500;
const COMPARE_COLUMN_LABELS: Record<string, string> = {
  Paper: "论文",
  "Research Question": "研究问题",
  Method: "方法",
  "Dataset / Setting": "数据集 / 场景",
  Metrics: "指标",
  "Main Result": "主要结果",
  Limitations: "局限",
  "Reproduction Value": "复现价值",
  "User Note": "用户备注",
};

function formatDateTime(value?: string | null) {
  if (!value) return "刚刚";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function timestampValue(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function readerModeLabel(mode: PaperReaderSession["viewMode"]) {
  switch (mode) {
    case "page":
      return "原版页面";
    case "text":
      return "辅助文本";
    case "workspace":
      return "论文工作区";
    default:
      return mode;
  }
}

function projectReaderSectionKey(readerState?: ProjectPaperReadingState | null): ProjectPaperReadingSection["key"] {
  if (readerState?.session.revisitParagraphIds.length) return "revisit";
  if (readerState) return "continue";
  return "parked";
}

function projectReaderDecision(readerState?: ProjectPaperReadingState | null) {
  if (!readerState) {
    return {
      tone: "parked" as const,
      label: "先留在池里",
      actionLabel: "打开高级阅读器",
      summary: "还没有本地阅读会话，可先留在论文池，等需要深读时再进入阅读器。",
    };
  }
  if (readerState.session.revisitParagraphIds.length > 0) {
    return {
      tone: "revisit" as const,
      label: "优先回看",
      actionLabel: "优先回看",
      summary: `待回看 ${readerState.session.revisitParagraphIds.length} 段，建议先回到上次停下的位置继续确认。`,
    };
  }
  return {
    tone: "continue" as const,
    label: "继续阅读",
    actionLabel: "继续阅读",
    summary: "阅读会话已保存，可以直接沿着上次停留位置继续往下读。",
  };
}

function evidenceKindLabel(kind: string) {
  switch (kind) {
    case "claim":
      return "主张";
    case "method":
      return "方法";
    case "result":
      return "结果";
    case "limitation":
      return "局限";
    case "question":
      return "问题";
    default:
      return kind;
  }
}

function taskStatusLabel(status: string) {
  switch (status) {
    case "running":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "archived":
      return "已归档";
    default:
      return status;
  }
}

function projectStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "进行中";
    case "paused":
      return "已暂停";
    case "archived":
      return "已归档";
    default:
      return status;
  }
}

function autosaveLabel(state: AutoSaveState) {
  switch (state) {
    case "dirty":
      return "未保存";
    case "saving":
      return "保存中";
    case "saved":
      return "已保存";
    case "error":
      return "保存失败";
    default:
      return "未修改";
  }
}

function compareColumnLabel(column: string) {
  return COMPARE_COLUMN_LABELS[column] ?? column;
}

function taskTypeLabel(taskType: string) {
  return sharedTaskTypeLabel(taskType);
}

function parseCompareTable(output: ResearchProjectOutput | null | undefined): CompareTableDraft {
  const payload = output?.content_json ?? {};
  const columns = Array.isArray(payload.columns) && payload.columns.length > 0
    ? payload.columns.map((value) => String(value))
    : DEFAULT_COMPARE_COLUMNS;
  const rows = Array.isArray(payload.rows)
    ? payload.rows.map((row) => {
        const nextRow: Record<string, string> = {};
        for (const column of columns) {
          nextRow[column] = row && typeof row === "object" ? String((row as Record<string, unknown>)[column] ?? "") : "";
        }
        return nextRow;
      })
    : [];
  return {
    columns,
    rows,
    instruction: String(payload.instruction ?? ""),
  };
}

function buildComparePayload(draft: CompareTableDraft) {
  return {
    columns: draft.columns,
    rows: draft.rows.map((row) => {
      const normalized: Record<string, string> = {};
      for (const column of draft.columns) {
        normalized[column] = row[column] ?? "";
      }
      return normalized;
    }),
    instruction: draft.instruction,
  };
}

function linkedArtifactSummary(artifact: ResearchProjectLinkedArtifacts) {
  return `摘要 ${artifact.summaries.length} · 心得 ${artifact.reflections.length} · 复现 ${artifact.reproductions.length}`;
}

function defaultEvidenceExcerpt(paper: Paper) {
  const source = (paper.abstract_en || paper.title_en || "").trim();
  if (!source) return "";
  return source.length <= 240 ? source : `${source.slice(0, 240)}...`;
}

function evidenceSourcePath(projectId: number, item: ResearchProjectEvidenceItem) {
  if (!item.paper_id) return null;
  if (item.paragraph_id) return paperReaderPath(item.paper_id, undefined, item.paragraph_id, projectId);
  if (item.summary_id) return paperReaderPath(item.paper_id, item.summary_id, undefined, projectId);
  return paperReaderPath(item.paper_id, undefined, undefined, projectId);
}

function pdfStatusLabel(status: string) {
  switch (status) {
    case "downloaded":
      return "已下载";
    case "remote_pdf":
      return "可远程获取";
    case "landing_page_only":
      return "仅落地页";
    case "missing":
      return "缺失";
    case "error":
      return "检查失败";
    default:
      return status || "未知";
  }
}

function integrityStatusLabel(status: string) {
  switch (status) {
    case "normal":
      return "正常";
    case "updated":
      return "已更新";
    case "warning":
      return "需注意";
    case "retracted":
      return "已撤稿";
    case "error":
      return "刷新失败";
    default:
      return status || "未知";
  }
}

function compareDraftStorageKey(projectId: number) {
  return `research-project:${projectId}:compare-draft`;
}

function reviewDraftStorageKey(projectId: number) {
  return `research-project:${projectId}:review-draft`;
}

function mergeTaskStep(task: ResearchProjectTaskDetail, step: ResearchProjectTaskProgressStep) {
  const nextSteps = [...task.progress_steps];
  const existingIndex = nextSteps.findIndex((item) => item.step_key === step.step_key);
  if (existingIndex >= 0) nextSteps[existingIndex] = step;
  else nextSteps.push(step);
  nextSteps.sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
    return leftTime - rightTime;
  });
  return { ...task, progress_steps: nextSteps };
}

function taskFromRecent(task: ResearchProjectTask): ResearchProjectTaskDetail {
  return { ...task, input_json: {}, output_json: {}, error_log: "" };
}

function projectReaderOrderHint(focus: ProjectPaperReadingFocus) {
  switch (focus) {
    case "revisit":
      return "当前排序：待回看段落数优先，其次按最近保存时间。";
    case "continue":
      return "当前排序：按最近阅读时间排列。";
    case "parked":
      return "当前排序：沿用项目原始排序。";
    case "all":
    default:
      return "当前排序：优先回看 -> 继续阅读 -> 先留在池里。";
  }
}

function projectPaperScopeOriginLabel(origin: ProjectPaperScopeOrigin) {
  switch (origin) {
    case "smart_view":
      return "来自智能视图";
    case "reader_focus":
      return "来自阅读接续聚焦";
    case "reader_overview":
      return "来自状态中心";
    case "default":
    default:
      return "默认范围";
  }
}

function featuredTask(tasks: ResearchProjectTask[]) {
  return tasks.find((task) => task.status === "running") ?? tasks[0] ?? null;
}

function smartViewMatches(
  key: string,
  paper: ResearchProjectWorkspace["papers"][number],
  citedPaperIds: Set<number>,
  duplicatePaperIds: Set<number>,
) {
  switch (key) {
    case "missing_pdf":
      return ["missing", "landing_page_only", "error"].includes(paper.pdf_status);
    case "pending_summary":
      return paper.summary_count === 0;
    case "pending_evidence":
      return paper.evidence_count === 0;
    case "pending_writing_citation":
      return !citedPaperIds.has(paper.paper.id);
    case "high_reproduction_value":
      return ["planned", "in_progress", "blocked"].includes(paper.latest_reproduction_status || "");
    case "reportable":
      return paper.report_worthy_count > 0 || paper.evidence_count > 0;
    case "risky":
      return ["warning", "error", "retracted"].includes(paper.integrity_status);
    case "duplicate_candidates":
      return duplicatePaperIds.has(paper.paper.id);
    case "all_papers":
    default:
      return true;
  }
}

function SortableEvidenceCard({
  projectId,
  item,
  saveState,
  mutating,
  inserting,
  onChange,
  onBlur,
  onDelete,
  onInsert,
}: {
  projectId: number;
  item: ResearchProjectEvidenceItem;
  saveState: AutoSaveState;
  mutating: boolean;
  inserting: boolean;
  onChange: (id: number, patch: Partial<ResearchProjectEvidenceItem>) => void;
  onBlur: (id: number) => void;
  onDelete: (id: number) => void;
  onInsert: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const sourcePath = evidenceSourcePath(projectId, item);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`project-evidence-card${isDragging ? " is-dragging" : ""}`.trim()}
      data-testid={`evidence-card-${item.id}`}
    >
      <div className="project-evidence-head">
        <div className="project-evidence-head-main">
          <button type="button" className="project-drag-handle" aria-label="拖拽排序" {...attributes} {...listeners}>
            ≡
          </button>
          <span className={`project-evidence-kind kind-${item.kind}`.trim()}>{evidenceKindLabel(item.kind)}</span>
          <span className="subtle">{item.paper_title || "未绑定论文"}</span>
        </div>
        <span className={`autosave-chip state-${saveState}`.trim()}>{autosaveLabel(saveState)}</span>
      </div>

      <textarea className="textarea" value={item.excerpt} onChange={(event) => onChange(item.id, { excerpt: event.target.value })} onBlur={() => onBlur(item.id)} />
      <input className="input" value={item.source_label} onChange={(event) => onChange(item.id, { source_label: event.target.value })} onBlur={() => onBlur(item.id)} />
      <textarea className="textarea" value={item.note_text} onChange={(event) => onChange(item.id, { note_text: event.target.value })} onBlur={() => onBlur(item.id)} />

      <div className="project-evidence-controls">
        <div className="subtle">
          sort_order {item.sort_order}
          {item.paragraph_id ? ` · paragraph ${item.paragraph_id}` : ""}
        </div>
        <div className="projects-inline-actions">
          {sourcePath ? (
            <Link className="button secondary" to={sourcePath}>
              回到来源
            </Link>
          ) : null}
          <Button className="secondary" type="button" onClick={() => onInsert(item.id)} disabled={inserting}>
            {inserting ? "插入中..." : "插入综述稿"}
          </Button>
          <Button className="secondary" type="button" onClick={() => onDelete(item.id)} disabled={mutating}>
            {mutating ? "处理中..." : "删除"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectWorkspace({ projectId }: { projectId: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  usePageTitle("项目工作台");

  const searchWorkbenchRef = useRef<HTMLDivElement | null>(null);
  const paperPoolRef = useRef<HTMLDivElement | null>(null);
  const evidenceBoardRef = useRef<HTMLDivElement | null>(null);
  const reviewSectionRef = useRef<HTMLDivElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const fallbackPollRef = useRef<number | null>(null);
  const evidenceTimersRef = useRef<Record<number, number | null>>({});
  const compareTimerRef = useRef<number | null>(null);
  const reviewTimerRef = useRef<number | null>(null);

  const [workspace, setWorkspace] = useState<ResearchProjectWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [titleDraft, setTitleDraft] = useState("");
  const [questionDraft, setQuestionDraft] = useState("");
  const [goalDraft, setGoalDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("active");
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [actionDetailsOpen, setActionDetailsOpen] = useState(false);
  const [activeStage, setActiveStage] = useState<"papers" | "evidence" | "compare" | "review" | "citations">("papers");
  const [savingProject, setSavingProject] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Paper[]>([]);
  const [searchWarnings, setSearchWarnings] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSelection, setSearchSelection] = useState<number[]>([]);
  const [searchScopeFilter, setSearchScopeFilter] = useState<SearchScopeFilter>("all");
  const [downloadFilter, setDownloadFilter] = useState<DownloadFilter>("all");
  const [yearFilter, setYearFilter] = useState("");
  const [addingSearchBatch, setAddingSearchBatch] = useState(false);

  const [selectedPaperIds, setSelectedPaperIds] = useState<number[]>([]);
  const [actionInstruction, setActionInstruction] = useState("");
  const [runningAction, setRunningAction] = useState("");
  const [activeTask, setActiveTask] = useState<ResearchProjectTaskDetail | null>(null);
  const [taskConnectionNotice, setTaskConnectionNotice] = useState("");
  const [activeSmartView, setActiveSmartView] = useState("all_papers");
  const [activeReaderFocus, setActiveReaderFocus] = useState<ProjectPaperReadingFocus>("all");
  const [paperPoolScopeOrigin, setPaperPoolScopeOrigin] = useState<ProjectPaperScopeOrigin>("default");
  const [paperBatchBusy, setPaperBatchBusy] = useState("");
  const [paperBatchReadAt, setPaperBatchReadAt] = useState("");

  const [manualEvidencePaperId, setManualEvidencePaperId] = useState("");
  const [manualEvidenceKind, setManualEvidenceKind] = useState("claim");
  const [manualEvidenceExcerpt, setManualEvidenceExcerpt] = useState("");
  const [manualEvidenceNote, setManualEvidenceNote] = useState("");
  const [manualEvidenceSourceLabel, setManualEvidenceSourceLabel] = useState("手动记录");
  const [creatingEvidence, setCreatingEvidence] = useState(false);
  const [evidenceItems, setEvidenceItems] = useState<ResearchProjectEvidenceItem[]>([]);
  const [evidenceSaveState, setEvidenceSaveState] = useState<Record<number, AutoSaveState>>({});
  const [mutatingEvidenceId, setMutatingEvidenceId] = useState<number | null>(null);

  const [compareDraft, setCompareDraft] = useState<CompareTableDraft>({ columns: DEFAULT_COMPARE_COLUMNS, rows: [], instruction: "" });
  const [compareSaveState, setCompareSaveState] = useState<AutoSaveState>("idle");
  const [reviewDraft, setReviewDraft] = useState("");
  const [reviewSaveState, setReviewSaveState] = useState<AutoSaveState>("idle");
  const [insertingEvidenceIds, setInsertingEvidenceIds] = useState<number[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<ProjectDuplicateGroup[]>([]);
  const [duplicateBusy, setDuplicateBusy] = useState("");

  const workspaceRef = useRef<ResearchProjectWorkspace | null>(workspace);
  const evidenceItemsRef = useRef<ResearchProjectEvidenceItem[]>(evidenceItems);
  const evidenceSaveStateRef = useRef<Record<number, AutoSaveState>>(evidenceSaveState);
  const compareDraftRef = useRef(compareDraft);
  const reviewDraftRef = useRef(reviewDraft);
  const compareSaveStateRef = useRef(compareSaveState);
  const reviewSaveStateRef = useRef(reviewSaveState);
  const workspaceQuery = useQuery({
    queryKey: queryKeys.projects.workspace(projectId),
    queryFn: ({ signal }) => getProjectWorkspace(projectId, { signal }),
    refetchOnMount: "always",
  });

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    evidenceItemsRef.current = evidenceItems;
  }, [evidenceItems]);

  useEffect(() => {
    evidenceSaveStateRef.current = evidenceSaveState;
  }, [evidenceSaveState]);

  useEffect(() => {
    compareDraftRef.current = compareDraft;
  }, [compareDraft]);

  useEffect(() => {
    reviewDraftRef.current = reviewDraft;
  }, [reviewDraft]);

  useEffect(() => {
    compareSaveStateRef.current = compareSaveState;
  }, [compareSaveState]);

  useEffect(() => {
    reviewSaveStateRef.current = reviewSaveState;
  }, [reviewSaveState]);

  const compareOutput = useMemo(
    () => workspace?.outputs.find((item) => item.output_type === "compare_table") ?? null,
    [workspace],
  );
  const reviewOutput = useMemo(
    () => workspace?.outputs.find((item) => item.output_type === "literature_review") ?? null,
    [workspace],
  );
  const projectPaperIds = useMemo(() => new Set((workspace?.papers ?? []).map((item) => item.paper.id)), [workspace]);
  const activePaperIds = useMemo(
    () => (selectedPaperIds.length > 0 ? selectedPaperIds : (workspace?.papers ?? []).map((item) => item.paper.id)),
    [selectedPaperIds, workspace],
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function setEvidenceState(id: number, state: AutoSaveState) {
    evidenceSaveStateRef.current = { ...evidenceSaveStateRef.current, [id]: state };
    setEvidenceSaveState((current) => ({ ...current, [id]: state }));
  }

  function setCompareState(state: AutoSaveState) {
    compareSaveStateRef.current = state;
    setCompareSaveState(state);
  }

  function setReviewState(state: AutoSaveState) {
    reviewSaveStateRef.current = state;
    setReviewSaveState(state);
  }

  function mergeDirtyEvidence(nextWorkspace: ResearchProjectWorkspace) {
    const dirtyIds = new Set(
      Object.entries(evidenceSaveStateRef.current)
        .filter(([, state]) => state === "dirty" || state === "saving" || state === "error")
        .map(([id]) => Number(id)),
    );
    const localById = new Map(evidenceItemsRef.current.map((item) => [item.id, item]));
    const mergedEvidence = nextWorkspace.evidence_items.map((item) => (dirtyIds.has(item.id) ? localById.get(item.id) ?? item : item));
    return { ...nextWorkspace, evidence_items: mergedEvidence };
  }

  function applyWorkspace(nextWorkspace: ResearchProjectWorkspace) {
    const mergedWorkspace = mergeDirtyEvidence(nextWorkspace);
    setWorkspace(mergedWorkspace);
    evidenceItemsRef.current = mergedWorkspace.evidence_items;
    setEvidenceItems(mergedWorkspace.evidence_items);
    setTitleDraft(mergedWorkspace.project.title);
    setQuestionDraft(mergedWorkspace.project.research_question);
    setGoalDraft(mergedWorkspace.project.goal);
    setStatusDraft(mergedWorkspace.project.status);
    setSearchQuery((current) => current || mergedWorkspace.project.seed_query || mergedWorkspace.project.research_question);
    setSelectedPaperIds((current) => {
      const nextIds = mergedWorkspace.papers.map((item) => item.paper.id);
      if (current.length === 0) return nextIds;
      const filtered = current.filter((id) => nextIds.includes(id));
      return filtered.length > 0 ? filtered : nextIds;
    });
    setManualEvidencePaperId((current) => {
      if (current && mergedWorkspace.papers.some((item) => String(item.paper.id) === current)) return current;
      return mergedWorkspace.papers[0] ? String(mergedWorkspace.papers[0].paper.id) : "";
    });
    if (!mergedWorkspace.smart_views.some((item) => item.key === activeSmartView)) {
      setActiveSmartView("all_papers");
    }

    if (typeof window !== "undefined") {
      const compareMirror = window.localStorage.getItem(compareDraftStorageKey(projectId));
      if (compareMirror) {
        try {
          const mirroredDraft = JSON.parse(compareMirror) as CompareTableDraft;
          compareDraftRef.current = mirroredDraft;
          setCompareDraft(mirroredDraft);
          setCompareState("dirty");
        } catch {
          const nextDraft = parseCompareTable(mergedWorkspace.outputs.find((item) => item.output_type === "compare_table") ?? null);
          compareDraftRef.current = nextDraft;
          setCompareDraft(nextDraft);
          setCompareState(mergedWorkspace.outputs.some((item) => item.output_type === "compare_table") ? "saved" : "idle");
        }
      } else {
        const nextDraft = parseCompareTable(mergedWorkspace.outputs.find((item) => item.output_type === "compare_table") ?? null);
        compareDraftRef.current = nextDraft;
        setCompareDraft(nextDraft);
        setCompareState(mergedWorkspace.outputs.some((item) => item.output_type === "compare_table") ? "saved" : "idle");
      }

      const reviewMirror = window.localStorage.getItem(reviewDraftStorageKey(projectId));
      if (reviewMirror !== null) {
        reviewDraftRef.current = reviewMirror;
        setReviewDraft(reviewMirror);
        setReviewState("dirty");
      } else {
        const nextReviewOutput = mergedWorkspace.outputs.find((item) => item.output_type === "literature_review");
        const nextReviewDraft = nextReviewOutput?.content_markdown ?? "";
        reviewDraftRef.current = nextReviewDraft;
        setReviewDraft(nextReviewDraft);
        setReviewState(nextReviewOutput ? "saved" : "idle");
      }
    }
  }

  useEffect(() => {
    if (workspaceQuery.data) {
      setError("");
      setLoading(false);
      applyWorkspace(workspaceQuery.data);
    }
  }, [workspaceQuery.data]);

  useEffect(() => {
    if (workspaceQuery.error) {
      setLoading(false);
      setError((workspaceQuery.error as Error).message || "项目工作台加载失败");
    }
  }, [workspaceQuery.error]);

  async function loadWorkspace(options?: { quiet?: boolean }) {
    if (!options?.quiet) setLoading(true);
    setError("");
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.workspace(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() }),
      ]);
      const nextWorkspace = await queryClient.fetchQuery({
        queryKey: queryKeys.projects.workspace(projectId),
        queryFn: ({ signal }) => getProjectWorkspace(projectId, { signal }),
        staleTime: 0,
      });
      applyWorkspace(nextWorkspace);
    } catch (loadError) {
      setError((loadError as Error).message || "项目工作台加载失败");
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      if (fallbackPollRef.current) window.clearTimeout(fallbackPollRef.current);
      Object.values(evidenceTimersRef.current).forEach((timerId) => {
        if (timerId) window.clearTimeout(timerId);
      });
      if (compareTimerRef.current) window.clearTimeout(compareTimerRef.current);
      if (reviewTimerRef.current) window.clearTimeout(reviewTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!workspace) return;
    const runningTask = workspace.recent_tasks.find((task) => task.status === "running");
    if (!runningTask) return;
    if (activeTask?.id === runningTask.id && activeTask.status === "running") return;

    void (async () => {
      try {
        const detail = await getProjectTask(projectId, runningTask.id);
        attachTaskTracking(detail, true);
      } catch {
        // Ignore restore errors.
      }
    })();
  }, [activeTask, projectId, workspace]);

  useEffect(() => {
    if (activeSmartView !== "duplicate_candidates") return;
    if (duplicateGroups.length > 0) return;
    if ((workspace?.duplicate_summary.group_count ?? 0) === 0) return;
    void loadDuplicateGroups();
  }, [activeSmartView, duplicateGroups.length, workspace?.duplicate_summary.group_count]);

  useEffect(() => {
    const hasPendingChanges =
      Object.values(evidenceSaveState).some((state) => state === "dirty" || state === "saving" || state === "error") ||
      compareSaveState === "dirty" ||
      compareSaveState === "saving" ||
      compareSaveState === "error" ||
      reviewSaveState === "dirty" ||
      reviewSaveState === "saving" ||
      reviewSaveState === "error";

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasPendingChanges) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [compareSaveState, evidenceSaveState, reviewSaveState]);

  function syncWorkspaceEvidence(nextEvidence: ResearchProjectEvidenceItem[]) {
    evidenceItemsRef.current = nextEvidence;
    setWorkspace((current) => (current ? { ...current, evidence_items: nextEvidence } : current));
    setEvidenceItems(nextEvidence);
  }

  function syncWorkspaceOutput(nextOutput: ResearchProjectOutput) {
    setWorkspace((current) => {
      if (!current) return current;
      const exists = current.outputs.some((item) => item.id === nextOutput.id);
      return {
        ...current,
        outputs: exists
          ? current.outputs.map((item) => (item.id === nextOutput.id ? nextOutput : item))
          : [...current.outputs, nextOutput],
      };
    });
  }

  function flushTaskTracking() {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    if (fallbackPollRef.current) {
      window.clearTimeout(fallbackPollRef.current);
      fallbackPollRef.current = null;
    }
  }

  async function fallbackPollTask(taskId: number) {
    flushTaskTracking();

    async function tick() {
      try {
        const detail = await getProjectTask(projectId, taskId);
        setActiveTask(detail);
        if (detail.status === "running") {
          fallbackPollRef.current = window.setTimeout(() => {
            void tick();
          }, 1200);
          return;
        }
        setRunningAction("");
        setTaskConnectionNotice("");
        await loadWorkspace({ quiet: true });
      } catch (pollError) {
        setTaskConnectionNotice((pollError as Error).message || "任务状态恢复失败");
      }
    }

    await tick();
  }

  function handleTaskEvent(event: ResearchProjectTaskEvent) {
    if (event.type === "progress" && event.step) {
      setActiveTask((current) => (current ? mergeTaskStep(current, event.step as ResearchProjectTaskProgressStep) : current));
      return;
    }
    if ((event.type === "task_started" || event.type === "task_completed" || event.type === "task_failed") && event.task) {
      setActiveTask(event.task);
      if (event.type !== "task_started") setRunningAction("");
      return;
    }
    if (event.type === "workspace_refreshed" && event.workspace) {
      applyWorkspace(event.workspace);
      setTaskConnectionNotice("");
    }
  }

  function attachTaskTracking(task: ResearchProjectTaskDetail, preferStream: boolean) {
    flushTaskTracking();
    setActiveTask(task);
    if (task.status !== "running") {
      setRunningAction("");
      return;
    }
    if (!preferStream) {
      void fallbackPollTask(task.id);
      return;
    }

    const controller = new AbortController();
    streamAbortRef.current = controller;
    setTaskConnectionNotice("");

    void streamProjectTask(projectId, task.id, {
      signal: controller.signal,
      onEvent: (event) => handleTaskEvent(event),
    }).catch((streamError) => {
      if (controller.signal.aborted) return;
      setTaskConnectionNotice("实时进度流中断，已回退到轮询恢复状态。");
      void fallbackPollTask(task.id);
      if (import.meta.env.DEV) console.error(streamError);
    });
  }

  async function launchAction(actionKey: string, promise: Promise<ProjectActionLaunchResponse>) {
    setRunningAction(actionKey);
    setError("");
    setNotice("");
    setTaskConnectionNotice("");
    try {
      const launch = await promise;
      setNotice("任务已启动，右侧会实时显示 AI 正在处理的步骤。");
      attachTaskTracking(launch.task, true);
    } catch (actionError) {
      setRunningAction("");
      setError((actionError as Error).message || "项目动作执行失败");
    }
  }

  async function handleSaveProject() {
    setSavingProject(true);
    setError("");
    setNotice("");
    try {
      await updateProject(projectId, {
        title: titleDraft.trim(),
        research_question: questionDraft.trim(),
        goal: goalDraft.trim(),
        status: statusDraft,
      });
      await loadWorkspace({ quiet: true });
      setNotice("项目基本信息已更新。");
    } catch (saveError) {
      setError((saveError as Error).message || "保存项目失败");
    } finally {
      setSavingProject(false);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setError("先输入你想继续收集的关键词或问题。");
      return;
    }
    setSearchLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await searchPapers(searchQuery.trim(), 12);
      const sorted = [...(result.items ?? []).map((item) => item.paper)].sort((left, right) => (right.year ?? 0) - (left.year ?? 0));
      setSearchResults(sorted);
      setSearchWarnings(result.warnings ?? []);
      setSearchSelection([]);
      setNotice(sorted.length > 0 ? `找到 ${sorted.length} 篇候选论文。` : "当前没有可用的搜索结果。");
    } catch (searchError) {
      setError((searchError as Error).message || "项目内搜索失败");
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleAddSearchBatch() {
    if (searchSelection.length === 0) {
      setError("先勾选至少一篇论文再批量加入项目。");
      return;
    }
    setAddingSearchBatch(true);
    setError("");
    setNotice("");
    try {
      await Promise.all(searchSelection.map((paperId) => addProjectPaper(projectId, { paper_id: paperId })));
      await loadWorkspace({ quiet: true });
      setSearchSelection([]);
      setNotice(`已把 ${searchSelection.length} 篇论文加入项目。`);
    } catch (addError) {
      setError((addError as Error).message || "批量加入项目失败");
    } finally {
      setAddingSearchBatch(false);
    }
  }

  async function handleQuickEvidenceFromPaper(paper: Paper) {
    const excerpt = defaultEvidenceExcerpt(paper);
    if (!excerpt) {
      setError("这篇论文目前没有可直接抓取的摘要文本。");
      return;
    }
    setError("");
    try {
      await createProjectEvidence(projectId, {
        paper_id: paper.id,
        kind: "claim",
        excerpt,
        note_text: "",
        source_label: "论文摘要",
      });
      await loadWorkspace({ quiet: true });
      setNotice("已把摘要加入证据板。");
    } catch (createError) {
      setError((createError as Error).message || "加入证据板失败");
    }
  }

  async function handleCreateManualEvidence() {
    if (!manualEvidenceExcerpt.trim()) {
      setError("先填写证据摘录。");
      return;
    }
    setCreatingEvidence(true);
    setError("");
    try {
      await createProjectEvidence(projectId, {
        paper_id: manualEvidencePaperId ? Number(manualEvidencePaperId) : null,
        kind: manualEvidenceKind,
        excerpt: manualEvidenceExcerpt.trim(),
        note_text: manualEvidenceNote.trim(),
        source_label: manualEvidenceSourceLabel.trim(),
      });
      setManualEvidenceExcerpt("");
      setManualEvidenceNote("");
      await loadWorkspace({ quiet: true });
      setNotice("新证据卡已创建。");
    } catch (createError) {
      setError((createError as Error).message || "创建证据卡失败");
    } finally {
      setCreatingEvidence(false);
    }
  }

  async function handleInsertEvidenceIntoReview(evidenceId: number) {
    setInsertingEvidenceIds((current) => [...current, evidenceId]);
    setError("");
    try {
      const output = await insertProjectReviewEvidence(projectId, {
        evidence_ids: [evidenceId],
        placement: "append",
      });
      syncWorkspaceOutput(output);
      reviewDraftRef.current = output.content_markdown ?? "";
      setReviewDraft(reviewDraftRef.current);
      setReviewState("saved");
      if (typeof window !== "undefined") window.localStorage.removeItem(reviewDraftStorageKey(projectId));
      setNotice("证据已插入综述稿。");
    } catch (insertError) {
      setError((insertError as Error).message || "插入综述稿失败");
    } finally {
      setInsertingEvidenceIds((current) => current.filter((id) => id !== evidenceId));
    }
  }

  async function handleBatchPaperStateUpdate(payload: {
    reading_status?: string;
    repro_interest?: string;
    read_at?: string | null;
    clear_read_at?: boolean;
    is_core_paper?: boolean;
    notice: string;
    busyKey: string;
  }) {
    if (!activePaperIds.length) {
      setError("请先在论文池里至少选择一篇论文。");
      return;
    }
    setPaperBatchBusy(payload.busyKey);
    setError("");
    try {
      await batchUpdateProjectPaperState(projectId, {
        paper_ids: activePaperIds,
        reading_status: payload.reading_status,
        repro_interest: payload.repro_interest,
        read_at: payload.read_at ?? null,
        clear_read_at: payload.clear_read_at,
        is_core_paper: payload.is_core_paper,
      });
      await loadWorkspace({ quiet: true });
      setNotice(payload.notice);
    } catch (batchError) {
      setError((batchError as Error).message || "批量更新论文状态失败");
    } finally {
      setPaperBatchBusy("");
    }
  }

  async function loadDuplicateGroups() {
    setDuplicateBusy("loading");
    setError("");
    try {
      const payload = await listProjectDuplicates(projectId);
      setDuplicateGroups(payload.groups);
      if (!payload.groups.length) setNotice("当前项目里没有待处理的重复论文。");
    } catch (duplicateError) {
      setError((duplicateError as Error).message || "重复项面板加载失败");
    } finally {
      setDuplicateBusy("");
    }
  }

  async function handleMergeDuplicateGroup(group: ProjectDuplicateGroup) {
    const canonicalPaper = group.papers[0]?.paper;
    const mergedPaperIds = group.papers.slice(1).map((item) => item.paper.id);
    if (!canonicalPaper || !mergedPaperIds.length) {
      setError("当前重复组至少需要两篇论文才能合并。");
      return;
    }
    setDuplicateBusy(group.key);
    setError("");
    try {
      const payload = await mergeProjectDuplicates(projectId, {
        canonical_paper_id: canonicalPaper.id,
        merged_paper_ids: mergedPaperIds,
      });
      setDuplicateGroups(payload.groups);
      await loadWorkspace({ quiet: true });
      setNotice(`已将重复组软合并到《${canonicalPaper.title_en}》。`);
    } catch (mergeError) {
      setError((mergeError as Error).message || "合并重复论文失败");
    } finally {
      setDuplicateBusy("");
    }
  }

  function queueEvidenceSave(id: number) {
    const previousTimer = evidenceTimersRef.current[id];
    if (previousTimer) window.clearTimeout(previousTimer);
    evidenceTimersRef.current[id] = window.setTimeout(() => {
      void flushEvidenceSave(id);
    }, EVIDENCE_AUTOSAVE_DELAY);
  }

  function updateEvidenceDraft(id: number, patch: Partial<ResearchProjectEvidenceItem>) {
    const nextEvidence = evidenceItemsRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item));
    syncWorkspaceEvidence(nextEvidence);
    setEvidenceState(id, "dirty");
    queueEvidenceSave(id);
  }

  async function flushEvidenceSave(id: number) {
    const timerId = evidenceTimersRef.current[id];
    if (timerId) {
      window.clearTimeout(timerId);
      evidenceTimersRef.current[id] = null;
    }
    const item = evidenceItemsRef.current.find((entry) => entry.id === id);
    if (!item) return;
    const currentState = evidenceSaveStateRef.current[id];
    if (currentState !== "dirty" && currentState !== "error") return;

    setEvidenceState(id, "saving");
    try {
      const saved = await updateProjectEvidence(projectId, id, {
        kind: item.kind,
        excerpt: item.excerpt,
        note_text: item.note_text,
        source_label: item.source_label,
        sort_order: item.sort_order,
      });
      const nextEvidence = evidenceItemsRef.current.map((entry) => (entry.id === id ? saved : entry));
      syncWorkspaceEvidence(nextEvidence);
      setEvidenceState(id, "saved");
    } catch (saveError) {
      setEvidenceState(id, "error");
      setError((saveError as Error).message || "证据卡自动保存失败");
    }
  }

  async function flushAllEvidenceSaves() {
    const pendingIds = Object.entries(evidenceSaveStateRef.current)
      .filter(([, state]) => state === "dirty" || state === "error")
      .map(([id]) => Number(id));
    await Promise.all(pendingIds.map((id) => flushEvidenceSave(id)));
  }

  async function handleDeleteEvidence(id: number) {
    setMutatingEvidenceId(id);
    setError("");
    try {
      const timerId = evidenceTimersRef.current[id];
      if (timerId) {
        window.clearTimeout(timerId);
        evidenceTimersRef.current[id] = null;
      }
      await deleteProjectEvidence(projectId, id);
      const nextEvidence = evidenceItemsRef.current.filter((item) => item.id !== id);
      syncWorkspaceEvidence(nextEvidence);
      const nextSaveState = { ...evidenceSaveStateRef.current };
      delete nextSaveState[id];
      evidenceSaveStateRef.current = nextSaveState;
      setEvidenceSaveState(nextSaveState);
      setNotice("证据卡已删除。");
    } catch (deleteError) {
      setError((deleteError as Error).message || "删除证据卡失败");
    } finally {
      setMutatingEvidenceId(null);
    }
  }

  async function handleEvidenceDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentItems = [...evidenceItemsRef.current].sort((left, right) => left.sort_order - right.sort_order);
    const oldIndex = currentItems.findIndex((item) => item.id === active.id);
    const newIndex = currentItems.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    await flushAllEvidenceSaves();
    const moved = arrayMove(currentItems, oldIndex, newIndex).map((item, index) => ({ ...item, sort_order: index + 1 }));
    syncWorkspaceEvidence(moved);
    try {
      const response = await reorderProjectEvidence(projectId, moved.map((item) => item.id));
      syncWorkspaceEvidence(response.items);
      for (const item of response.items) setEvidenceState(item.id, "saved");
      setNotice("证据板顺序已更新。");
    } catch (reorderError) {
      setError((reorderError as Error).message || "证据板重排失败");
      await loadWorkspace({ quiet: true });
    }
  }

  function persistCompareMirror(nextDraft: CompareTableDraft) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(compareDraftStorageKey(projectId), JSON.stringify(nextDraft));
  }

  function persistReviewMirror(nextDraft: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(reviewDraftStorageKey(projectId), nextDraft);
  }

  function queueCompareSave() {
    if (compareTimerRef.current) window.clearTimeout(compareTimerRef.current);
    compareTimerRef.current = window.setTimeout(() => {
      void flushCompareSave();
    }, OUTPUT_AUTOSAVE_DELAY);
  }

  function queueReviewSave() {
    if (reviewTimerRef.current) window.clearTimeout(reviewTimerRef.current);
    reviewTimerRef.current = window.setTimeout(() => {
      void flushReviewSave();
    }, OUTPUT_AUTOSAVE_DELAY);
  }

  async function flushCompareSave() {
    if (compareTimerRef.current) {
      window.clearTimeout(compareTimerRef.current);
      compareTimerRef.current = null;
    }
    if (!compareOutput) return;
    if (compareSaveStateRef.current !== "dirty" && compareSaveStateRef.current !== "error") return;
    setCompareState("saving");
    try {
      const saved = await updateProjectOutput(projectId, compareOutput.id, {
        content_json: buildComparePayload(compareDraftRef.current),
      });
      syncWorkspaceOutput(saved);
      if (typeof window !== "undefined") window.localStorage.removeItem(compareDraftStorageKey(projectId));
      setCompareState("saved");
    } catch (saveError) {
      setCompareState("error");
      setError((saveError as Error).message || "对比表自动保存失败");
    }
  }

  async function flushReviewSave() {
    if (reviewTimerRef.current) {
      window.clearTimeout(reviewTimerRef.current);
      reviewTimerRef.current = null;
    }
    if (!reviewOutput) return;
    if (reviewSaveStateRef.current !== "dirty" && reviewSaveStateRef.current !== "error") return;
    setReviewState("saving");
    try {
      const saved = await updateProjectOutput(projectId, reviewOutput.id, {
        content_markdown: reviewDraftRef.current,
      });
      syncWorkspaceOutput(saved);
      if (typeof window !== "undefined") window.localStorage.removeItem(reviewDraftStorageKey(projectId));
      setReviewState("saved");
    } catch (saveError) {
      setReviewState("error");
      setError((saveError as Error).message || "综述稿自动保存失败");
    }
  }

  function updateCompareCell(rowIndex: number, column: string, value: string) {
    const nextDraft = {
      ...compareDraftRef.current,
      rows: compareDraftRef.current.rows.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row)),
    };
    compareDraftRef.current = nextDraft;
    setCompareDraft(nextDraft);
    persistCompareMirror(nextDraft);
    setCompareState("dirty");
    queueCompareSave();
  }

  function updateReview(value: string) {
    reviewDraftRef.current = value;
    setReviewDraft(value);
    persistReviewMirror(value);
    setReviewState("dirty");
    queueReviewSave();
  }

  const filteredSearchResults = useMemo(() => {
    return searchResults.filter((paper) => {
      const inProject = projectPaperIds.has(paper.id);
      const downloaded = Boolean(paper.pdf_local_path);
      const yearMatches = yearFilter ? String(paper.year ?? "").includes(yearFilter.trim()) : true;
      if (!yearMatches) return false;
      if (searchScopeFilter === "in_project" && !inProject) return false;
      if (searchScopeFilter === "not_in_project" && inProject) return false;
      if (downloadFilter === "downloaded" && !downloaded) return false;
      if (downloadFilter === "not_downloaded" && downloaded) return false;
      return true;
    });
  }, [downloadFilter, projectPaperIds, searchResults, searchScopeFilter, yearFilter]);

  const activeTaskForPanel = useMemo(() => {
    if (activeTask) return activeTask;
    const task = featuredTask(workspace?.recent_tasks ?? []);
    return task ? taskFromRecent(task) : null;
  }, [activeTask, workspace]);

  const reviewCitations = useMemo(() => {
    const raw = reviewOutput?.content_json?.citations;
    return Array.isArray(raw) ? (raw as ProjectReviewCitation[]) : [];
  }, [reviewOutput]);
  const citedPaperIds = useMemo(() => new Set(reviewCitations.map((item) => Number(item.paper_id)).filter(Boolean)), [reviewCitations]);
  const duplicatePaperIds = useMemo(
    () => new Set(duplicateGroups.flatMap((group) => group.papers.map((item) => item.paper.id))),
    [duplicateGroups],
  );
  const filteredProjectPapers = useMemo(
    () => (workspace?.papers ?? []).filter((item) => smartViewMatches(activeSmartView, item, citedPaperIds, duplicatePaperIds)),
    [activeSmartView, citedPaperIds, duplicatePaperIds, workspace?.papers],
  );
  const readerStateByPaperId = useMemo(() => {
    const next = new Map<number, ProjectPaperReadingState>();
    for (const item of workspace?.papers ?? []) {
      const session = loadPaperReaderSession(item.paper.id);
      if (!session) continue;
      next.set(item.paper.id, {
        paperId: item.paper.id,
        paperTitle: item.paper.title_en,
        session,
        resumePath: paperReaderPath(item.paper.id, undefined, session.paragraphId ?? undefined, projectId),
      });
    }
    return next;
  }, [projectId, workspace?.papers]);
  const unusedEvidenceItems = useMemo(() => {
    const insertedIds = new Set(
      Array.isArray(reviewOutput?.content_json?.inserted_evidence_ids)
        ? (reviewOutput?.content_json?.inserted_evidence_ids as Array<number | string>).map((item) => Number(item)).filter(Boolean)
        : [],
    );
    return evidenceItems.filter((item) => !insertedIds.has(item.id));
  }, [evidenceItems, reviewOutput]);

  if (loading && !workspace) {
    return <Loading text="正在加载项目工作台..." />;
  }

  if (!workspace) {
    return <StatusStack items={error ? [{ variant: "error", message: error }] : []} />;
  }

  const totalPapers = workspace.papers.length;
  const readCount = workspace.papers.filter((item) => Boolean(item.read_at)).length;
  const summarizedCount = workspace.papers.filter((item) => item.summary_count > 0).length;
  const evidenceReadyCount = workspace.papers.filter((item) => item.evidence_count > 0).length;
  const reportableCount = workspace.papers.filter((item) => item.report_worthy_count > 0).length;
  const activeReproductionCount = workspace.papers.filter(
    (item) =>
      item.reproduction_count > 0 ||
      ["planned", "in_progress", "blocked", "completed"].includes(item.latest_reproduction_status || ""),
  ).length;
  const pendingSummaryCount =
    workspace.smart_views.find((item) => item.key === "pending_summary")?.count ?? Math.max(totalPapers - summarizedCount, 0);
  const pendingEvidenceCount =
    workspace.smart_views.find((item) => item.key === "pending_evidence")?.count ?? Math.max(totalPapers - evidenceReadyCount, 0);
  const pendingWritingCount =
    workspace.smart_views.find((item) => item.key === "pending_writing_citation")?.count ?? unusedEvidenceItems.length;
  const missingPdfCount =
    workspace.smart_views.find((item) => item.key === "missing_pdf")?.count ??
    workspace.papers.filter((item) => ["missing", "landing_page_only", "error"].includes(item.pdf_status)).length;
  const riskyCount =
    workspace.smart_views.find((item) => item.key === "risky")?.count ??
    workspace.papers.filter((item) => ["warning", "error", "retracted"].includes(item.integrity_status)).length;
  const readerStates = Array.from(readerStateByPaperId.values());
  const papersWithReaderSession = readerStates.length;
  const papersWithRevisit = readerStates.filter((item) => item.session.revisitParagraphIds.length > 0).length;
  const papersWithContinueOnly = Math.max(papersWithReaderSession - papersWithRevisit, 0);
  const papersWithoutReaderSession = Math.max(totalPapers - papersWithReaderSession, 0);
  const totalRevisitParagraphs = readerStates.reduce((sum, item) => sum + item.session.revisitParagraphIds.length, 0);
  const latestReaderState = readerStates.reduce<ProjectPaperReadingState | null>((latest, current) => {
    if (!latest) return current;
    return timestampValue(current.session.savedAt) > timestampValue(latest.session.savedAt) ? current : latest;
  }, null);
  const readerRevisitCandidates = [...readerStates]
    .filter((item) => item.session.revisitParagraphIds.length > 0)
    .sort((left, right) => {
      const revisitGap = right.session.revisitParagraphIds.length - left.session.revisitParagraphIds.length;
      if (revisitGap !== 0) return revisitGap;
      return timestampValue(right.session.savedAt) - timestampValue(left.session.savedAt);
    })
    .slice(0, 3);
  const activeSmartViewLabel = workspace.smart_views.find((view) => view.key === activeSmartView)?.label || "全部论文";
  const activeReaderFocusMeta =
    PROJECT_PAPER_READING_FOCUS_OPTIONS.find((option) => option.key === activeReaderFocus) ?? PROJECT_PAPER_READING_FOCUS_OPTIONS[0];
  const isDefaultPaperPoolScope = activeSmartView === "all_papers" && activeReaderFocus === "all";
  const effectivePaperPoolScopeOrigin = isDefaultPaperPoolScope ? "default" : paperPoolScopeOrigin;
  const readerFocusCounts: Record<ProjectPaperReadingFocus, number> = {
    all: filteredProjectPapers.length,
    revisit: 0,
    continue: 0,
    parked: 0,
  };
  for (const item of filteredProjectPapers) {
    const sectionKey = projectReaderSectionKey(readerStateByPaperId.get(item.paper.id) ?? null);
    readerFocusCounts[sectionKey] += 1;
  }
  const visibleProjectPapers =
    activeReaderFocus === "all"
      ? filteredProjectPapers
      : filteredProjectPapers.filter(
          (item) => projectReaderSectionKey(readerStateByPaperId.get(item.paper.id) ?? null) === activeReaderFocus,
        );
  const visibleReaderStates = visibleProjectPapers
    .map((item) => readerStateByPaperId.get(item.paper.id) ?? null)
    .filter((item): item is ProjectPaperReadingState => Boolean(item));
  const visibleRevisitCandidates = [...visibleReaderStates]
    .filter((item) => item.session.revisitParagraphIds.length > 0)
    .sort((left, right) => {
      const revisitGap = right.session.revisitParagraphIds.length - left.session.revisitParagraphIds.length;
      if (revisitGap !== 0) return revisitGap;
      return timestampValue(right.session.savedAt) - timestampValue(left.session.savedAt);
    })
    .slice(0, 3);
  const visibleContinueCandidates = [...visibleReaderStates]
    .filter((item) => item.session.revisitParagraphIds.length === 0)
    .sort((left, right) => timestampValue(right.session.savedAt) - timestampValue(left.session.savedAt))
    .slice(0, 2);
  const visiblePendingReaderCount = Math.max(visibleProjectPapers.length - visibleReaderStates.length, 0);
  const visibleRevisitParagraphCount = visibleReaderStates.reduce((sum, item) => sum + item.session.revisitParagraphIds.length, 0);
  const paperPoolScopeBanner = (() => {
    switch (effectivePaperPoolScopeOrigin) {
      case "reader_overview":
        return {
          title: "当前范围来自右侧阅读回流",
          detail: `你刚刚从状态中心回到论文池，系统已经切到“${activeSmartViewLabel} · ${activeReaderFocusMeta.label}”，方便直接处理这一组论文。`,
        };
      case "reader_focus":
        return {
          title: "当前范围来自阅读接续聚焦",
          detail:
            activeSmartView === "all_papers"
              ? `你刚刚把论文池聚焦到“${activeReaderFocusMeta.label}”，当前共 ${visibleProjectPapers.length} 篇。`
              : `你刚刚在“${activeSmartViewLabel}”里聚焦到“${activeReaderFocusMeta.label}”，当前共 ${visibleProjectPapers.length} 篇。`,
        };
      case "smart_view":
        return {
          title: "当前范围来自智能视图切换",
          detail:
            activeReaderFocus === "all"
              ? `你刚刚切到了“${activeSmartViewLabel}”，现在只看这个智能视图里的论文。`
              : `你刚刚切到了“${activeSmartViewLabel}”，并保留“${activeReaderFocusMeta.label}”，当前共 ${visibleProjectPapers.length} 篇。`,
        };
      case "default":
      default:
        return {
          title: "当前在默认论文池范围",
          detail: "这里显示全部论文和全部阅读接续状态，可以从这里重新开始聚焦。",
        };
    }
  })();
  const groupedProjectPaperSections: ProjectPaperReadingSection[] = (() => {
    const revisit: ResearchProjectWorkspace["papers"][number][] = [];
    const continueReading: ResearchProjectWorkspace["papers"][number][] = [];
    const parked: ResearchProjectWorkspace["papers"][number][] = [];

    for (const item of visibleProjectPapers) {
      const readerState = readerStateByPaperId.get(item.paper.id) ?? null;
      if (projectReaderSectionKey(readerState) === "revisit") {
        revisit.push(item);
        continue;
      }
      if (projectReaderSectionKey(readerState) === "continue") {
        continueReading.push(item);
        continue;
      }
      parked.push(item);
    }

    revisit.sort((left, right) => {
      const leftState = readerStateByPaperId.get(left.paper.id);
      const rightState = readerStateByPaperId.get(right.paper.id);
      const revisitGap =
        (rightState?.session.revisitParagraphIds.length ?? 0) - (leftState?.session.revisitParagraphIds.length ?? 0);
      if (revisitGap !== 0) return revisitGap;
      return timestampValue(rightState?.session.savedAt) - timestampValue(leftState?.session.savedAt);
    });
    continueReading.sort((left, right) => {
      const leftState = readerStateByPaperId.get(left.paper.id);
      const rightState = readerStateByPaperId.get(right.paper.id);
      return timestampValue(rightState?.session.savedAt) - timestampValue(leftState?.session.savedAt);
    });
    parked.sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);

    return [
      {
        key: "revisit",
        title: "优先回看",
        hint: "这些论文已经留下待回看段落，优先回到上次停下的位置继续确认。",
        items: revisit,
      },
      {
        key: "continue",
        title: "继续阅读",
        hint: "这些论文已经有阅读会话，可以直接沿着上次停留位置往下读。",
        items: continueReading,
      },
      {
        key: "parked",
        title: "先留在池里",
        hint: "这些论文还没有建立本地阅读会话，可先保留在池里等待后续处理。",
        items: parked,
      },
    ].filter((section) => section.items.length > 0);
  })();

  function scrollToSection(ref: RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function projectPaperIdsForScope(viewKey: string, readerFocus: ProjectPaperReadingFocus) {
    return workspace.papers
      .filter((item) => smartViewMatches(viewKey, item, citedPaperIds, duplicatePaperIds))
      .filter((item) => readerFocus === "all" || projectReaderSectionKey(readerStateByPaperId.get(item.paper.id) ?? null) === readerFocus)
      .map((item) => item.paper.id);
  }

  function activatePaperPoolScope(viewKey: string, readerFocus: ProjectPaperReadingFocus, origin: ProjectPaperScopeOrigin) {
    if (!workspace) return;
    setActiveStage("papers");
    setActiveSmartView(viewKey);
    setActiveReaderFocus(readerFocus);
    setPaperPoolScopeOrigin(viewKey === "all_papers" && readerFocus === "all" ? "default" : origin);
    setSelectedPaperIds(projectPaperIdsForScope(viewKey, readerFocus));
    scrollToSection(paperPoolRef);
  }

  function openStage(stage: "papers" | "evidence" | "compare" | "review" | "citations") {
    setActiveStage(stage);
    if (stage === "papers") {
      window.setTimeout(() => {
        scrollToSection(paperPoolRef);
      }, 80);
    }
  }

  function activateSmartView(viewKey: string) {
    activatePaperPoolScope(viewKey, activeReaderFocus, "smart_view");
  }

  function activateReaderFocus(focus: ProjectPaperReadingFocus) {
    activatePaperPoolScope(activeSmartView, focus, "reader_focus");
  }

  function focusReaderOverviewScope(focus: ProjectPaperReadingFocus) {
    activatePaperPoolScope("all_papers", focus, "reader_overview");
  }

  function clearReaderFocusScope() {
    activatePaperPoolScope(activeSmartView, "all", activeSmartView === "all_papers" ? "default" : "smart_view");
  }

  function clearSmartViewScope() {
    activatePaperPoolScope("all_papers", activeReaderFocus, activeReaderFocus === "all" ? "default" : "reader_focus");
  }

  function resetPaperPoolScope() {
    activatePaperPoolScope("all_papers", "all", "default");
  }

  function launchSummariesAction() {
    void launchAction(
      "summaries",
      ensureProjectSummaries(projectId, {
        paper_ids: activePaperIds,
        instruction: actionInstruction.trim(),
      }),
    );
  }

  function launchEvidenceAction() {
    void launchAction(
      "extract",
      extractProjectEvidence(projectId, {
        paper_ids: activePaperIds,
        instruction: actionInstruction.trim(),
      }),
    );
  }

  function launchReviewAction() {
    void launchAction(
      "review",
      draftProjectLiteratureReview(projectId, {
        paper_ids: activePaperIds,
        instruction: actionInstruction.trim(),
      }),
    );
  }

  function launchPdfAction() {
    void launchAction(
      "pdfs",
      fetchProjectPdfs(projectId, {
        paper_ids: activePaperIds,
        instruction: actionInstruction.trim(),
      }),
    );
  }

  function launchMetadataAction() {
    void launchAction(
      "metadata",
      refreshProjectMetadata(projectId, {
        paper_ids: activePaperIds,
        instruction: actionInstruction.trim(),
      }),
    );
  }

  const focusSnapshots: WorkspaceFocusSnapshot[] = [
    {
      label: "阅读推进",
      value: totalPapers > 0 ? `${readCount}/${totalPapers}` : "0/0",
      detail: `会话 ${papersWithReaderSession} 篇 · 待摘要 ${pendingSummaryCount} 篇`,
      accent: "teal",
    },
    {
      label: "证据沉淀",
      value: `${evidenceItems.length} 张`,
      detail: `待补证据 ${pendingEvidenceCount} 篇 · 待写入 ${unusedEvidenceItems.length} 张`,
      accent: "amber",
    },
    {
      label: "输出成形",
      value: reviewOutput ? `${reviewCitations.length} 条引用` : "待起草",
      detail: `可汇报 ${reportableCount} 篇 · 推荐复现 ${activeReproductionCount} 篇`,
      accent: riskyCount > 0 ? "rose" : "teal",
    },
  ];

  let focusEyebrow = "下一步建议";
  let focusTitle = "先把项目论文池铺开";
  let focusDescription = "你还没有项目论文。先在左侧搜索与收集台加入一批候选论文，后面的摘要、证据和综述才会真正启动起来。";
  let focusActions: WorkspaceFocusAction[] = [
    { label: "去搜索与收集台", onClick: () => scrollToSection(searchWorkbenchRef) },
    { label: "打开项目搜索页", onClick: () => navigate(`/search?project_id=${projectId}`), secondary: true },
  ];

  if (totalPapers > 0 && pendingSummaryCount > 0) {
    focusTitle = "先把摘要补齐，后面会顺很多";
    focusDescription = `还有 ${pendingSummaryCount} 篇论文没有摘要。先补齐摘要，再做证据提取、对比表和心得会更稳。`;
    focusActions = [
      { label: "批量补摘要", onClick: launchSummariesAction },
      { label: "查看待摘要论文", onClick: () => activateSmartView("pending_summary"), secondary: true },
    ];
  } else if (totalPapers > 0 && pendingEvidenceCount > 0) {
    focusTitle = "该把阅读沉淀成证据卡了";
    focusDescription = `还有 ${pendingEvidenceCount} 篇论文没有证据。先提一轮证据，再开始写综述会更顺。`;
    focusActions = [
      { label: "批量提取证据", onClick: launchEvidenceAction },
      { label: "查看待证据论文", onClick: () => activateSmartView("pending_evidence"), secondary: true },
    ];
  } else if (totalPapers > 0 && !reviewOutput) {
    focusEyebrow = "当前最值得推进";
    focusTitle = "可以起草第一版综述了";
    focusDescription = `你已经积累了 ${evidenceItems.length} 张证据卡，适合先起一版可编辑综述稿，把结构搭起来。`;
    focusActions = [
      { label: "起草综述", onClick: launchReviewAction },
      { label: "去证据板", onClick: () => openStage("evidence"), secondary: true },
    ];
  } else if (unusedEvidenceItems.length > 0) {
    focusEyebrow = "写作推进";
    focusTitle = "把现成证据写进稿子";
    focusDescription = `还有 ${unusedEvidenceItems.length} 张证据卡没进入综述稿。先消化这批证据，稿件会更快成形。`;
    focusActions = [
      { label: "查看综述稿", onClick: () => openStage("review") },
      { label: "回到证据板", onClick: () => openStage("evidence"), secondary: true },
    ];
  } else if (riskyCount > 0) {
    focusEyebrow = "收尾检查";
    focusTitle = "写作前做一轮可信度复查";
    focusDescription = `当前有 ${riskyCount} 篇论文带风险提示。先复查这批论文，再继续写作会更安心。`;
    focusActions = [
      { label: "刷新可信度", onClick: launchMetadataAction },
      { label: "查看风险论文", onClick: () => activateSmartView("risky"), secondary: true },
    ];
  } else if (missingPdfCount > 0) {
    focusEyebrow = "深读准备";
    focusTitle = "补齐 PDF，后面深读会更轻松";
    focusDescription = `还有 ${missingPdfCount} 篇论文没有可用 PDF。先补齐一轮，本地阅读、批注和证据提取都会更顺。`;
    focusActions = [
      { label: "批量补全 PDF", onClick: launchPdfAction },
      { label: "查看缺 PDF 论文", onClick: () => activateSmartView("missing_pdf"), secondary: true },
    ];
  } else if (totalPapers > 0) {
    focusEyebrow = "已经成形";
    focusTitle = "这一轮可以整理成汇报输出";
    focusDescription = `当前已有 ${reviewCitations.length} 条引用、${evidenceItems.length} 张证据卡、${pendingWritingCount} 项待写作沉淀，适合开始整理周报或导师汇报。`;
    focusActions = [
      { label: "打开项目周报", onClick: () => navigate(weeklyReportPath(projectId)) },
      { label: "查看综述稿", onClick: () => openStage("review"), secondary: true },
    ];
  }

  return (
    <div className="project-workspace-shell">
      <Card className="project-workspace-hero">
        <div className="project-workspace-title-row">
          <div>
            <div className="projects-kicker">项目工作台</div>
            <h1 className="project-workspace-title">{workspace.project.title}</h1>
            <p className="project-workspace-question">{workspace.project.research_question}</p>
            {workspace.project.goal ? <p className="subtle">目标输出：{workspace.project.goal}</p> : null}
          </div>
          <div className="project-hero-meta">
            <span className={`project-status-badge status-${workspace.project.status}`.trim()}>{projectStatusLabel(workspace.project.status)}</span>
            <span className="reader-chip">论文 {workspace.papers.length}</span>
            <span className="reader-chip">证据 {evidenceItems.length}</span>
            <span className="reader-chip">成果 {workspace.outputs.length}</span>
          </div>
        </div>

        <div className="project-focus-strip">
          <div className="project-focus-main">
            <div className="project-focus-kicker">{focusEyebrow}</div>
            <div className="project-focus-copyblock">
              <h2 className="project-focus-title">{focusTitle}</h2>
              <p className="project-focus-copy">{focusDescription}</p>
            </div>
            <div className="project-focus-actions">
              {focusActions.map((action) => (
                <Button
                  key={action.label}
                  className={action.secondary ? "secondary" : undefined}
                  type="button"
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="project-focus-metrics">
            {focusSnapshots.map((snapshot) => (
              <div key={snapshot.label} className={`project-focus-metric accent-${snapshot.accent}`.trim()}>
                <div className="project-focus-metric-label">{snapshot.label}</div>
                <div className="project-focus-metric-value">{snapshot.value}</div>
                <div className="project-focus-metric-detail">{snapshot.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="project-action-toolbar">
          <div className="page-toolbar-row">
            <div>
              <strong>项目操作台</strong>
              <div className="subtle">默认只保留当前最常用动作；附加要求和次级动作按需展开。</div>
            </div>
            <div className="tool-action-row" style={{ justifyContent: "flex-start" }}>
              <Button className="secondary" type="button" onClick={() => setProjectEditorOpen((current) => !current)}>
                {projectEditorOpen ? "收起编辑项目" : "编辑项目"}
              </Button>
              <Button className="secondary" type="button" onClick={() => navigate(projectPath())}>
                返回项目列表
              </Button>
            </div>
          </div>

          <div className="project-action-toolbar-main">
            <Button className="secondary" type="button" disabled={runningAction !== ""} onClick={launchSummariesAction}>
              {runningAction === "summaries" ? "启动中..." : "补齐摘要"}
            </Button>
            <Button type="button" disabled={runningAction !== ""} data-testid="project-action-extract" onClick={launchEvidenceAction}>
              {runningAction === "extract" ? "启动中..." : "提取证据"}
            </Button>
            <Button className="secondary" type="button" disabled={runningAction !== ""} data-testid="project-action-compare" onClick={() => void launchAction("compare", generateProjectCompareTable(projectId, { paper_ids: activePaperIds, instruction: actionInstruction.trim() }))}>
              {runningAction === "compare" ? "启动中..." : "生成对比表"}
            </Button>
            <Button className="secondary" type="button" disabled={runningAction !== ""} data-testid="project-action-review" onClick={launchReviewAction}>
              {runningAction === "review" ? "启动中..." : "起草综述"}
            </Button>
            <Link className="button secondary" to={`/search?project_id=${projectId}`}>
              搜索论文
            </Link>
            <Button className="secondary" type="button" onClick={() => setActionDetailsOpen((current) => !current)}>
              {actionDetailsOpen ? "收起更多动作" : "更多动作"}
            </Button>
          </div>

          {actionDetailsOpen ? (
            <div className="project-action-toolbar-more">
              <textarea
                className="textarea project-action-input"
                value={actionInstruction}
                onChange={(event) => setActionInstruction(event.target.value)}
                placeholder="这次动作的附加要求，例如：优先比较数据集、指标和局限。"
              />
              <div className="tool-action-row" style={{ justifyContent: "flex-start" }}>
                <Button className="secondary" type="button" disabled={runningAction !== ""} onClick={launchPdfAction}>
                  {runningAction === "pdfs" ? "启动中..." : "补全 PDF"}
                </Button>
                <Button className="secondary" type="button" disabled={runningAction !== ""} onClick={launchMetadataAction}>
                  {runningAction === "metadata" ? "启动中..." : "刷新可信度"}
                </Button>
              </div>
            </div>
          ) : null}

          {activeTaskForPanel ? (
            <div className="project-task-live-banner">
              <strong>{taskTypeLabel(activeTaskForPanel.task_type)}</strong>
              <span className={`project-step-status status-${activeTaskForPanel.status}`.trim()}>{taskStatusLabel(activeTaskForPanel.status)}</span>
              <span className="subtle">更新于 {formatDateTime(activeTaskForPanel.updated_at)}</span>
              {activeTaskForPanel.error_log === "interrupted_by_backend_restart" ? (
                <span className="subtle">任务被后端重启中断，请重新触发。</span>
              ) : null}
              {taskConnectionNotice ? <span className="subtle">{taskConnectionNotice}</span> : null}
            </div>
          ) : null}
        </div>

        {projectEditorOpen ? (
          <div className="project-editor-drawer">
            <label className="projects-field">
              <span>项目标题</span>
              <input className="input" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
            </label>
            <label className="projects-field">
              <span>研究问题</span>
              <textarea className="textarea" value={questionDraft} onChange={(event) => setQuestionDraft(event.target.value)} />
            </label>
            <label className="projects-field">
              <span>目标输出</span>
              <input className="input" value={goalDraft} onChange={(event) => setGoalDraft(event.target.value)} placeholder="例如：产出一版综述稿" />
            </label>
            <label className="projects-field">
              <span>状态</span>
              <select className="select" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>
                <option value="active">进行中</option>
                <option value="paused">暂停</option>
                <option value="archived">已归档</option>
              </select>
            </label>
            <div className="tool-action-row" style={{ justifyContent: "flex-start" }}>
              <Button type="button" onClick={() => void handleSaveProject()} disabled={savingProject}>
                {savingProject ? "保存中..." : "保存项目信息"}
              </Button>
              <Button className="secondary" type="button" onClick={() => setProjectEditorOpen(false)}>
                取消
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <StatusStack
        items={[
          ...(error ? [{ variant: "error" as const, message: error }] : []),
          ...searchWarnings.map((message) => ({ variant: "warning" as const, message })),
          ...(notice ? [{ variant: "success" as const, message: notice }] : []),
          ...(taskConnectionNotice ? [{ variant: "info" as const, message: taskConnectionNotice }] : []),
        ]}
      />

      <div className="project-workspace-grid">
        <div className="project-sidebar-left">
          <div ref={searchWorkbenchRef}>
            <ProjectSearchWorkbench
              projectId={projectId}
              project={workspace.project}
              initialQuery={workspace.project.seed_query || workspace.project.research_question}
              onProjectMutated={() => loadWorkspace({ quiet: true })}
            />
          </div>

          <Card>
            <div ref={paperPoolRef}>
              <div className="projects-section-header">
                <div>
                  <h2 className="title">项目论文池</h2>
                  <p className="subtle" style={{ margin: "6px 0 0" }}>
                    这里是 AI 动作的默认选区，也是一切阅读、复现和证据整理的起点。
                  </p>
                </div>
              </div>

              <div className="project-chip-row" style={{ marginBottom: 12 }}>
                {workspace.smart_views.map((view) => (
                  <button
                    key={view.key}
                    type="button"
                    className={`project-filter-chip${activeSmartView === view.key ? " is-active" : ""}`.trim()}
                    data-testid={`project-smart-view-${view.key}`}
                    onClick={() => activateSmartView(view.key)}
                  >
                    {view.label} {view.count}
                  </button>
                ))}
              </div>

              <div className="project-paper-reader-toolbar">
                <div className="project-paper-reader-toolbar-top">
                  <div>
                    <strong>阅读接续聚焦</strong>
                    <div className="subtle">
                      先用智能视图缩小范围，再按阅读接续状态聚焦，避免切换视图后还要重新扫一遍卡片。
                    </div>
                  </div>
                  <span className="reader-chip" data-testid="project-reading-order-hint">
                    {projectReaderOrderHint(activeReaderFocus)}
                  </span>
                </div>
                <div className="project-chip-row">
                  {PROJECT_PAPER_READING_FOCUS_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`project-filter-chip${activeReaderFocus === option.key ? " is-active" : ""} ${option.key === "all" ? "" : `tone-${option.key}`}`.trim()}
                      data-testid={`project-reading-focus-${option.key}`}
                      onClick={() => activateReaderFocus(option.key)}
                    >
                      {option.label} {readerFocusCounts[option.key]}
                    </button>
                  ))}
                </div>
                <div className="subtle" data-testid="project-reading-focus-summary">
                  当前范围：{activeSmartViewLabel} · {activeReaderFocusMeta.label} · {visibleProjectPapers.length} 篇
                </div>
                <div className="subtle">{activeReaderFocusMeta.hint}</div>
                {!isDefaultPaperPoolScope ? (
                  <div className="project-paper-scope-banner" data-testid="project-paper-scope-banner">
                    <div className="project-paper-scope-banner-top">
                      <div>
                        <strong>{paperPoolScopeBanner.title}</strong>
                        <div className="subtle" data-testid="project-paper-scope-origin">
                          {projectPaperScopeOriginLabel(effectivePaperPoolScopeOrigin)} · {paperPoolScopeBanner.detail}
                        </div>
                      </div>
                      <span className="reader-chip">
                        {activeSmartViewLabel} · {activeReaderFocusMeta.label}
                      </span>
                    </div>
                    <div className="tool-action-row" style={{ justifyContent: "flex-start" }}>
                      {activeReaderFocus !== "all" ? (
                        <Button
                          className="secondary"
                          type="button"
                          data-testid="project-paper-scope-clear-reader-focus"
                          onClick={() => clearReaderFocusScope()}
                        >
                          {activeSmartView === "all_papers" ? "清除接续聚焦" : `保留“${activeSmartViewLabel}”，清除接续聚焦`}
                        </Button>
                      ) : null}
                      {activeSmartView !== "all_papers" ? (
                        <Button
                          className="secondary"
                          type="button"
                          data-testid="project-paper-scope-clear-smart-view"
                          onClick={() => clearSmartViewScope()}
                        >
                          {activeReaderFocus === "all" ? "回到全部论文" : `回到全部论文，保留“${activeReaderFocusMeta.label}”`}
                        </Button>
                      ) : null}
                      <Button
                        className="secondary"
                        type="button"
                        data-testid="project-paper-scope-reset"
                        onClick={() => resetPaperPoolScope()}
                      >
                        回到默认范围
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="projects-inline-actions" style={{ marginBottom: 12 }}>
                <Button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    void handleBatchPaperStateUpdate({
                      reading_status: "deep_read",
                      notice: "已把所选论文标记为精读。",
                      busyKey: "deep-read",
                    })
                  }
                  disabled={paperBatchBusy !== ""}
                >
                  {paperBatchBusy === "deep-read" ? "处理中..." : "标记为精读"}
                </Button>
                <Button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    void handleBatchPaperStateUpdate({
                      repro_interest: "high",
                      notice: "已把所选论文标记为高复现价值。",
                      busyKey: "high-repro",
                    })
                  }
                  disabled={paperBatchBusy !== ""}
                >
                  {paperBatchBusy === "high-repro" ? "处理中..." : "标记高复现价值"}
                </Button>
                <Button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    void handleBatchPaperStateUpdate({
                      is_core_paper: true,
                      notice: "已把所选论文标记为核心论文。",
                      busyKey: "core-paper",
                    })
                  }
                  disabled={paperBatchBusy !== ""}
                >
                  {paperBatchBusy === "core-paper" ? "处理中..." : "标记核心论文"}
                </Button>
                <input
                  className="input"
                  type="date"
                  value={paperBatchReadAt}
                  onChange={(event) => setPaperBatchReadAt(event.target.value)}
                  style={{ maxWidth: 180 }}
                />
                <Button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    void handleBatchPaperStateUpdate({
                      read_at: paperBatchReadAt || null,
                      notice: `已为所选论文设置计入阅读日期${paperBatchReadAt ? `：${paperBatchReadAt}` : ""}。`,
                      busyKey: "read-at",
                    })
                  }
                  disabled={paperBatchBusy !== "" || !paperBatchReadAt}
                >
                  {paperBatchBusy === "read-at" ? "处理中..." : "设置计入阅读日期"}
                </Button>
                <Button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    void handleBatchPaperStateUpdate({
                      clear_read_at: true,
                      notice: "已清空所选论文的计入阅读日期。",
                      busyKey: "clear-read-at",
                    })
                  }
                  disabled={paperBatchBusy !== ""}
                >
                  {paperBatchBusy === "clear-read-at" ? "处理中..." : "清空阅读日期"}
                </Button>
              </div>

              <div className="project-paper-list" data-testid="project-paper-pool">
                {filteredProjectPapers.length === 0 ? (
                  <EmptyState title="当前智能视图里还没有论文" hint="切换智能视图，或先把候选论文加入项目后再继续提取证据和起草综述。" />
                ) : groupedProjectPaperSections.length === 0 ? (
                  <EmptyState
                    title={`当前范围里没有“${activeReaderFocusMeta.label}”论文`}
                    hint="切换阅读接续聚焦，或先进入阅读器建立会话后再回来。"
                  />
                ) : (
                  groupedProjectPaperSections.map((section) => (
                    <div
                      key={section.key}
                      className="project-paper-list-section"
                      data-testid={`project-paper-section-${section.key}`}
                    >
                      <div className="project-paper-list-section-head">
                        <strong>{section.title}</strong>
                        <span className="reader-chip">{section.items.length} 篇</span>
                      </div>
                      <div className="subtle">{section.hint}</div>
                      <div className="project-paper-section-grid">
                        {section.items.map((item) => {
                          const checked = selectedPaperIds.includes(item.paper.id);
                          const readerState = readerStateByPaperId.get(item.paper.id);
                          const readerDecision = projectReaderDecision(readerState);
                          const readerEntryPath = readerState?.resumePath ?? paperReaderPath(item.paper.id, undefined, undefined, projectId);
                          return (
                            <div key={item.id} className="project-paper-card">
                              <div className="project-paper-card-top">
                                <label className="project-paper-check">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => {
                                      setSelectedPaperIds((current) => {
                                        if (event.target.checked) return Array.from(new Set([...current, item.paper.id]));
                                        return current.filter((paperId) => paperId !== item.paper.id);
                                      });
                                    }}
                                  />
                                  <span>用于本次 AI 动作</span>
                                </label>
                                <span className="subtle">排序 {item.sort_order}</span>
                              </div>
                              <strong>{item.paper.title_en}</strong>
                              <div className="subtle">
                                {item.paper.authors || "作者未知"} · {item.paper.year ?? "年份未知"}
                              </div>
                              {item.read_at ? <div className="subtle">已读于 {item.read_at}</div> : null}
                              <div
                                className={`project-paper-reader-panel tone-${readerDecision.tone}`.trim()}
                                data-testid={`project-reader-state-${item.paper.id}`}
                              >
                                <div className="project-paper-reader-top">
                                  <strong>阅读接续</strong>
                                  <span className="reader-chip">{readerDecision.label}</span>
                                </div>
                                <div className="subtle">{readerDecision.summary}</div>
                                {readerState ? (
                                  <>
                                    <div className="reader-chip-row">
                                      <span className="reader-chip">阅读会话已保存</span>
                                      {readerState.session.revisitParagraphIds.length > 0 ? (
                                        <span
                                          className="reader-chip"
                                          style={{ borderColor: "#fdba74", background: "#fff7ed", color: "#c2410c" }}
                                        >
                                          待回看 {readerState.session.revisitParagraphIds.length} 段
                                        </span>
                                      ) : null}
                                      {readerState.session.pageNo ? <span className="reader-chip">停在第 {readerState.session.pageNo} 页</span> : null}
                                    </div>
                                    <div className="subtle">
                                      上次阅读 {formatDateTime(readerState.session.savedAt)} · {readerModeLabel(readerState.session.viewMode)}
                                      {readerState.session.paragraphId ? ` · 记住段落 ${readerState.session.paragraphId}` : ""}
                                    </div>
                                  </>
                                ) : null}
                              </div>
                              <div className="subtle">
                                PDF {pdfStatusLabel(item.pdf_status)} · 摘要 {item.summary_count} · 心得 {item.reflection_count} · 证据 {item.evidence_count}
                              </div>
                              <div className="subtle">
                                复现 {reproductionStatusLabel(item.latest_reproduction_status || "") || (item.reproduction_count > 0 ? "已有记录" : "未开始")}
                              </div>
                              <div className="subtle">
                                可信度 {integrityStatusLabel(item.integrity_status)}
                                {item.integrity_note ? ` · ${item.integrity_note}` : ""}
                              </div>
                              <div className="projects-inline-actions">
                                <Link className="button secondary" data-testid={`project-open-reader-${item.paper.id}`} to={readerEntryPath}>
                                  {readerDecision.actionLabel}
                                </Link>
                                <Button className="secondary" type="button" onClick={() => void handleQuickEvidenceFromPaper(item.paper)}>
                                  加入证据板
                                </Button>
                                <Button className="secondary" type="button" onClick={() => navigate(reproductionPath({ paperId: item.paper.id, projectId }))}>
                                  进入复现工作区
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </div>
        <div className="project-main">
          <Card className="project-stage-card">
            <div className="page-toolbar-row">
              <div>
                <strong>主舞台</strong>
                <div className="subtle">同一时刻只突出一个工作面，避免证据、对比表、综述稿和引用同时抢注意力。</div>
              </div>
            </div>
            <div className="project-stage-tabs">
              {[
                { key: "papers", label: "论文池" },
                { key: "evidence", label: "证据板" },
                { key: "compare", label: "对比表" },
                { key: "review", label: "综述稿" },
                { key: "citations", label: "引用管理" },
              ].map((stage) => (
                <button
                  key={stage.key}
                  type="button"
                  className={`project-stage-tab${activeStage === stage.key ? " is-active" : ""}`.trim()}
                  onClick={() => setActiveStage(stage.key as typeof activeStage)}
                >
                  {stage.label}
                </button>
              ))}
            </div>
          </Card>

          {activeStage === "papers" ? (
            <Card className="project-stage-card">
              <div className="projects-section-header">
                <div>
                  <h2 className="title">论文池主舞台</h2>
                  <p className="subtle" style={{ margin: "6px 0 0" }}>
                    当前论文池与搜索收集台位于左侧。先完成筛选和批量状态调整，再切换到证据、对比表或综述稿。
                  </p>
                </div>
              </div>
              <div className="project-status-grid">
                <div className="project-mini-stat">
                  <strong>已收集论文</strong>
                  <div className="subtle">{workspace.papers.length} 篇</div>
                </div>
                <div className="project-mini-stat">
                  <strong>当前智能视图</strong>
                  <div className="subtle">{activeSmartViewLabel}</div>
                </div>
                <div className="project-mini-stat">
                  <strong>接续聚焦</strong>
                  <div className="subtle">{activeReaderFocusMeta.label}</div>
                </div>
                <div className="project-mini-stat">
                  <strong>当前批量选中</strong>
                  <div className="subtle">{selectedPaperIds.length} 篇</div>
                </div>
                <div className="project-mini-stat">
                  <strong>可继续阅读</strong>
                  <div className="subtle">{visibleReaderStates.length} 篇有本地会话</div>
                </div>
                <div className="project-mini-stat">
                  <strong>优先回看</strong>
                  <div className="subtle">{visibleRevisitCandidates.length} 篇 / {visibleRevisitParagraphCount} 段</div>
                </div>
              </div>
              <div className="tool-action-row" style={{ justifyContent: "flex-start" }}>
                <Button className="secondary" type="button" onClick={() => scrollToSection(searchWorkbenchRef)}>
                  回到搜索与收集台
                </Button>
                <Button className="secondary" type="button" onClick={() => scrollToSection(paperPoolRef)}>
                  查看论文池列表
                </Button>
                <Button className="secondary" type="button" onClick={() => setActiveStage("evidence")}>
                  转到证据板
                </Button>
              </div>
              <div className="project-paper-stage-reader-panel" data-testid="project-paper-stage-reader-panel">
                <div className="project-paper-stage-reader-top">
                  <div>
                    <strong>阅读接续建议</strong>
                    <div className="subtle">
                      先看当前智能视图，再叠加阅读接续聚焦，尽量把“现在该先读哪篇”压缩成一次判断。
                    </div>
                  </div>
                  <span className="reader-chip" data-testid="project-stage-reader-summary">
                    当前范围已保存会话 {visibleReaderStates.length} 篇 · 优先回看 {visibleRevisitCandidates.length} 篇
                  </span>
                </div>
                <div className="subtle">当前范围：{activeSmartViewLabel} · {activeReaderFocusMeta.label}</div>
                {visibleRevisitCandidates.length > 0 ? (
                  <div className="project-reader-return-list">
                    <strong>优先回看候选</strong>
                    {visibleRevisitCandidates.map((state) => (
                      <div
                        key={state.paperId}
                        className="project-reader-return-item tone-revisit"
                        data-testid={`project-stage-reader-candidate-${state.paperId}`}
                      >
                        <div className="project-reader-return-top">
                          <strong>{state.paperTitle}</strong>
                          <span className="reader-chip">优先回看</span>
                        </div>
                        <div className="subtle">
                          待回看 {state.session.revisitParagraphIds.length} 段 · 上次停在第 {state.session.pageNo ?? "?"} 页 · {readerModeLabel(state.session.viewMode)}
                          {state.session.paragraphId ? ` · 段落 ${state.session.paragraphId}` : ""}
                        </div>
                        <Link
                          className="button secondary"
                          data-testid={`project-stage-reader-link-${state.paperId}`}
                          to={state.resumePath}
                        >
                          优先回看
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
                {visibleContinueCandidates.length > 0 ? (
                  <div className="project-reader-return-list">
                    <strong>继续阅读候选</strong>
                    {visibleContinueCandidates.map((state) => (
                      <div
                        key={state.paperId}
                        className="project-reader-return-item tone-continue"
                        data-testid={`project-stage-continue-candidate-${state.paperId}`}
                      >
                        <div className="project-reader-return-top">
                          <strong>{state.paperTitle}</strong>
                          <span className="reader-chip">继续阅读</span>
                        </div>
                        <div className="subtle">
                          上次阅读 {formatDateTime(state.session.savedAt)} · 停在第 {state.session.pageNo ?? "?"} 页 · {readerModeLabel(state.session.viewMode)}
                          {state.session.paragraphId ? ` · 段落 ${state.session.paragraphId}` : ""}
                        </div>
                        <Link className="button secondary" to={state.resumePath}>
                          继续阅读
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
                {visiblePendingReaderCount > 0 ? (
                  <div className="subtle">
                    当前范围另外还有 {visiblePendingReaderCount} 篇还没有本地阅读会话，可先留在论文池待处理，等需要深读时再进入阅读器。
                  </div>
                ) : null}
                {!visibleReaderStates.length && visiblePendingReaderCount === 0 ? (
                  <div className="subtle">当前范围还没有论文可安排阅读接续。</div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {activeStage === "evidence" ? (
          <div ref={evidenceBoardRef} className="project-section-anchor">
            <Card>
            <div className="projects-section-header">
              <div>
                <h2 className="title">证据板</h2>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  支持拖拽排序、自动保存和一键回源。阅读器里选中文字后也能直接丢进这里。
                </p>
              </div>
            </div>

            <div className="project-manual-evidence">
              <select className="select" value={manualEvidencePaperId} onChange={(event) => setManualEvidencePaperId(event.target.value)}>
                <option value="">未绑定具体论文</option>
                {workspace.papers.map((item) => (
                  <option key={item.id} value={item.paper.id}>
                    {item.paper.title_en}
                  </option>
                ))}
              </select>
              <select className="select" value={manualEvidenceKind} onChange={(event) => setManualEvidenceKind(event.target.value)}>
                <option value="claim">主张</option>
                <option value="method">方法</option>
                <option value="result">结果</option>
                <option value="limitation">局限</option>
                <option value="question">问题</option>
              </select>
              <input className="input" value={manualEvidenceSourceLabel} onChange={(event) => setManualEvidenceSourceLabel(event.target.value)} placeholder="来源标签" />
              <textarea className="textarea" value={manualEvidenceExcerpt} onChange={(event) => setManualEvidenceExcerpt(event.target.value)} placeholder="证据摘录" />
              <textarea className="textarea" value={manualEvidenceNote} onChange={(event) => setManualEvidenceNote(event.target.value)} placeholder="备注" />
              <div className="projects-inline-actions">
                <Button type="button" onClick={() => void handleCreateManualEvidence()} disabled={creatingEvidence}>
                  {creatingEvidence ? "创建中..." : "新建证据卡"}
                </Button>
              </div>
            </div>

            {evidenceItems.length === 0 ? (
              <EmptyState title="还没有证据卡" hint="先从论文摘要、阅读器选段或 AI 提取开始。" />
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleEvidenceDragEnd(event)}>
                <SortableContext items={evidenceItems.map((item) => item.id)} strategy={rectSortingStrategy}>
                  <div className="project-evidence-board" data-testid="evidence-board">
                    {evidenceItems
                      .slice()
                      .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
                      .map((item) => (
                        <SortableEvidenceCard
                          key={item.id}
                          projectId={projectId}
                          item={item}
                          saveState={evidenceSaveState[item.id] ?? "idle"}
                          mutating={mutatingEvidenceId === item.id}
                          inserting={insertingEvidenceIds.includes(item.id)}
                          onChange={updateEvidenceDraft}
                          onBlur={(id) => void flushEvidenceSave(id)}
                          onDelete={(id) => void handleDeleteEvidence(id)}
                          onInsert={(id) => void handleInsertEvidenceIntoReview(id)}
                        />
                      ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            </Card>
          </div>
          ) : null}

          {activeStage === "compare" ? (
          <Card>
            <div className="projects-section-header">
              <div>
                <h2 className="title">对比表</h2>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  整表自动保存，刷新后如果还有未落库草稿，会优先从本地镜像恢复。
                </p>
              </div>
              <span className={`autosave-chip state-${compareSaveState}`.trim()} data-testid="compare-autosave-state">
                {autosaveLabel(compareSaveState)}
              </span>
            </div>

            {!compareOutput ? (
              <EmptyState title="还没有对比表" hint="点击上方“生成对比表”后，这里会出现可编辑结果。" />
            ) : (
              <div className="project-table-shell" data-testid="compare-table">
                <table className="project-compare-table">
                  <thead>
                    <tr>
                      {compareDraft.columns.map((column) => (
                        <th key={column}>{compareColumnLabel(column)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compareDraft.rows.map((row, rowIndex) => (
                      <tr key={`compare-row-${rowIndex}`}>
                        {compareDraft.columns.map((column) => (
                          <td key={`${rowIndex}-${column}`}>
                            <textarea
                              className="project-table-cell"
                              value={row[column] ?? ""}
                              onChange={(event) => updateCompareCell(rowIndex, column, event.target.value)}
                              onBlur={() => void flushCompareSave()}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          ) : null}

          {activeStage === "review" ? (
          <div ref={reviewSectionRef} className="project-section-anchor">
            <Card>
            <div className="projects-section-header">
              <div>
                <h2 className="title">综述稿</h2>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  自动保存 markdown 草稿；只要还有未成功落库的修改，刷新前都会给出浏览器提醒。
                </p>
              </div>
              <span className={`autosave-chip state-${reviewSaveState}`.trim()} data-testid="review-autosave-state">
                {autosaveLabel(reviewSaveState)}
              </span>
            </div>

            {!reviewOutput ? (
              <EmptyState title="还没有综述稿" hint="点击上方“起草综述”后，这里会出现可编辑 markdown。" />
            ) : (
              <textarea
                className="textarea project-review-editor"
                data-testid="review-editor"
                value={reviewDraft}
                onChange={(event) => updateReview(event.target.value)}
                onBlur={() => void flushReviewSave()}
              />
            )}
            </Card>
          </div>
          ) : null}

          {activeStage === "citations" ? (
          <Card>
            <div className="projects-section-header">
              <div>
                <h2 className="title">引用管理</h2>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  这里会列出综述稿已使用的引用，以及还没写进稿件的证据卡。
                </p>
              </div>
            </div>

            <div className="project-linked-artifacts">
              {reviewCitations.length === 0 ? (
                <EmptyState title="综述稿还没有引用" hint="从证据卡点击“插入综述稿”后，这里会自动登记引用。" />
              ) : (
                reviewCitations.map((citation, index) => (
                  <div key={`citation-${citation.evidence_id ?? index}`} className="project-linked-card">
                    <strong>{citation.paper_title || `论文 ${citation.paper_id ?? "-"}`}</strong>
                    <div className="subtle">
                      来源 {citation.source_label || "未标注"} · 可信度 {integrityStatusLabel(citation.integrity_status || "")}
                    </div>
                    {citation.paper_id ? (
                      <Link
                        className="button secondary"
                        to={paperReaderPath(citation.paper_id, citation.summary_id ?? undefined, citation.paragraph_id ?? undefined, projectId)}
                      >
                        回到阅读器
                      </Link>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className="projects-section-header" style={{ marginTop: 20 }}>
              <div>
                <h3 className="title" style={{ fontSize: 16 }}>待写入证据</h3>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  这些证据卡还没有进入综述稿。
                </p>
              </div>
            </div>
            <div className="project-linked-artifacts">
              {evidenceItems.length === 0 ? (
                <EmptyState title="还没有证据卡" hint="先从阅读器、摘要或 AI 提取中积累证据，这里才会出现待写入项。" />
              ) : unusedEvidenceItems.length === 0 ? (
                <EmptyState title="当前证据都已进入综述稿" hint="这说明现有证据已完成写作落位；接下来可以继续补新证据或整理稿件结构。" />
              ) : (
                unusedEvidenceItems.slice(0, 8).map((item) => (
                  <div key={`unused-evidence-${item.id}`} className="project-linked-card">
                    <strong>{item.paper_title || "未绑定论文"}</strong>
                    <div className="subtle">{item.excerpt}</div>
                    <Button
                      className="secondary"
                      type="button"
                      onClick={() => void handleInsertEvidenceIntoReview(item.id)}
                      disabled={insertingEvidenceIds.includes(item.id)}
                    >
                      {insertingEvidenceIds.includes(item.id) ? "插入中..." : "插入综述稿"}
                    </Button>
                  </div>
                ))
              )}
            </div>
            </Card>
          ) : null}
        </div>

        <div className="project-sidebar-right">
          <Card>
            <div className="projects-section-header">
              <div>
                <h2 className="title">状态中心</h2>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  用来快速发现缺 PDF、可信度风险、重复项和最近写作引用情况。
                </p>
              </div>
            </div>
            <div className="project-linked-artifacts">
              <div className="project-linked-card" data-testid="project-reader-overview">
                <strong>阅读回流</strong>
                {latestReaderState ? (
                  <>
                    <div className="subtle">
                      已保存会话 {papersWithReaderSession} 篇 · 待回看 {papersWithRevisit} 篇 / {totalRevisitParagraphs} 段
                    </div>
                    <div className="subtle">
                      最近阅读：{latestReaderState.paperTitle} · {formatDateTime(latestReaderState.session.savedAt)}
                    </div>
                    <Link className="button secondary" data-testid="project-continue-latest-reading" to={latestReaderState.resumePath}>
                      继续最近阅读
                    </Link>
                    <div className="project-chip-row" data-testid="project-reader-overview-focus-actions">
                      {papersWithRevisit > 0 ? (
                        <button
                          type="button"
                          className="project-filter-chip tone-revisit"
                          data-testid="project-reader-overview-focus-revisit"
                          onClick={() => focusReaderOverviewScope("revisit")}
                        >
                          回到论文池看优先回看 {papersWithRevisit}
                        </button>
                      ) : null}
                      {papersWithContinueOnly > 0 ? (
                        <button
                          type="button"
                          className="project-filter-chip tone-continue"
                          data-testid="project-reader-overview-focus-continue"
                          onClick={() => focusReaderOverviewScope("continue")}
                        >
                          回到论文池看继续阅读 {papersWithContinueOnly}
                        </button>
                      ) : null}
                      {papersWithoutReaderSession > 0 ? (
                        <button
                          type="button"
                          className="project-filter-chip tone-parked"
                          data-testid="project-reader-overview-focus-parked"
                          onClick={() => focusReaderOverviewScope("parked")}
                        >
                          回到论文池看先留在池里 {papersWithoutReaderSession}
                        </button>
                      ) : null}
                    </div>
                    <div className="subtle">这些入口会把论文池切回“全部论文”并聚焦对应的阅读接续范围。</div>
                    {readerRevisitCandidates.length > 0 ? (
                      <div className="project-reader-return-list" data-testid="project-reader-return-list">
                        <strong>优先回看候选</strong>
                        {readerRevisitCandidates.map((state) => (
                          <div
                            key={state.paperId}
                            className="project-reader-return-item"
                            data-testid={`project-reader-candidate-${state.paperId}`}
                          >
                            <div className="project-reader-return-top">
                              <strong>{state.paperTitle}</strong>
                              <span className="reader-chip">待回看 {state.session.revisitParagraphIds.length} 段</span>
                            </div>
                            <div className="subtle">
                              上次停在第 {state.session.pageNo ?? "?"} 页 · {readerModeLabel(state.session.viewMode)}
                              {state.session.paragraphId ? ` · 段落 ${state.session.paragraphId}` : ""}
                            </div>
                            <Link
                              className="button secondary"
                              data-testid={`project-reader-candidate-link-${state.paperId}`}
                              to={state.resumePath}
                            >
                              优先回看
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="subtle">还没有本地阅读会话；从论文池进入阅读器后，这里会自动出现继续阅读线索。</div>
                )}
              </div>
              <div className="project-linked-card">
                <strong>缺 PDF</strong>
                <div className="subtle">{workspace.smart_views.find((item) => item.key === "missing_pdf")?.count ?? 0} 篇待补全</div>
              </div>
              <div className="project-linked-card">
                <strong>可信度风险</strong>
                <div className="subtle">{workspace.smart_views.find((item) => item.key === "risky")?.count ?? 0} 篇需要复查</div>
              </div>
              <div className="project-linked-card">
                <strong>重复待合并</strong>
                <div className="subtle">{workspace.duplicate_summary.group_count} 组 / {workspace.duplicate_summary.paper_count} 篇</div>
              </div>
              <div className="project-linked-card">
                <strong>写作引用</strong>
                <div className="subtle">已写入 {reviewCitations.length} 条引用</div>
              </div>
            </div>
            <div className="projects-inline-actions">
              <Button className="secondary" type="button" onClick={() => void loadDuplicateGroups()} disabled={duplicateBusy !== ""}>
                {duplicateBusy === "loading" ? "加载中..." : "查看重复项"}
              </Button>
              <Link className="button secondary" to={weeklyReportPath(projectId)}>
                生成本项目周报
              </Link>
            </div>
          </Card>

          <Card>
            <div className="projects-section-header">
              <div>
                <h2 className="title">AI 正在做什么</h2>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  优先展示最近一个活跃任务；流断开后会自动回退到详情轮询。
                </p>
              </div>
            </div>

            {!activeTaskForPanel ? (
              <EmptyState title="暂无项目任务" hint="触发提取证据、生成对比表或起草综述后，这里会出现进度快照。" />
            ) : (
              <div className="project-progress-panel" data-testid="task-progress-panel">
                <div className="project-progress-summary">
                  <strong>{taskTypeLabel(activeTaskForPanel.task_type)}</strong>
                  <span className="subtle">{taskStatusLabel(activeTaskForPanel.status)}</span>
                  <span className="subtle">{formatDateTime(activeTaskForPanel.updated_at)}</span>
                </div>
                {activeTaskForPanel.progress_steps.map((step) => (
                  <div key={`${activeTaskForPanel.id}-${step.step_key}`} className="project-progress-step">
                    <div className="project-progress-step-head">
                      <strong>{step.label}</strong>
                      <span className={`project-step-status status-${step.status}`.trim()}>{taskStatusLabel(step.status)}</span>
                    </div>
                    <div className="subtle">{step.message}</div>
                    {step.related_paper_ids.length > 0 ? <div className="subtle">相关论文：{step.related_paper_ids.join(", ")}</div> : null}
                  </div>
                ))}
                {activeTaskForPanel.error_log ? <div className="subtle">错误：{activeTaskForPanel.error_log}</div> : null}
              </div>
            )}
          </Card>

          <Card>
            <div className="projects-section-header">
              <div>
                <h2 className="title">快捷跳转</h2>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  旧模块保留为项目化深链，都会自动带上当前 project_id。
                </p>
              </div>
            </div>
            <div className="project-quick-links">
              <Link className="button secondary" data-testid="quick-link-search" to={`/search?project_id=${projectId}`}>
                打开搜索页
              </Link>
              <Link className="button secondary" to={weeklyReportPath(projectId)}>
                打开项目周报
              </Link>
              <Link className="button secondary" data-testid="quick-link-reflections" to={reflectionsPath({ projectId })}>
                打开心得页
              </Link>
              <Link className="button secondary" data-testid="quick-link-memory" to={memoryPath(projectId)}>
                打开记忆页
              </Link>
              <Link className="button secondary" data-testid="quick-link-reproduction" to={reproductionPath({ projectId })}>
                打开复现页
              </Link>
            </div>
          </Card>

          <details className="project-side-details">
            <summary>重复项面板</summary>
            <div className="project-side-details-body">
              <div className="subtle">采用软合并，不直接删除原始记录。</div>
              {duplicateGroups.length === 0 ? (
                <EmptyState title="还没有加载重复组" hint="点击状态中心里的“查看重复项”后，这里会列出待合并候选。" />
              ) : (
                <div className="project-linked-artifacts">
                  {duplicateGroups.map((group) => (
                    <div key={group.key} className="project-linked-card">
                      <strong>{group.reason}</strong>
                      <div className="subtle">{group.papers.map((item) => item.paper.title_en).join(" / ")}</div>
                      <div className="subtle">默认保留第一篇为 canonical，其余软合并过去。</div>
                      <Button className="secondary" type="button" onClick={() => void handleMergeDuplicateGroup(group)} disabled={duplicateBusy !== ""}>
                        {duplicateBusy === group.key ? "合并中..." : "执行软合并"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          <details className="project-side-details">
            <summary>历史工作聚合</summary>
            <div className="project-side-details-body">
              <div className="subtle">这里会直接聚合已关联论文既有的摘要、心得和复现记录，不迁移也不丢历史。</div>
              <div className="project-linked-artifacts">
                {workspace.linked_existing_artifacts.length === 0 ? (
                  <EmptyState title="还没有已链接成果" hint="把论文加入项目后，这里会显示它已经积累的历史工作。" />
                ) : (
                  workspace.linked_existing_artifacts.map((artifact) => (
                    <div key={artifact.paper_id} className="project-linked-card">
                      <strong>{artifact.paper_title}</strong>
                      <div className="subtle">{linkedArtifactSummary(artifact)}</div>
                      {artifact.summaries[0] ? <div className="subtle">最新摘要：{summaryTypeLabel(artifact.summaries[0].summary_type)}</div> : null}
                      {artifact.reflections[0] ? <div className="subtle">最新心得：{artifact.reflections[0].report_summary || artifact.reflections[0].stage}</div> : null}
                      {artifact.reproductions[0] ? (
                        <div className="subtle">
                          最新复现：{reproductionStatusLabel(artifact.reproductions[0].status)} · {artifact.reproductions[0].progress_summary || "暂无摘要"}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </details>

          <details className="project-side-details">
            <summary>研究轨迹</summary>
            <div className="project-side-details-body">
              <div className="subtle">帮你回看这个项目是怎么一步步推进到现在的。</div>
              {workspace.activity_timeline_preview.length === 0 ? (
                <EmptyState title="还没有项目轨迹" hint="后续的搜索、加论文、提证据、生成周报等动作都会出现在这里。" />
              ) : (
                <div className="project-linked-artifacts">
                  {workspace.activity_timeline_preview.map((event) => (
                    <div key={event.id} className="project-linked-card">
                      <strong>{event.title}</strong>
                      <div className="subtle">{event.message}</div>
                      <div className="subtle">{formatDateTime(event.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
