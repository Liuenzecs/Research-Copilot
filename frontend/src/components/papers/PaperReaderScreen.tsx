"use client";

import { type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import EmptyState from "@/components/common/EmptyState";
import Loading from "@/components/common/Loading";
import StatusStack from "@/components/common/StatusStack";
import PaperWorkspaceView from "@/components/papers/PaperWorkspace";
import {
  createProjectEvidence,
  createPaperAnnotation,
  downloadPaper,
  getProjectWorkspace,
  getPaperPdfUrl,
  getPaperReader,
  markPaperOpened,
  resolveApiAssetUrl,
  translateSegmentStream,
} from "@/lib/api";
import {
  getDefaultPaperReaderPreferences,
  loadPaperReaderPreferences,
  savePaperReaderPreferences,
  type PaperReaderTextDensity,
  type PaperReaderTextWidth,
} from "@/lib/paperReaderPreferences";
import { formatDateTime } from "@/lib/presentation";
import { loadPaperReaderSession, savePaperReaderSession, type PaperReaderSession } from "@/lib/paperReaderSession";
import { queryKeys } from "@/lib/queryKeys";
import { paperReaderPath, projectPath } from "@/lib/routes";
import { readingStatusLabel, reproInterestLabel } from "@/lib/researchState";
import { usePageTitle } from "@/lib/usePageTitle";
import {
  PaperAnnotation,
  PaperReader,
  PaperReaderFigure,
  PaperReaderPagePreview,
  PaperReaderParagraph,
  ResearchProjectListItem,
  ResearchProjectWorkspace,
  TranslationResult,
} from "@/lib/types";

type ReaderMode = "page" | "text" | "workspace";

type SelectionContext = {
  text: string;
  paragraphId: number;
  top: number;
  left: number;
};

type QuoteContext = {
  text: string;
  paragraphId: number;
};

type FocusParagraphOptions = {
  behavior?: ScrollBehavior;
  updateUrl?: boolean;
  switchToText?: boolean;
  recentActionMessage?: string;
  recentActionKind?: ReaderRecentAction["kind"];
};

type GoToPageOptions = {
  behavior?: ScrollBehavior;
  switchMode?: ReaderMode;
  recentActionMessage?: string;
  recentActionKind?: ReaderRecentAction["kind"];
  recentActionParagraphId?: number | null;
};

type LightboxState = {
  src: string;
  title: string;
  caption?: string;
};

type ParagraphStatusBadge = {
  key: string;
  label: string;
  tone: "focus" | "info" | "success";
};

type ReaderRecentAction = {
  kind: "resume" | "translate" | "annotate" | "evidence" | "locate";
  message: string;
  paragraphId?: number | null;
};

type AnnotationWorkbenchItem = {
  annotation: PaperAnnotation;
  paragraph: PaperReaderParagraph | null;
  evidenceLinked: boolean;
  revisitMarked: boolean;
  currentPage: boolean;
  currentFocus: boolean;
  status: "pending" | "resolved";
  followUpHint: string;
};

type FigureFlowItem = {
  figure: PaperReaderFigure;
  anchorParagraph: PaperReaderParagraph | null;
  currentPage: boolean;
  scanHint: string;
};

type PagePreviewStripItem =
  | {
      kind: "page";
      page: PaperReaderPagePreview;
    }
  | {
      kind: "gap";
      key: string;
      skippedCount: number;
    };

const ZOOM_OPTIONS = [100, 115, 130, 150];
const PAGE_PREVIEW_WINDOW_THRESHOLD = 10;
const PAGE_PREVIEW_WINDOW_RADIUS = 2;
const FIGURE_FLOW_VISIBLE_LIMIT = 6;
const FIGURE_SHORTCUT_VISIBLE_LIMIT = 8;

function normalizeZoomPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !ZOOM_OPTIONS.includes(value)) {
    return ZOOM_OPTIONS[0];
  }
  return value;
}

function readerModeLabel(mode: ReaderMode) {
  if (mode === "page") return "原版页面";
  if (mode === "text") return "辅助文本";
  return "论文工作区";
}

function readerModeDescription(mode: ReaderMode) {
  if (mode === "page") return "适合看原始版式、公式、图表和整页排版关系。";
  if (mode === "text") return "适合选词翻译、写批注、搜索定位和提取证据。";
  return "适合沉淀摘要、心得、任务和论文工作记录。";
}

function describeReaderSession(session: Pick<PaperReaderSession, "viewMode" | "pageNo" | "paragraphId">) {
  const parts = [readerModeLabel(session.viewMode)];
  if (session.pageNo) {
    parts.push(`第 ${session.pageNo} 页`);
  }
  if (session.paragraphId) {
    parts.push(`段落 #${session.paragraphId}`);
  }
  return parts.join(" · ");
}

function isEditableShortcutTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  return ["INPUT", "TEXTAREA", "SELECT", "OPTION"].includes(element.tagName) || element.isContentEditable;
}

function isReaderInteractiveTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  return Boolean(element.closest("button, a, input, textarea, select, option, [role='button']")) || element.isContentEditable;
}

function compactTextPreview(value: string, maxLength = 96) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function compareReaderFigures(left: PaperReaderFigure, right: PaperReaderFigure) {
  if (left.page_no !== right.page_no) {
    return left.page_no - right.page_no;
  }
  return left.figure_id - right.figure_id;
}

function resolveSelectionToolbarPosition(rect: Pick<DOMRect, "bottom" | "left">, hasProjectContext: boolean) {
  const toolbarHeight = hasProjectContext ? 112 : 64;
  const toolbarWidth = hasProjectContext ? 420 : 280;
  const preferredTop = rect.bottom + 8;
  return {
    top: Math.max(Math.min(preferredTop, window.innerHeight - toolbarHeight), 16),
    left: Math.max(Math.min(rect.left, window.innerWidth - toolbarWidth), 16),
  };
}

function buildPagePreviewStripItems(pages: PaperReaderPagePreview[], currentPageNo: number): PagePreviewStripItem[] {
  const orderedPages = [...pages].sort((left, right) => left.page_no - right.page_no);
  if (orderedPages.length <= PAGE_PREVIEW_WINDOW_THRESHOLD) {
    return orderedPages.map((page) => ({ kind: "page", page }));
  }

  const currentIndex = Math.max(0, orderedPages.findIndex((page) => page.page_no === currentPageNo));
  const visibleIndices = new Set<number>([0, orderedPages.length - 1]);
  for (let offset = -PAGE_PREVIEW_WINDOW_RADIUS; offset <= PAGE_PREVIEW_WINDOW_RADIUS; offset += 1) {
    const nextIndex = currentIndex + offset;
    if (nextIndex >= 0 && nextIndex < orderedPages.length) {
      visibleIndices.add(nextIndex);
    }
  }

  const sortedVisibleIndices = Array.from(visibleIndices).sort((left, right) => left - right);
  const items: PagePreviewStripItem[] = [];
  sortedVisibleIndices.forEach((index, position) => {
    if (position > 0) {
      const previousIndex = sortedVisibleIndices[position - 1];
      const skippedCount = index - previousIndex - 1;
      if (skippedCount > 0) {
        items.push({
          kind: "gap",
          key: `page-gap-${previousIndex}-${index}`,
          skippedCount,
        });
      }
    }
    items.push({ kind: "page", page: orderedPages[index] });
  });
  return items;
}

function FigureCard({
  figure,
  onOpen,
}: {
  figure: PaperReaderFigure;
  onOpen: (figure: PaperReaderFigure) => void;
}) {
  return (
    <div className="reader-figure-card">
      <button type="button" className="reader-figure-image-button" onClick={() => onOpen(figure)}>
        <img
          src={resolveApiAssetUrl(figure.image_url)}
          alt={figure.caption_text || `第 ${figure.page_no} 页图像 ${figure.figure_id}`}
          className="reader-figure-image"
          loading="lazy"
          decoding="async"
        />
      </button>
      <div className="reader-figure-meta">
        <strong>图像 · 第 {figure.page_no} 页</strong>
        {figure.caption_text ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{figure.caption_text}</div>
        ) : (
          <div className="subtle">当前图像暂无可提取 caption。</div>
        )}
        {figure.match_mode === "approximate" ? (
          <div className="subtle">当前图像按页内近似定位，建议结合原版页面一起查看。</div>
        ) : null}
      </div>
    </div>
  );
}

function renderParagraph(
  paragraph: PaperReaderParagraph,
  className: string,
  statusBadges: ParagraphStatusBadge[],
  refCallback: (element: HTMLDivElement | null) => void,
  onClick: () => void,
) {
  const paragraphDataProps = {
    "data-page-no": paragraph.page_no,
    "data-paragraph-id": paragraph.paragraph_id,
    "data-testid": `reader-paragraph-${paragraph.paragraph_id}`,
  };
  const meta =
    statusBadges.length > 0 ? (
      <div className="reader-text-block-meta">
        <span className="reader-text-block-anchor">
          p.{paragraph.page_no} · 段落 #{paragraph.paragraph_id}
        </span>
        <div className="reader-status-row">
          {statusBadges.map((badge) => (
            <span key={badge.key} className={`reader-status-badge tone-${badge.tone}`}>
              {badge.label}
            </span>
          ))}
        </div>
      </div>
    ) : null;

  if (paragraph.kind === "heading") {
    return (
      <div key={paragraph.paragraph_id} ref={refCallback} {...paragraphDataProps} className={className} onClick={onClick}>
        {meta}
        <h3 className="reader-text-heading">{paragraph.text}</h3>
      </div>
    );
  }

  if (paragraph.kind === "formula") {
    return (
      <div key={paragraph.paragraph_id} ref={refCallback} {...paragraphDataProps} className={className} onClick={onClick}>
        {meta}
        <div className="reader-text-formula-label">公式区</div>
        <pre className="reader-text-formula">{paragraph.text}</pre>
        <div className="subtle">公式与复杂排版请以原版页面为准。</div>
      </div>
    );
  }

  if (paragraph.kind === "caption") {
    return (
      <div key={paragraph.paragraph_id} ref={refCallback} {...paragraphDataProps} className={className} onClick={onClick}>
        {meta}
        <p className="reader-text-caption">{paragraph.text}</p>
      </div>
    );
  }

  return (
    <div
      key={paragraph.paragraph_id}
      ref={refCallback}
      {...paragraphDataProps}
      className={className}
      onClick={onClick}
    >
      {meta}
      <p className="reader-text-body">{paragraph.text}</p>
    </div>
  );
}

export default function PaperReaderScreen({
  paperId,
  requestedSummaryId = null,
  requestedParagraphId = null,
  projectId = null,
}: {
  paperId: number;
  requestedSummaryId?: number | null;
  requestedParagraphId?: number | null;
  projectId?: number | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  usePageTitle("论文阅读器");
  const bootSession = useMemo(() => loadPaperReaderSession(paperId), [paperId]);
  const bootPreferences = useMemo(
    () => loadPaperReaderPreferences() ?? getDefaultPaperReaderPreferences(),
    [],
  );

  const articleRef = useRef<HTMLDivElement | null>(null);
  const annotationPanelRef = useRef<HTMLDivElement | null>(null);
  const annotationTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const locatorInputRef = useRef<HTMLInputElement | null>(null);
  const readerShellRef = useRef<HTMLDivElement | null>(null);
  const paragraphRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const initialTargetAppliedRef = useRef(false);
  const restoredSessionRef = useRef<PaperReaderSession | null>(bootSession);
  const pendingFocusRef = useRef<{ paragraphId: number; behavior: ScrollBehavior } | null>(null);
  const sessionAppliedRef = useRef(false);
  const keyboardFocusReadyRef = useRef(false);

  const [reader, setReader] = useState<PaperReader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewMode, setViewMode] = useState<ReaderMode>(requestedParagraphId ? "text" : bootSession?.viewMode ?? "page");
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [pinnedQuote, setPinnedQuote] = useState<QuoteContext | null>(null);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [streamingTranslationText, setStreamingTranslationText] = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [figurePanelOpen, setFigurePanelOpen] = useState(false);
  const [currentPageNo, setCurrentPageNo] = useState<number | null>(bootSession?.pageNo ?? null);
  const [activeParagraphId, setActiveParagraphId] = useState<number | null>(requestedParagraphId ?? bootSession?.paragraphId ?? null);
  const [locatorQuery, setLocatorQuery] = useState("");
  const [locatorError, setLocatorError] = useState("");
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [projectEvidenceSaving, setProjectEvidenceSaving] = useState(false);
  const [translationDrawerOpen, setTranslationDrawerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [zoomPercent, setZoomPercent] = useState(normalizeZoomPercent(bootSession?.zoomPercent));
  const [textWidthPreference, setTextWidthPreference] = useState<PaperReaderTextWidth>(bootPreferences.textWidth);
  const [textDensityPreference, setTextDensityPreference] = useState<PaperReaderTextDensity>(bootPreferences.textDensity);
  const [restoredSession, setRestoredSession] = useState<PaperReaderSession | null>(null);
  const [recentAction, setRecentAction] = useState<ReaderRecentAction | null>(null);
  const [translatedParagraphIds, setTranslatedParagraphIds] = useState<number[]>([]);
  const [projectEvidenceParagraphIds, setProjectEvidenceParagraphIds] = useState<number[]>([]);
  const [revisitParagraphIds, setRevisitParagraphIds] = useState<number[]>(bootSession?.revisitParagraphIds ?? []);
  const [sessionReady, setSessionReady] = useState(false);
  const readerQuery = useQuery({
    queryKey: queryKeys.papers.reader(paperId),
    queryFn: ({ signal }) => getPaperReader(paperId, { signal }),
  });
  const projectWorkspaceQuery = useQuery({
    queryKey: queryKeys.projects.workspace(projectId ?? -1),
    queryFn: ({ signal }) => getProjectWorkspace(projectId as number, { signal }),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const loadReader = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await queryClient.fetchQuery({
        queryKey: queryKeys.papers.reader(paperId),
        queryFn: ({ signal }) => getPaperReader(paperId, { signal }),
      });
      setReader(payload);
    } catch (loadError) {
      setError((loadError as Error).message || "论文阅读页加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [paperId, queryClient]);

  useEffect(() => {
    restoredSessionRef.current = bootSession;
    initialTargetAppliedRef.current = false;
    sessionAppliedRef.current = false;
    setCurrentPageNo(bootSession?.pageNo ?? null);
    setActiveParagraphId(requestedParagraphId ?? bootSession?.paragraphId ?? null);
    setViewMode(requestedParagraphId ? "text" : bootSession?.viewMode ?? "page");
    setZoomPercent(normalizeZoomPercent(bootSession?.zoomPercent));
    setNotice("");
    setSelection(null);
    setPinnedQuote(null);
    setTranslation(null);
    setStreamingTranslationText("");
    setTranslationError("");
    setFigurePanelOpen(false);
    setLocatorQuery("");
    setLocatorError("");
    setAnnotationDraft("");
    setTranslationDrawerOpen(false);
    setLightbox(null);
    setRestoredSession(null);
    setRecentAction(null);
    setTranslatedParagraphIds([]);
    setProjectEvidenceParagraphIds([]);
    setRevisitParagraphIds(bootSession?.revisitParagraphIds ?? []);
    setSessionReady(false);
    keyboardFocusReadyRef.current = false;
  }, [bootSession, paperId]);

  useEffect(() => {
    if (readerQuery.data) {
      setError("");
      setLoading(false);
      setReader(readerQuery.data);
    }
  }, [readerQuery.data]);

  useEffect(() => {
    if (readerQuery.error) {
      setLoading(false);
      setError((readerQuery.error as Error).message || "论文阅读页加载失败，请稍后重试。");
    }
  }, [readerQuery.error]);

  useEffect(() => {
    let cancelled = false;
    void markPaperOpened(paperId)
      .then((payload) => {
        if (cancelled) return;
        queryClient.setQueryData<PaperReader | null>(queryKeys.papers.reader(paperId), (current) =>
          current && current.paper.id === paperId
            ? {
                ...current,
                research_state: {
                  ...current.research_state,
                  last_opened_at: payload.last_opened_at ?? current.research_state.last_opened_at ?? null,
                },
              }
            : current,
        );
      })
      .catch(() => {
        // Ignore touch failures in the reader shell.
      });
    return () => {
      cancelled = true;
    };
  }, [paperId, queryClient]);

  const pageNumbers = useMemo(() => {
    const source = reader?.pages.length
      ? reader.pages.map((page) => page.page_no)
      : (reader?.paragraphs ?? []).map((paragraph) => paragraph.page_no);
    return Array.from(new Set(source)).sort((left, right) => left - right);
  }, [reader]);

  const paragraphMap = useMemo(() => {
    const map = new Map<number, PaperReaderParagraph>();
    (reader?.paragraphs ?? []).forEach((paragraph) => map.set(paragraph.paragraph_id, paragraph));
    return map;
  }, [reader]);

  const paragraphsByPage = useMemo(() => {
    const map = new Map<number, PaperReaderParagraph[]>();
    (reader?.paragraphs ?? []).forEach((paragraph) => {
      const current = map.get(paragraph.page_no) ?? [];
      current.push(paragraph);
      map.set(paragraph.page_no, current);
    });
    return map;
  }, [reader]);

  const pageIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    pageNumbers.forEach((pageNo, index) => map.set(pageNo, index));
    return map;
  }, [pageNumbers]);
  const orderedFigures = useMemo(() => [...(reader?.figures ?? [])].sort(compareReaderFigures), [reader?.figures]);

  useEffect(() => {
    if (!reader) return;

    if (!initialTargetAppliedRef.current) {
      initialTargetAppliedRef.current = true;
      if (requestedParagraphId) {
        const target = paragraphMap.get(requestedParagraphId);
        sessionAppliedRef.current = true;
        if (target) {
          setViewMode("text");
          setCurrentPageNo(target.page_no);
          setActiveParagraphId(target.paragraph_id);
          pendingFocusRef.current = { paragraphId: target.paragraph_id, behavior: "auto" };
          setNotice("已定位到指定段落，当前已切到辅助文本模式。");
          setRecentAction({
            kind: "locate",
            message: `已定位到第 ${target.page_no} 页的指定段落。`,
            paragraphId: target.paragraph_id,
          });
          setSessionReady(true);
          return;
        }
      }
    }

    if (!sessionAppliedRef.current) {
      sessionAppliedRef.current = true;
      const session = restoredSessionRef.current;
      if (session) {
        setViewMode(session.viewMode);
        setZoomPercent(normalizeZoomPercent(session.zoomPercent));

        const restoredParagraph = session.paragraphId ? paragraphMap.get(session.paragraphId) ?? null : null;
        if (restoredParagraph) {
          setCurrentPageNo(restoredParagraph.page_no);
          setActiveParagraphId(restoredParagraph.paragraph_id);
          if (session.viewMode === "text") {
            pendingFocusRef.current = { paragraphId: restoredParagraph.paragraph_id, behavior: "auto" };
          }
          setRestoredSession(session);
          setNotice(`已恢复上次阅读：${describeReaderSession(session)}。`);
          setRecentAction({
            kind: "resume",
            message: `已恢复上次阅读：${describeReaderSession(session)}`,
            paragraphId: restoredParagraph.paragraph_id,
          });
          setSessionReady(true);
          return;
        }

        if (session.pageNo && pageIndexMap.has(session.pageNo)) {
          const fallbackParagraph = (paragraphsByPage.get(session.pageNo) ?? [])[0] ?? null;
          setCurrentPageNo(session.pageNo);
          setActiveParagraphId(fallbackParagraph?.paragraph_id ?? null);
          if (session.viewMode === "text" && fallbackParagraph) {
            pendingFocusRef.current = { paragraphId: fallbackParagraph.paragraph_id, behavior: "auto" };
          }
          setRestoredSession(session);
          setNotice(`已恢复上次阅读：${describeReaderSession(session)}。`);
          setRecentAction({
            kind: "resume",
            message: `已恢复上次阅读：${describeReaderSession(session)}`,
            paragraphId: fallbackParagraph?.paragraph_id ?? null,
          });
          setSessionReady(true);
          return;
        }
      }
    }

    const firstPage = pageNumbers[0] ?? 1;
    setCurrentPageNo((previous) => (previous && pageIndexMap.has(previous) ? previous : firstPage));
    setSessionReady(true);
  }, [pageIndexMap, pageNumbers, paragraphMap, paragraphsByPage, reader, requestedParagraphId]);

  const effectivePageNo = currentPageNo ?? pageNumbers[0] ?? 1;
  const currentPagePreview = (reader?.pages ?? []).find((page) => page.page_no === effectivePageNo) ?? null;
  const currentPageParagraphs = paragraphsByPage.get(effectivePageNo) ?? [];
  const currentPageParagraphIdSet = useMemo(
    () => new Set(currentPageParagraphs.map((paragraph) => paragraph.paragraph_id)),
    [currentPageParagraphs],
  );
  const currentPageFigures = (reader?.figures ?? []).filter((figure) => figure.page_no === effectivePageNo);
  const currentPageAnnotations = (reader?.annotations ?? []).filter((annotation) =>
    currentPageParagraphIdSet.has(annotation.paragraph_id),
  );
  const activeParagraph = activeParagraphId ? paragraphMap.get(activeParagraphId) ?? null : null;
  const currentPageIndex = pageIndexMap.get(effectivePageNo) ?? 0;
  const pagePreviewStripItems = useMemo(
    () => buildPagePreviewStripItems(reader?.pages ?? [], effectivePageNo),
    [effectivePageNo, reader?.pages],
  );
  const renderedPagePreviewCount = pagePreviewStripItems.filter((item) => item.kind === "page").length;
  const isPagePreviewWindowed = pagePreviewStripItems.some((item) => item.kind === "gap");
  const allSearchMatches = useMemo(() => {
    if (!locatorQuery.trim()) return [];
    const normalizedQuery = locatorQuery.trim().toLowerCase();
    return (reader?.paragraphs ?? []).filter((paragraph) => paragraph.text.toLowerCase().includes(normalizedQuery));
  }, [locatorQuery, reader?.paragraphs]);
  const matchedParagraphIds = useMemo(
    () => allSearchMatches.filter((paragraph) => paragraph.page_no === effectivePageNo).map((paragraph) => paragraph.paragraph_id),
    [allSearchMatches, effectivePageNo],
  );
  const matchedParagraphIdSet = useMemo(() => new Set(matchedParagraphIds), [matchedParagraphIds]);
  const currentPageAnnotationParagraphIdSet = useMemo(
    () => new Set(currentPageAnnotations.map((annotation) => annotation.paragraph_id)),
    [currentPageAnnotations],
  );
  const translatedParagraphIdSet = useMemo(() => new Set(translatedParagraphIds), [translatedParagraphIds]);
  const projectEvidenceParagraphIdSet = useMemo(() => {
    const resolved = new Set<number>(projectEvidenceParagraphIds);
    for (const item of projectWorkspaceQuery.data?.evidence_items ?? []) {
      if (item.paper_id === paperId && item.paragraph_id) {
        resolved.add(item.paragraph_id);
      }
    }
    return resolved;
  }, [paperId, projectEvidenceParagraphIds, projectWorkspaceQuery.data?.evidence_items]);
  const revisitParagraphIdSet = useMemo(() => new Set(revisitParagraphIds), [revisitParagraphIds]);
  const readerAnnotations = reader?.annotations ?? [];
  const allAnnotationsSorted = useMemo(
    () => [...readerAnnotations].sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at)),
    [readerAnnotations],
  );
  const annotationWorkbenchItems = useMemo<AnnotationWorkbenchItem[]>(
    () =>
      allAnnotationsSorted.map((annotation) => {
        const paragraph = paragraphMap.get(annotation.paragraph_id) ?? null;
        const evidenceLinked = projectEvidenceParagraphIdSet.has(annotation.paragraph_id);
        const revisitMarked = revisitParagraphIdSet.has(annotation.paragraph_id);
        const currentPage = currentPageParagraphIdSet.has(annotation.paragraph_id);
        const currentFocus = annotation.paragraph_id === activeParagraphId;
        const pendingForProject = Boolean(projectId) && !evidenceLinked;
        const status = revisitMarked || pendingForProject ? "pending" : "resolved";
        let followUpHint = "这条批注已经有了当前阶段的落点，可回到原文复核细节。";
        if (revisitMarked) {
          followUpHint = "这条批注对应段落仍在待回看列表里，适合优先处理。";
        } else if (pendingForProject) {
          followUpHint = "这条批注还没进入当前项目证据，可回写到证据板或心得。";
        }
        return {
          annotation,
          paragraph,
          evidenceLinked,
          revisitMarked,
          currentPage,
          currentFocus,
          status,
          followUpHint,
        };
      }),
    [activeParagraphId, allAnnotationsSorted, currentPageParagraphIdSet, paragraphMap, projectEvidenceParagraphIdSet, projectId, revisitParagraphIdSet],
  );
  const pendingAnnotationItems = useMemo(
    () => annotationWorkbenchItems.filter((item) => item.status === "pending"),
    [annotationWorkbenchItems],
  );
  const resolvedAnnotationItems = useMemo(
    () => annotationWorkbenchItems.filter((item) => item.status === "resolved"),
    [annotationWorkbenchItems],
  );
  const activeParagraphAnnotations = useMemo(
    () => annotationWorkbenchItems.filter((item) => item.annotation.paragraph_id === activeParagraphId),
    [activeParagraphId, annotationWorkbenchItems],
  );
  const evidenceLinkedAnnotationCount = useMemo(
    () => annotationWorkbenchItems.filter((item) => item.evidenceLinked).length,
    [annotationWorkbenchItems],
  );
  const figurePages = useMemo(
    () => Array.from(new Set(orderedFigures.map((figure) => figure.page_no))),
    [orderedFigures],
  );
  const figureFlowItems = useMemo<FigureFlowItem[]>(
    () =>
      orderedFigures.slice(0, FIGURE_FLOW_VISIBLE_LIMIT).map((figure) => {
        const anchorParagraph = figure.anchor_paragraph_id ? paragraphMap.get(figure.anchor_paragraph_id) ?? null : null;
        return {
          figure,
          anchorParagraph,
          currentPage: figure.page_no === effectivePageNo,
          scanHint: anchorParagraph
            ? "建议先扫图，再回到锚点正文核对论证。"
            : "当前图像缺少稳定锚点，建议先看图再回原版页面。 ",
        };
      }),
    [effectivePageNo, orderedFigures, paragraphMap],
  );
  const figureFlowOverflowCount = Math.max(0, orderedFigures.length - figureFlowItems.length);

  const selectionQuoteForActiveParagraph =
    selection && activeParagraphId && selection.paragraphId === activeParagraphId ? selection.text : "";
  const pinnedQuoteForActiveParagraph =
    pinnedQuote && activeParagraphId && pinnedQuote.paragraphId === activeParagraphId ? pinnedQuote.text : "";
  const selectedQuoteForAnnotation = selectionQuoteForActiveParagraph || pinnedQuoteForActiveParagraph;
  const activeQuoteContext: QuoteContext | SelectionContext | null = selection ?? pinnedQuote;

  function buildParagraphStatusBadges(paragraph: PaperReaderParagraph): ParagraphStatusBadge[] {
    const badges: ParagraphStatusBadge[] = [];
    if (paragraph.paragraph_id === activeParagraphId) {
      badges.push({ key: `focus-${paragraph.paragraph_id}`, label: "当前焦点", tone: "focus" });
    }
    if (matchedParagraphIdSet.has(paragraph.paragraph_id)) {
      badges.push({ key: `match-${paragraph.paragraph_id}`, label: "搜索命中", tone: "info" });
    }
    if (currentPageAnnotationParagraphIdSet.has(paragraph.paragraph_id)) {
      badges.push({ key: `annotation-${paragraph.paragraph_id}`, label: "已批注", tone: "success" });
    }
    if (translatedParagraphIdSet.has(paragraph.paragraph_id)) {
      badges.push({ key: `translation-${paragraph.paragraph_id}`, label: "刚翻译", tone: "info" });
    }
    if (projectEvidenceParagraphIdSet.has(paragraph.paragraph_id)) {
      badges.push({ key: `evidence-${paragraph.paragraph_id}`, label: "已加入证据", tone: "success" });
    }
    if (revisitParagraphIdSet.has(paragraph.paragraph_id)) {
      badges.push({ key: `revisit-${paragraph.paragraph_id}`, label: "待回看", tone: "info" });
    }
    return badges;
  }

  const activeParagraphStatusBadges = activeParagraph ? buildParagraphStatusBadges(activeParagraph) : [];

  useEffect(() => {
    if (!currentPageParagraphs.length) return;
    if (activeParagraphId && currentPageParagraphIdSet.has(activeParagraphId)) return;
    setActiveParagraphId(currentPageParagraphs[0]?.paragraph_id ?? null);
  }, [activeParagraphId, currentPageParagraphIdSet, currentPageParagraphs]);

  useEffect(() => {
    if (!pinnedQuote || !activeParagraphId) return;
    if (pinnedQuote.paragraphId === activeParagraphId) return;
    setPinnedQuote(null);
  }, [activeParagraphId, pinnedQuote]);

  useEffect(() => {
    if (viewMode !== "text") return;
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const element = paragraphRefs.current[pending.paragraphId];
    if (!element) return;
    element.scrollIntoView({ behavior: pending.behavior, block: "center" });
    pendingFocusRef.current = null;
  }, [currentPageNo, viewMode, currentPageParagraphs]);

  useEffect(() => {
    if (!reader || !sessionReady || !currentPageNo) return;

    savePaperReaderSession({
      paperId,
      pageNo: currentPageNo,
      paragraphId: activeParagraphId,
      revisitParagraphIds,
      viewMode,
      zoomPercent,
      savedAt: new Date().toISOString(),
    });
  }, [activeParagraphId, currentPageNo, paperId, reader, revisitParagraphIds, sessionReady, viewMode, zoomPercent]);

  useEffect(() => {
    savePaperReaderPreferences({
      textWidth: textWidthPreference,
      textDensity: textDensityPreference,
    });
  }, [textDensityPreference, textWidthPreference]);

  useEffect(() => {
    if (!reader?.pdf_downloaded || keyboardFocusReadyRef.current) return;
    readerShellRef.current?.focus();
    keyboardFocusReadyRef.current = true;
  }, [reader?.pdf_downloaded]);

  function updateReaderUrl(paragraphId?: number | null) {
    navigate(paperReaderPath(paperId, requestedSummaryId, paragraphId ?? undefined, projectId ?? undefined), {
      replace: true,
      preventScrollReset: true,
    });
  }

  function clearSelectionState(options?: { keepPinnedQuote?: boolean }) {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    if (!options?.keepPinnedQuote) {
      setPinnedQuote(null);
    }
  }

  function clearQuoteContext(message?: string) {
    clearSelectionState();
    if (message) {
      setNotice(message);
    }
  }

  function restoreReaderShellFocusSoon() {
    window.requestAnimationFrame(() => {
      readerShellRef.current?.focus();
    });
  }

  function closeTranslationDrawer(options?: { clearContent?: boolean; restoreFocus?: boolean }) {
    setTranslationDrawerOpen(false);
    if (options?.clearContent) {
      setStreamingTranslationText("");
      setTranslation(null);
      setTranslationError("");
    }
    if (options?.restoreFocus !== false) {
      restoreReaderShellFocusSoon();
    }
  }

  function closeFigurePanel(options?: { restoreFocus?: boolean }) {
    setFigurePanelOpen(false);
    if (options?.restoreFocus !== false) {
      restoreReaderShellFocusSoon();
    }
  }

  function closeLightbox(options?: { restoreFocus?: boolean }) {
    setLightbox(null);
    if (options?.restoreFocus !== false) {
      restoreReaderShellFocusSoon();
    }
  }

  function rememberTouchedParagraph(
    setter: Dispatch<SetStateAction<number[]>>,
    paragraphId: number,
  ) {
    setter((current) => (current.includes(paragraphId) ? current : [...current, paragraphId]));
  }

  function toggleRevisitParagraph(paragraphId: number) {
    setRevisitParagraphIds((current) =>
      current.includes(paragraphId)
        ? current.filter((item) => item !== paragraphId)
        : [...current, paragraphId],
    );
  }

  function pinSelectionForFollowUp(context: QuoteContext | SelectionContext | null) {
    if (!context) return;
    setPinnedQuote({
      text: context.text,
      paragraphId: context.paragraphId,
    });
  }

  function continueQuoteIntoAnnotation(context: QuoteContext | SelectionContext | null, message = "已保留当前选区，可继续写批注。") {
    if (!context) return;
    pinSelectionForFollowUp(context);
    clearSelectionState({ keepPinnedQuote: true });
    focusAnnotationComposer(message);
    setRecentAction({
      kind: "annotate",
      message,
      paragraphId: context.paragraphId,
    });
  }

  function focusQuoteContextParagraph(context: QuoteContext | SelectionContext | null, message = "已回到引用原文对应段落。") {
    if (!context) return;
    focusParagraph(context.paragraphId, { behavior: "auto" });
    setRecentAction({
      kind: "locate",
      message,
      paragraphId: context.paragraphId,
    });
  }

  function focusAnnotationComposer(message?: string) {
    activateReaderMode("text");
    window.requestAnimationFrame(() => {
      annotationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      annotationTextareaRef.current?.focus();
    });
    if (message) {
      setNotice(message);
    }
  }

  function activateReaderMode(nextMode: ReaderMode) {
    setViewMode(nextMode);
    if (nextMode === "text" && activeParagraphId) {
      pendingFocusRef.current = { paragraphId: activeParagraphId, behavior: "auto" };
    }
  }

  function recordRecentNavigationAction(
    message: string,
    options?: { kind?: ReaderRecentAction["kind"]; paragraphId?: number | null },
  ) {
    setRecentAction({
      kind: options?.kind ?? "locate",
      message,
      paragraphId: options?.paragraphId ?? null,
    });
  }

  function goToPage(pageNo: number, options?: GoToPageOptions) {
    if (!pageIndexMap.has(pageNo)) return;
    const nextMode = options?.switchMode ?? viewMode;
    setCurrentPageNo(pageNo);
    if (options?.switchMode) {
      setViewMode(options.switchMode);
    }
    clearSelectionState();
    setLocatorError("");
    const firstParagraph = (paragraphsByPage.get(pageNo) ?? [])[0] ?? null;
    setActiveParagraphId(firstParagraph?.paragraph_id ?? null);
    if (nextMode === "text" && firstParagraph) {
      pendingFocusRef.current = { paragraphId: firstParagraph.paragraph_id, behavior: options?.behavior ?? "smooth" };
    }
    updateReaderUrl(null);
    if (options?.recentActionMessage) {
      recordRecentNavigationAction(options.recentActionMessage, {
        kind: options.recentActionKind,
        paragraphId: options?.recentActionParagraphId ?? firstParagraph?.paragraph_id ?? null,
      });
    }
  }

  function stepPage(direction: -1 | 1) {
    const nextIndex = currentPageIndex + direction;
    if (nextIndex < 0 || nextIndex >= pageNumbers.length) return;
    const targetPage = pageNumbers[nextIndex];
    goToPage(targetPage, {
      recentActionMessage: `已切到第 ${targetPage} 页。`,
    });
  }

  function jumpToBoundaryPage(edge: "start" | "end") {
    const targetPage = edge === "start" ? pageNumbers[0] : pageNumbers[pageNumbers.length - 1];
    if (!targetPage) return;
    goToPage(targetPage, {
      recentActionMessage: edge === "start" ? "已跳到首页。" : "已跳到末页。",
    });
  }

  function stepZoom(direction: -1 | 1) {
    const currentIndex = ZOOM_OPTIONS.indexOf(normalizeZoomPercent(zoomPercent));
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.min(ZOOM_OPTIONS.length - 1, Math.max(0, safeIndex + direction));
    setZoomPercent(ZOOM_OPTIONS[nextIndex]);
  }

  function resetZoom() {
    setZoomPercent(ZOOM_OPTIONS[0]);
  }

  function focusParagraph(paragraphId: number, options?: FocusParagraphOptions) {
    const paragraph = paragraphMap.get(paragraphId);
    if (!paragraph) return;

    const behavior = options?.behavior ?? "smooth";
    const shouldSwitchToText = options?.switchToText ?? true;

    if (shouldSwitchToText) {
      setViewMode("text");
    }
    setCurrentPageNo(paragraph.page_no);
    setActiveParagraphId(paragraph.paragraph_id);
    pendingFocusRef.current = { paragraphId, behavior };
    if (options?.updateUrl !== false) {
      updateReaderUrl(paragraphId);
    }
    if (options?.recentActionMessage) {
      recordRecentNavigationAction(options.recentActionMessage, {
        kind: options.recentActionKind,
        paragraphId,
      });
    }
  }

  function stepParagraph(direction: -1 | 1) {
    if (!currentPageParagraphs.length) return;

    const currentIndex = activeParagraphId
      ? currentPageParagraphs.findIndex((paragraph) => paragraph.paragraph_id === activeParagraphId)
      : -1;
    const nextIndex = currentIndex >= 0 ? currentIndex + direction : direction > 0 ? 0 : currentPageParagraphs.length - 1;
    if (nextIndex < 0 || nextIndex >= currentPageParagraphs.length) {
      return;
    }
    focusParagraph(currentPageParagraphs[nextIndex].paragraph_id, { behavior: "smooth" });
  }

  function focusLocatorInput() {
    activateReaderMode("text");
    window.requestAnimationFrame(() => {
      locatorInputRef.current?.focus();
      locatorInputRef.current?.select();
    });
  }

  function reclaimReaderShellFocus() {
    readerShellRef.current?.focus();
  }

  function handleReaderShellMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (isReaderInteractiveTarget(event.target)) {
      return;
    }
    reclaimReaderShellFocus();
  }

  function exitReaderInputTarget(target: HTMLElement | null) {
    if (!target) {
      return false;
    }
    if (target === locatorInputRef.current) {
      setLocatorError("");
      target.blur();
      restoreReaderShellFocusSoon();
      return true;
    }
    if (target === annotationTextareaRef.current || target.tagName === "SELECT") {
      target.blur();
      restoreReaderShellFocusSoon();
      return true;
    }
    return false;
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const normalizedKey = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && normalizedKey === "enter" && target === annotationTextareaRef.current) {
        event.preventDefault();
        void handleCreateAnnotation();
        return;
      }

      if (normalizedKey === "escape" && exitReaderInputTarget(target)) {
        event.preventDefault();
        return;
      }

      if (isEditableShortcutTarget(target)) {
        return;
      }

      if (normalizedKey === "escape") {
        if (lightbox) {
          event.preventDefault();
          closeLightbox();
          return;
        }
        if (figurePanelOpen) {
          event.preventDefault();
          closeFigurePanel();
          return;
        }
        if (translationDrawerOpen) {
          event.preventDefault();
          closeTranslationDrawer();
          return;
        }
        if (selection || pinnedQuote) {
          event.preventDefault();
          clearQuoteContext("已清空当前引用原文。");
          return;
        }
      }

      if (lightbox || figurePanelOpen || translationDrawerOpen) {
        return;
      }

      if (normalizedKey === "arrowleft") {
        event.preventDefault();
        stepPage(-1);
        return;
      }
      if (normalizedKey === "arrowright") {
        event.preventDefault();
        stepPage(1);
        return;
      }
      if (normalizedKey === "pageup") {
        event.preventDefault();
        stepPage(-1);
        return;
      }
      if (normalizedKey === "pagedown") {
        event.preventDefault();
        stepPage(1);
        return;
      }
      if (normalizedKey === "home") {
        event.preventDefault();
        jumpToBoundaryPage("start");
        return;
      }
      if (normalizedKey === "end") {
        event.preventDefault();
        jumpToBoundaryPage("end");
        return;
      }
      if (normalizedKey === "/") {
        event.preventDefault();
        focusLocatorInput();
        return;
      }
      if (normalizedKey === "j") {
        event.preventDefault();
        stepParagraph(1);
        return;
      }
      if (normalizedKey === "k") {
        event.preventDefault();
        stepParagraph(-1);
        return;
      }
      if (normalizedKey === "p") {
        event.preventDefault();
        activateReaderMode("page");
        return;
      }
      if (normalizedKey === "t") {
        event.preventDefault();
        activateReaderMode("text");
        return;
      }
      if (normalizedKey === "w") {
        event.preventDefault();
        activateReaderMode("workspace");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && viewMode === "page") {
        if (normalizedKey === "=" || normalizedKey === "+") {
          event.preventDefault();
          stepZoom(1);
          return;
        }
        if (normalizedKey === "-") {
          event.preventDefault();
          stepZoom(-1);
          return;
        }
        if (normalizedKey === "0") {
          event.preventDefault();
          resetZoom();
          return;
        }
      }
      if (normalizedKey === "b" && projectId) {
        event.preventDefault();
        navigate(projectPath(projectId));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [figurePanelOpen, lightbox, navigate, pinnedQuote, projectId, selection, stepPage, translationDrawerOpen, viewMode, zoomPercent]);

  function readCurrentSelectionContext(): SelectionContext | null {
    const currentSelection = window.getSelection();
    if (!currentSelection || currentSelection.rangeCount === 0) {
      return null;
    }

    const text = currentSelection.toString().trim();
    if (!text) {
      return null;
    }

    const article = articleRef.current;
    const range = currentSelection.getRangeAt(0);
    const commonNode = range.commonAncestorContainer;
    const sourceElement = commonNode instanceof Element ? commonNode : commonNode.parentElement;
    if (!article || !sourceElement || !article.contains(sourceElement)) {
      return null;
    }

    const paragraphElement = sourceElement.closest<HTMLElement>("[data-paragraph-id]");
    if (!paragraphElement) {
      return null;
    }

    const paragraphId = Number(paragraphElement.dataset.paragraphId);
    if (!Number.isFinite(paragraphId)) {
      return null;
    }

    const rect = range.getBoundingClientRect();
    const placement = resolveSelectionToolbarPosition(rect, Boolean(projectId));
    return {
      text,
      paragraphId,
      top: placement.top,
      left: placement.left,
    };
  }

  function captureSelection() {
    const nextSelection = readCurrentSelectionContext();
    if (!nextSelection) {
      setSelection(null);
      return;
    }

    setSelection(nextSelection);
    setTranslationError("");
    setActiveParagraphId(nextSelection.paragraphId);
  }

  useEffect(() => {
    if (!selection) return;

    let frameId = 0;
    const syncSelectionPosition = () => {
      const nextSelection = readCurrentSelectionContext();
      if (!nextSelection || nextSelection.paragraphId !== selection.paragraphId || nextSelection.text !== selection.text) {
        setSelection(null);
        return;
      }

      setSelection((current) => {
        if (!current || current.paragraphId !== nextSelection.paragraphId || current.text !== nextSelection.text) {
          return current;
        }
        if (current.top === nextSelection.top && current.left === nextSelection.left) {
          return current;
        }
        return {
          ...current,
          top: nextSelection.top,
          left: nextSelection.left,
        };
      });
    };

    const scheduleSync = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(syncSelectionPosition);
    };

    window.addEventListener("scroll", scheduleSync, true);
    window.addEventListener("resize", scheduleSync);
    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", scheduleSync, true);
      window.removeEventListener("resize", scheduleSync);
    };
  }, [projectId, selection]);

  async function handleDownload() {
    setDownloading(true);
    setError("");
    setNotice("");
    try {
      const result = await downloadPaper(paperId);
      setNotice(`PDF 已下载到本地：${result.pdf_local_path}。正在刷新阅读数据。`);
      await loadReader();
    } catch (downloadError) {
      setError((downloadError as Error).message || "PDF 下载失败，请稍后重试。");
    } finally {
      setDownloading(false);
    }
  }

  async function handleTranslateSelection(context: QuoteContext | SelectionContext | null = selection) {
    if (!context) return;

    pinSelectionForFollowUp(context);
    setTranslationLoading(true);
    setTranslationError("");
    setStreamingTranslationText("");
    setTranslation(null);
    setTranslationDrawerOpen(true);

    try {
      const result = await translateSegmentStream(
        {
          text: context.text,
          mode: "selection",
          locator: {
            paper_id: paperId,
            paragraph_id: context.paragraphId,
            selected_text: context.text,
          },
        },
        {
          onDelta: (delta) => setStreamingTranslationText((previous) => `${previous}${delta}`),
        },
      );
      setTranslation(result);
      setStreamingTranslationText(result.content_zh);
      focusParagraph(context.paragraphId, { behavior: "auto" });
      rememberTouchedParagraph(setTranslatedParagraphIds, context.paragraphId);
      clearSelectionState({ keepPinnedQuote: true });
      setNotice("已完成英译中辅助翻译，并回到当前段落。");
      setRecentAction({
        kind: "translate",
        message: "已完成当前选区翻译，可继续写批注或加入证据。",
        paragraphId: context.paragraphId,
      });
    } catch (translateError) {
      setTranslationError((translateError as Error).message || "选词翻译失败，请稍后重试。");
    } finally {
      setTranslationLoading(false);
    }
  }

  async function handleCreateAnnotation() {
    if (!activeParagraphId) {
      setLocatorError("请先选中当前页中的一个段落。");
      return;
    }
    if (!annotationDraft.trim()) {
      setLocatorError("请先填写批注内容。");
      return;
    }

    setAnnotationSaving(true);
    setLocatorError("");
    try {
      const createdAnnotation = await createPaperAnnotation(paperId, {
        paragraph_id: activeParagraphId,
        selected_text: selectedQuoteForAnnotation,
        note_text: annotationDraft.trim(),
      });
      const mergeAnnotationIntoReader = (current: PaperReader | null) => {
        if (!current || current.paper.id !== paperId) {
          return current;
        }
        return {
          ...current,
          annotations: [createdAnnotation, ...current.annotations.filter((item) => item.id !== createdAnnotation.id)].sort(
            (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
          ),
        };
      };
      queryClient.setQueryData<PaperReader | null>(queryKeys.papers.reader(paperId), mergeAnnotationIntoReader);
      setReader((current) => mergeAnnotationIntoReader(current));
      setAnnotationDraft("");
      clearSelectionState();
      setNotice("当前段落批注已保存。");
      setRecentAction({
        kind: "annotate",
        message: "已保存当前段落批注。",
        paragraphId: activeParagraphId,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.papers.reader(paperId) });
      if (activeParagraphId) {
        focusParagraph(activeParagraphId, { behavior: "auto", updateUrl: false });
      }
    } catch (annotationError) {
      setLocatorError((annotationError as Error).message || "保存批注失败，请稍后重试。");
    } finally {
      setAnnotationSaving(false);
    }
  }

  async function handleAddEvidenceToProject() {
    if (!projectId) {
      return;
    }

    const fallbackActiveParagraphId = Number(
      articleRef.current?.querySelector<HTMLElement>(".reader-text-block-active")?.dataset.paragraphId ?? 0,
    ) || null;
    const paragraphId = activeParagraphId ?? selection?.paragraphId ?? pinnedQuote?.paragraphId ?? fallbackActiveParagraphId;
    const resolvedParagraph = paragraphId ? paragraphMap.get(paragraphId) ?? activeParagraph : activeParagraph;
    const excerpt = (selectedQuoteForAnnotation || selection?.text || pinnedQuote?.text || resolvedParagraph?.text || "").trim();

    if (!paragraphId || !excerpt) {
      setLocatorError("请先选中文本，或先激活一个段落。");
      return;
    }

    setProjectEvidenceSaving(true);
    setLocatorError("");
    try {
      const evidence = await createProjectEvidence(projectId, {
        paper_id: paperId,
        paragraph_id: paragraphId,
        kind: "claim",
        excerpt,
        note_text: annotationDraft.trim(),
        source_label: activeParagraph ? `阅读器段落 p.${activeParagraph.page_no}` : "阅读器选区",
      });
      setNotice("已加入当前项目证据板。");
      queryClient.setQueryData<ResearchProjectWorkspace | null>(queryKeys.projects.workspace(projectId), (current) => {
        if (!current || current.evidence_items.some((item) => item.id === evidence.id)) {
          return current;
        }

        return {
          ...current,
          papers: current.papers.map((item) =>
            item.paper.id === paperId
              ? {
                  ...item,
                  evidence_count: item.evidence_count + 1,
                }
              : item,
          ),
          evidence_items: [...current.evidence_items, evidence].sort((left, right) => left.sort_order - right.sort_order),
        };
      });
      queryClient.setQueryData<ResearchProjectListItem[] | undefined>(queryKeys.projects.list(), (current) =>
        current?.map((item) =>
          item.id === projectId
            ? {
                ...item,
                evidence_count: item.evidence_count + 1,
              }
            : item,
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.workspace(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() }),
      ]);
      setAnnotationDraft("");
      rememberTouchedParagraph(setProjectEvidenceParagraphIds, paragraphId);
      clearSelectionState({ keepPinnedQuote: true });
      setRecentAction({
        kind: "evidence",
        message: "已加入当前项目证据板，可继续补批注。",
        paragraphId,
      });
    } catch (projectError) {
      setLocatorError((projectError as Error).message || "加入项目证据板失败，请稍后重试。");
    } finally {
      setProjectEvidenceSaving(false);
    }
  }

  function jumpToSearchMatch(direction: -1 | 1, options?: { continueFromCurrent?: boolean }) {
    const query = locatorQuery.trim();
    if (!query) {
      setLocatorError("请输入关键词后再定位。");
      return;
    }

    if (!allSearchMatches.length) {
      setLocatorError(`辅助文本中暂未找到“${query}”。`);
      return;
    }

    const currentMatchIndex = activeParagraphId
      ? allSearchMatches.findIndex((paragraph) => paragraph.paragraph_id === activeParagraphId)
      : -1;
    let targetIndex = direction > 0 ? 0 : allSearchMatches.length - 1;
    if (currentMatchIndex >= 0) {
      targetIndex = options?.continueFromCurrent
        ? (currentMatchIndex + direction + allSearchMatches.length) % allSearchMatches.length
        : currentMatchIndex;
    }
    const target = allSearchMatches[targetIndex];
    setLocatorError("");
    focusParagraph(target.paragraph_id, {
      behavior: "auto",
      recentActionMessage:
        allSearchMatches.length > 1
          ? `已跳到第 ${targetIndex + 1}/${allSearchMatches.length} 个搜索命中（第 ${target.page_no} 页）。`
          : `已按关键词定位到第 ${target.page_no} 页相关段落。`,
    });
    setNotice(
      allSearchMatches.length > 1
        ? `已跳到第 ${targetIndex + 1}/${allSearchMatches.length} 个搜索命中。`
        : `已定位到第 ${target.page_no} 页相关段落。`,
    );
  }

  function handleLocateParagraph() {
    jumpToSearchMatch(1, { continueFromCurrent: true });
  }

  function openAnnotationForFollowUp(item: AnnotationWorkbenchItem) {
    if (item.annotation.selected_text.trim()) {
      setPinnedQuote({
        text: item.annotation.selected_text,
        paragraphId: item.annotation.paragraph_id,
      });
    }
    focusParagraph(item.annotation.paragraph_id, {
      behavior: "auto",
      switchToText: true,
      recentActionKind: "annotate",
      recentActionMessage: item.status === "pending" ? "已回到待处理批注对应段落。" : "已回到已沉淀批注对应段落。",
    });
    annotationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setNotice(
      item.status === "pending"
        ? "已回到待处理批注对应段落，可继续补证据或整理心得。"
        : "已回到批注对应段落，可复核这条已沉淀记录。",
    );
  }

  function openCurrentPagePreview(page: PaperReaderPagePreview) {
    setLightbox({
      src: resolveApiAssetUrl(page.image_url),
      title: `第 ${page.page_no} 页原版页面`,
    });
  }

  function openFigurePreview(figure: PaperReaderFigure) {
    setLightbox({
      src: resolveApiAssetUrl(figure.image_url),
      title: `图像 · 第 ${figure.page_no} 页`,
      caption: figure.caption_text,
    });
  }

  function openFigureForScan(figure: PaperReaderFigure) {
    goToPage(figure.page_no, {
      recentActionMessage: `已跳到第 ${figure.page_no} 页图像，适合先扫图再回正文。`,
      recentActionParagraphId: figure.anchor_paragraph_id ?? null,
    });
    openFigurePreview(figure);
    setNotice(`已打开第 ${figure.page_no} 页图像，可先扫图再回正文。`);
  }

  function openFigureAnchor(item: FigureFlowItem) {
    if (item.anchorParagraph) {
      focusParagraph(item.anchorParagraph.paragraph_id, {
        behavior: "auto",
        recentActionMessage: "已回到图像附近正文锚点。",
      });
      setNotice("已回到图像附近正文锚点，可继续核对论证。");
      return;
    }
    goToPage(item.figure.page_no, {
      switchMode: "page",
      recentActionMessage: `已切到第 ${item.figure.page_no} 页原版页面，可继续核对图像。`,
    });
    setNotice(`已切到第 ${item.figure.page_no} 页原版页面，可结合版式继续核对图像。`);
  }

  function openOriginalPdf() {
    window.open(getPaperPdfUrl(paperId, false), "_blank", "noopener,noreferrer");
  }

  if (loading && !reader) {
    return <Loading text="正在准备论文阅读视图..." />;
  }

  if (!reader) {
    return (
      <div className="paper-reader-shell">
        <StatusStack items={error ? [{ variant: "error", message: error }] : []} />
      </div>
    );
  }

  const summaryCount = reader.summaries.length;
  const reflectionCount = reader.reflections.length;
  const taskCount = reader.recent_tasks.length;
  const activePageAnnotationCount = currentPageAnnotations.length;
  const totalAnnotationCount = reader.annotations.length;
  const readingProgressPercent = pageNumbers.length > 0 ? Math.round(((currentPageIndex + 1) / pageNumbers.length) * 100) : 0;
  const focusSummaryTitle =
    viewMode === "text" && activeParagraph
      ? `当前焦点：第 ${activeParagraph.page_no} 页 · 段落 #${activeParagraph.paragraph_id}`
      : `当前阅读位置：第 ${effectivePageNo} 页`;
  const pageModeAnchorHint =
    viewMode !== "text" && activeParagraph ? `当前页锚点：段落 #${activeParagraph.paragraph_id}` : null;
  const headingParagraphs = reader.paragraphs.filter((paragraph) => paragraph.kind === "heading").slice(0, 10);
  const activeSearchMatchIndex = activeParagraphId
    ? allSearchMatches.findIndex((paragraph) => paragraph.paragraph_id === activeParagraphId)
    : -1;
  const quickSearchMatches = allSearchMatches.slice(0, 8);
  const locatorMatchStatusText = locatorQuery.trim()
    ? allSearchMatches.length > 0
      ? activeSearchMatchIndex >= 0
        ? `命中 ${allSearchMatches.length} 处 · 当前第 ${activeSearchMatchIndex + 1} 处`
        : `命中 ${allSearchMatches.length} 处 · 还未跳到具体命中`
      : "当前关键词暂未命中结果"
    : "输入关键词后，可在命中间顺序跳转。";
  const quickFigureShortcuts = orderedFigures.slice(0, FIGURE_SHORTCUT_VISIBLE_LIMIT);
  const quickRevisitShortcuts = revisitParagraphIds
    .map((paragraphId) => paragraphMap.get(paragraphId))
    .filter((paragraph): paragraph is PaperReaderParagraph => Boolean(paragraph))
    .slice(0, 8);
  const recentAnnotationShortcuts = allAnnotationsSorted.slice(0, 8);
  const currentPageBodyCount = currentPageParagraphs.filter((paragraph) => paragraph.kind === "body").length;
  const currentPageHeadingCount = currentPageParagraphs.filter((paragraph) => paragraph.kind === "heading").length;
  const currentPageSupportCount =
    currentPageParagraphs.filter((paragraph) => paragraph.kind === "caption" || paragraph.kind === "formula").length +
    currentPageFigures.length;
  const currentPageRevisitCount = currentPageParagraphs.filter((paragraph) => revisitParagraphIdSet.has(paragraph.paragraph_id)).length;
  const textModePageHint = activeParagraph
    ? `当前焦点：${compactTextPreview(activeParagraph.text, 110)}`
    : activePageAnnotationCount > 0
      ? `本页已有 ${activePageAnnotationCount} 条批注，可直接在下方继续整理。`
      : currentPageFigures.length > 0
        ? `这一页有 ${currentPageFigures.length} 张图像，建议先扫图再回正文核对。`
      : currentPageSupportCount > currentPageBodyCount
        ? "这一页图示、图注或公式较多，建议和原版页面对照阅读。"
        : "这一页已按段拆开，可点击任一段直接翻译、批注或加入证据。";
  const pendingRevisitAnnotationCount = pendingAnnotationItems.filter((item) => item.revisitMarked).length;
  const pendingProjectAnnotationCount = pendingAnnotationItems.filter((item) => Boolean(projectId) && !item.evidenceLinked).length;

  function renderAnnotationWorkbenchButton(item: AnnotationWorkbenchItem) {
    return (
      <button
        key={item.annotation.id}
        type="button"
        className={`paper-reader-annotation-item${item.currentFocus ? " active" : ""}`}
        data-testid={`reader-annotation-workbench-item-${item.annotation.id}`}
        onClick={() => openAnnotationForFollowUp(item)}
      >
        <div className="reader-annotation-task-top">
          <strong>{item.status === "pending" ? "待处理批注" : "已沉淀批注"}</strong>
          <span className="subtle">{formatDateTime(item.annotation.updated_at)}</span>
        </div>
        <div className="reader-status-row">
          <span className={`reader-status-badge ${item.status === "pending" ? "tone-info" : "tone-success"}`}>
            {item.status === "pending" ? "待处理" : "已沉淀"}
          </span>
          {item.revisitMarked ? <span className="reader-status-badge tone-info">待回看</span> : null}
          {item.evidenceLinked ? <span className="reader-status-badge tone-success">已进证据</span> : null}
          {item.currentPage ? <span className="reader-status-badge tone-focus">当前页</span> : null}
          {item.currentFocus ? <span className="reader-status-badge tone-focus">当前焦点</span> : null}
        </div>
        {item.annotation.selected_text ? (
          <div className="subtle">引用：{compactTextPreview(item.annotation.selected_text, 84)}</div>
        ) : null}
        <div>{item.annotation.note_text}</div>
        <div className="subtle">
          {item.paragraph ? `p.${item.paragraph.page_no} · ${compactTextPreview(item.paragraph.text, 96)}` : `段落 #${item.annotation.paragraph_id}`}
        </div>
        <div className="reader-annotation-task-footer">
          <span className="subtle">{item.followUpHint}</span>
          <span className="reader-annotation-task-link">回到段落继续处理</span>
        </div>
      </button>
    );
  }

  return (
    <div
      ref={readerShellRef}
      className="paper-reader-shell"
      data-testid="reader-shell"
      tabIndex={-1}
      onMouseDownCapture={handleReaderShellMouseDown}
    >
      <Card>
        <div className="paper-reader-header">
          <div>
            <div className="subtle">论文阅读</div>
            <h2 className="title">{reader.paper.title_en}</h2>
            <div className="reader-chip-row">
              <span className="reader-chip">{reader.paper.source.toUpperCase()}</span>
              {reader.paper.year ? <span className="reader-chip">{reader.paper.year}</span> : null}
              <span className="reader-chip">{readingStatusLabel(reader.research_state.reading_status)}</span>
              <span className="reader-chip">{reproInterestLabel(reader.research_state.repro_interest)}</span>
              <span className="reader-chip">摘要 {summaryCount}</span>
              <span className="reader-chip">心得 {reflectionCount}</span>
              <span className="reader-chip">任务 {taskCount}</span>
            </div>
            <div className="subtle" style={{ marginTop: 8 }}>
              {reader.paper.authors || "暂无作者信息"}
              {reader.paper.updated_at ? ` · 最近更新 ${formatDateTime(reader.paper.updated_at)}` : ""}
            </div>
            {projectId ? <div className="subtle" style={{ marginTop: 8 }}>当前为项目上下文阅读视图，可随时返回项目工作台继续整理证据。</div> : null}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {projectId ? (
              <Button className="secondary" type="button" data-testid="reader-return-project" onClick={() => navigate(projectPath(projectId))}>
                返回项目工作台
              </Button>
            ) : null}
            <Button className={viewMode === "page" ? "" : "secondary"} type="button" data-testid="reader-mode-page" onClick={() => activateReaderMode("page")}>
              原版页面
            </Button>
            <Button className={viewMode === "text" ? "" : "secondary"} type="button" data-testid="reader-mode-text" onClick={() => activateReaderMode("text")}>
              辅助文本
            </Button>
            <Button
              className={viewMode === "workspace" ? "" : "secondary"}
              type="button"
              data-testid="reader-mode-workspace"
              onClick={() => activateReaderMode("workspace")}
            >
              论文工作区
            </Button>
          </div>
        </div>

        <div className="reader-mode-guide" data-testid="reader-mode-guide">
          <div>
            <strong>{readerModeLabel(viewMode)}</strong>
            <div className="subtle" style={{ marginTop: 6 }}>
              {readerModeDescription(viewMode)}
            </div>
          </div>
          <div className="reader-mode-guide-actions">
            {viewMode !== "page" ? (
              <Button className="secondary" type="button" onClick={() => activateReaderMode("page")}>
                回到原版页面
              </Button>
            ) : null}
            {viewMode !== "text" ? (
              <Button className="secondary" type="button" onClick={() => activateReaderMode("text")}>
                需要翻译或批注时切到辅助文本
              </Button>
            ) : null}
            {viewMode !== "workspace" ? (
              <Button className="secondary" type="button" onClick={() => activateReaderMode("workspace")}>
                需要沉淀记录时切到论文工作区
              </Button>
            ) : null}
          </div>
        </div>

        <div className="paper-reader-abstract">
          <div className="subtle" style={{ marginBottom: 6 }}>
            Abstract（英文原文保持 canonical）
          </div>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {reader.paper.abstract_en || "当前论文暂无 abstract。"}
          </p>
        </div>
      </Card>

      <StatusStack
        items={[
          ...(error ? [{ variant: "error" as const, message: error }] : []),
          ...(reader.text_notice
            ? [{ variant: reader.reader_ready ? ("info" as const) : ("warning" as const), message: reader.text_notice }]
            : []),
          ...reader.reader_notices.map((message) => ({ variant: "warning" as const, message })),
          ...(notice ? [{ variant: "success" as const, message: notice }] : []),
          ...(translationError ? [{ variant: "warning" as const, message: translationError }] : []),
          ...(locatorError ? [{ variant: "warning" as const, message: locatorError }] : []),
        ]}
      />

      {!reader.pdf_downloaded ? (
        <Card>
          <div className="reader-empty-task">
            <EmptyState
              title="当前尚未下载 PDF"
              hint="你仍可先查看 abstract 与研究状态；下载 PDF 后即可进入原版页面阅读、辅助文本与本页图像。"
            />
            <div className="reader-empty-task-actions">
              <Button type="button" onClick={() => void handleDownload()} disabled={downloading}>
                {downloading ? "正在下载 PDF..." : "下载 PDF 并生成阅读视图"}
              </Button>
              {projectId ? (
                <Link className="button secondary" to={projectPath(projectId)}>
                  返回项目工作台
                </Link>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {reader.pdf_downloaded ? (
        <Card className="paper-reader-locator">
          <div className="paper-reader-locator-row">
            <strong>当前模式：{readerModeLabel(viewMode)}</strong>
            <span className="subtle">当前页 {effectivePageNo} / 共 {pageNumbers.length || 0} 页</span>
            <span className="subtle">本页图像 {currentPageFigures.length} 张</span>
            <span className="subtle">本页批注 {activePageAnnotationCount} 条</span>
          </div>

          <div className="reader-focus-summary" data-testid="reader-focus-summary">
            <div className="reader-focus-summary-top">
              <div>
                <strong>{focusSummaryTitle}</strong>
                <div className="subtle" style={{ marginTop: 6 }}>
                  {recentAction
                    ? `刚刚完成：${recentAction.message}`
                    : "阅读器会记住你的上次阅读位置、视图模式和缩放设置。"}
                </div>
                {pageModeAnchorHint ? (
                  <div className="subtle" style={{ marginTop: 6 }} data-testid="reader-page-anchor-hint">
                    {pageModeAnchorHint}
                  </div>
                ) : null}
                <div className="reader-status-row" style={{ marginTop: 8 }}>
                  <span className="reader-status-badge tone-focus">阅读进度 {readingProgressPercent}%</span>
                  <span className="reader-status-badge tone-info">待回看 {revisitParagraphIds.length} 段</span>
                  <span className="reader-status-badge tone-success">累计批注 {totalAnnotationCount} 条</span>
                  {reader.research_state.last_opened_at ? (
                    <span className="reader-status-badge tone-info">
                      最近打开 {formatDateTime(reader.research_state.last_opened_at)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="reader-status-row">
                {activeParagraphStatusBadges.map((badge) => (
                  <span key={badge.key} className={`reader-status-badge tone-${badge.tone}`}>
                    {badge.label}
                  </span>
                ))}
              </div>
            </div>

            {restoredSession ? (
              <div className="subtle" data-testid="reader-session-badge">
                已恢复上次阅读：{describeReaderSession(restoredSession)}
              </div>
            ) : null}
          </div>

          <div className="paper-reader-locator-row">
            <Button className="secondary" type="button" disabled={currentPageIndex <= 0} onClick={() => stepPage(-1)}>
              上一页
            </Button>
            <select
              className="select"
              data-testid="reader-page-jump"
              value={String(effectivePageNo)}
              onChange={(event) =>
                goToPage(Number(event.target.value), {
                  recentActionMessage: `已切到第 ${event.target.value} 页。`,
                })
              }
            >
              {pageNumbers.map((pageNo) => (
                <option key={pageNo} value={pageNo}>
                  第 {pageNo} 页
                </option>
              ))}
            </select>
            <Button
              className="secondary"
              type="button"
              disabled={currentPageIndex >= pageNumbers.length - 1}
              onClick={() => stepPage(1)}
            >
              下一页
            </Button>
            <input
              ref={locatorInputRef}
              className="input"
              style={{ minWidth: 280, flex: 1 }}
              data-testid="reader-locator-input"
              placeholder="按关键词定位辅助文本，例如 baseline、dataset、ablation"
              value={locatorQuery}
              onChange={(event) => {
                setLocatorQuery(event.target.value);
                setLocatorError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (event.shiftKey) {
                    jumpToSearchMatch(-1, { continueFromCurrent: true });
                    return;
                  }
                  handleLocateParagraph();
                }
              }}
            />
            <Button type="button" onClick={handleLocateParagraph}>
              定位关键词
            </Button>
            <Button
              className="secondary"
              type="button"
              data-testid="reader-locator-prev-match"
              disabled={allSearchMatches.length === 0}
              onClick={() => jumpToSearchMatch(-1, { continueFromCurrent: true })}
            >
              上一处
            </Button>
            <Button
              className="secondary"
              type="button"
              data-testid="reader-locator-next-match"
              disabled={allSearchMatches.length === 0}
              onClick={() => jumpToSearchMatch(1, { continueFromCurrent: true })}
            >
              下一处
            </Button>
          </div>
          <div className="reader-status-row" data-testid="reader-locator-match-status" style={{ marginTop: 8 }}>
            <span className="reader-status-badge tone-info">{locatorMatchStatusText}</span>
            {allSearchMatches.length > 1 ? (
              <span className="subtle">Enter 继续下一处，Shift + Enter 回到上一处。</span>
            ) : null}
          </div>

          <div className="reader-shortcut-strip" data-testid="reader-shortcuts">
            <span className="reader-shortcut-chip">
              <kbd>/</kbd>
              聚焦定位
            </span>
            <span className="reader-shortcut-chip">
              <kbd>j</kbd>
              <kbd>k</kbd>
              段落跳转
            </span>
            <span className="reader-shortcut-chip">
              <kbd>←</kbd>
              <kbd>→</kbd>
              页切换
            </span>
            <span className="reader-shortcut-chip">
              <kbd>PgUp</kbd>
              <kbd>PgDn</kbd>
              <kbd>Home</kbd>
              <kbd>End</kbd>
              桌面翻页
            </span>
            <span className="reader-shortcut-chip">
              <kbd>p</kbd>
              <kbd>t</kbd>
              <kbd>w</kbd>
              模式切换
            </span>
            <span className="reader-shortcut-chip">
              <kbd>Ctrl</kbd>
              <kbd>+</kbd>
              <kbd>-</kbd>
              <kbd>0</kbd>
              页面缩放
            </span>
            <span className="reader-shortcut-chip">
              <kbd>Ctrl</kbd>
              <kbd>Enter</kbd>
              保存批注
            </span>
            <span className="reader-shortcut-chip">
              <kbd>Esc</kbd>
              收起浮层 / 清空引用
            </span>
            {projectId ? (
              <span className="reader-shortcut-chip">
                <kbd>b</kbd>
                返回项目
              </span>
            ) : null}
          </div>
        </Card>
      ) : null}

      {reader.pdf_downloaded ? (
        <Card className="paper-reader-quick-nav" data-testid="reader-quick-nav">
          <div className="paper-reader-header" style={{ alignItems: "center" }}>
            <div>
              <h3 className="title" style={{ fontSize: 18 }}>
                结构化导航
              </h3>
              <p className="subtle" style={{ margin: "4px 0 0" }}>
                从章节、图像、批注和搜索命中快速跳转，尽量减少在长论文里来回翻找。
              </p>
            </div>
          </div>

          <div className="reader-quick-nav-grid">
            <div className="reader-quick-nav-section">
              <strong>章节导航</strong>
              {headingParagraphs.length > 0 ? (
                <div className="reader-quick-nav-buttons">
                  {headingParagraphs.map((paragraph) => (
                    <button
                      key={paragraph.paragraph_id}
                      type="button"
                      className="reader-quick-nav-button"
                      data-testid={`reader-quick-nav-heading-${paragraph.paragraph_id}`}
                      data-target-page-no={paragraph.page_no}
                      data-target-paragraph-id={paragraph.paragraph_id}
                      onClick={() =>
                        focusParagraph(paragraph.paragraph_id, {
                          behavior: "auto",
                          recentActionMessage: `已通过章节导航跳到第 ${paragraph.page_no} 页。`,
                        })
                      }
                    >
                      <span className="reader-status-badge tone-focus">p.{paragraph.page_no}</span>
                      <span>{paragraph.text.slice(0, 72)}{paragraph.text.length > 72 ? "..." : ""}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="subtle">当前论文还没有可用的章节标题提取结果。</div>
              )}
            </div>

            <div className="reader-quick-nav-section">
              <strong>图像跳转</strong>
              {quickFigureShortcuts.length > 0 ? (
                <div className="reader-quick-nav-buttons">
                  {quickFigureShortcuts.map((figure) => (
                    <button
                      key={figure.figure_id}
                      type="button"
                      className="reader-quick-nav-button"
                      data-testid={`reader-quick-nav-figure-${figure.figure_id}`}
                      data-target-page-no={figure.page_no}
                      onClick={() => {
                        goToPage(figure.page_no, {
                          recentActionMessage: `已切到第 ${figure.page_no} 页图像导航。`,
                        });
                        setFigurePanelOpen(true);
                      }}
                    >
                      <span className="reader-status-badge tone-info">第 {figure.page_no} 页</span>
                      <span>{figure.caption_text?.slice(0, 72) || `图像 #${figure.figure_id}`}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="subtle">当前论文还没有提取到图像导航项。</div>
              )}
            </div>

            <div className="reader-quick-nav-section">
              <strong>批注回跳</strong>
              {recentAnnotationShortcuts.length > 0 ? (
                <div className="reader-quick-nav-buttons">
                  {recentAnnotationShortcuts.map((annotation) => (
                    <button
                      key={annotation.id}
                      type="button"
                      className="reader-quick-nav-button"
                      data-testid={`reader-quick-nav-annotation-${annotation.id}`}
                      data-target-paragraph-id={annotation.paragraph_id}
                      onClick={() =>
                        focusParagraph(annotation.paragraph_id, {
                          behavior: "auto",
                          recentActionKind: "annotate",
                          recentActionMessage: "已从批注回跳到对应段落。",
                        })
                      }
                    >
                      <span className="reader-status-badge tone-success">{formatDateTime(annotation.updated_at)}</span>
                      <span>{annotation.note_text.slice(0, 80)}{annotation.note_text.length > 80 ? "..." : ""}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="subtle">当前论文还没有批注记录。</div>
              )}
            </div>

            <div className="reader-quick-nav-section">
              <strong>待回看</strong>
              {quickRevisitShortcuts.length > 0 ? (
                <div className="reader-quick-nav-buttons">
                  {quickRevisitShortcuts.map((paragraph) => (
                    <button
                      key={paragraph.paragraph_id}
                      type="button"
                      className="reader-quick-nav-button"
                      data-testid={`reader-quick-nav-revisit-${paragraph.paragraph_id}`}
                      data-target-page-no={paragraph.page_no}
                      data-target-paragraph-id={paragraph.paragraph_id}
                      onClick={() =>
                        focusParagraph(paragraph.paragraph_id, {
                          behavior: "auto",
                          recentActionMessage: "已回到待回看段落。",
                        })
                      }
                    >
                      <span className="reader-status-badge tone-info">第 {paragraph.page_no} 页</span>
                      <span>{paragraph.text.slice(0, 84)}{paragraph.text.length > 84 ? "..." : ""}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="subtle">还没有标记待回看的段落。</div>
              )}
            </div>

            <div className="reader-quick-nav-section">
              <strong>{locatorQuery.trim() ? `搜索命中 (${allSearchMatches.length})` : "搜索命中"}</strong>
              {quickSearchMatches.length > 0 ? (
                <>
                  <div className="reader-quick-nav-buttons">
                    {quickSearchMatches.map((paragraph) => (
                      <button
                        key={paragraph.paragraph_id}
                        type="button"
                        className="reader-quick-nav-button"
                        data-testid={`reader-quick-nav-search-${paragraph.paragraph_id}`}
                        data-target-page-no={paragraph.page_no}
                        data-target-paragraph-id={paragraph.paragraph_id}
                        onClick={() =>
                          focusParagraph(paragraph.paragraph_id, {
                            behavior: "auto",
                            recentActionMessage: `已从搜索命中跳到第 ${paragraph.page_no} 页段落。`,
                          })
                        }
                      >
                        <span className="reader-status-badge tone-info">第 {paragraph.page_no} 页</span>
                        <span>{paragraph.text.slice(0, 84)}{paragraph.text.length > 84 ? "..." : ""}</span>
                      </button>
                    ))}
                  </div>
                  {allSearchMatches.length > quickSearchMatches.length ? (
                    <div className="subtle" style={{ marginTop: 8 }}>
                      当前仅展示前 {quickSearchMatches.length} 个命中，剩余结果可继续通过“上一处 / 下一处”顺序跳转。
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="subtle">
                  {locatorQuery.trim()
                    ? "当前关键词还没有命中可跳转的段落。"
                    : "先输入关键词并定位一次，这里会出现可快速跳转的命中列表。"}
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {reader.pdf_downloaded && figureFlowItems.length > 0 ? (
        <Card className="paper-reader-figure-flow" data-testid="reader-figure-first-flow">
          <div className="paper-reader-header" style={{ alignItems: "center" }}>
            <div>
              <h3 className="title" style={{ fontSize: 18 }}>
                图表优先阅读
              </h3>
              <p className="subtle" style={{ margin: "4px 0 0" }}>
                适合先扫图、再回正文锚点。先看关键图，再核对段落里的论证和术语。
              </p>
            </div>
            <div className="reader-status-row">
              <span className="reader-status-badge tone-focus">全文图像 {orderedFigures.length} 张</span>
              <span className="reader-status-badge tone-info">覆盖页面 {figurePages.length} 页</span>
              {figurePages[0] ? <span className="reader-status-badge tone-success">建议先看第 {figurePages[0]} 页</span> : null}
            </div>
          </div>

          <div className="reader-figure-flow-grid" data-testid="reader-figure-flow-list">
            {figureFlowItems.map((item) => (
              <div
                key={item.figure.figure_id}
                className={`reader-figure-flow-card${item.currentPage ? " active" : ""}`}
                data-testid={`reader-figure-flow-item-${item.figure.figure_id}`}
              >
                <div className="reader-figure-flow-top">
                  <strong>图 {item.figure.figure_id} · 第 {item.figure.page_no} 页</strong>
                  <span className="subtle">{item.figure.match_mode === "caption" ? "caption 锚定" : "近似定位"}</span>
                </div>
                <div className="subtle">
                  {item.figure.caption_text
                    ? compactTextPreview(item.figure.caption_text, 110)
                    : "当前图像暂无 caption，建议先看图，再回原版页面确认上下文。"}
                </div>
                <div className="subtle">
                  {item.anchorParagraph
                    ? `正文锚点：${compactTextPreview(item.anchorParagraph.text, 96)}`
                    : `当前还没有稳定正文锚点，可先切到第 ${item.figure.page_no} 页原版页面。`}
                </div>
                <div className="subtle">{item.scanHint.trim()}</div>
                <div className="reader-inline-action-row">
                  <Button
                    className="secondary"
                    type="button"
                    data-testid={`reader-figure-flow-open-${item.figure.figure_id}`}
                    onClick={() => openFigureForScan(item.figure)}
                  >
                    先看图
                  </Button>
                  <Button
                    className="secondary"
                    type="button"
                    data-testid={`reader-figure-flow-anchor-${item.figure.figure_id}`}
                    onClick={() => openFigureAnchor(item)}
                  >
                    {item.anchorParagraph ? "回到正文锚点" : "切到该页"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {figureFlowOverflowCount > 0 ? (
            <div className="reader-figure-flow-overflow subtle" data-testid="reader-figure-flow-overflow">
              当前图流只展示前 {figureFlowItems.length} 张，剩余 {figureFlowOverflowCount} 张请继续通过“图像跳转”、页面图集或原版页面查看，避免多图论文把首页卡片拉得过长。
            </div>
          ) : null}
        </Card>
      ) : null}

      {reader.pdf_downloaded && pageNumbers.length > 0 ? (
        <Card className="paper-reader-current-page-card">
          <div className="paper-reader-header" style={{ alignItems: "center" }}>
            <div>
              <h3 className="title" style={{ fontSize: 18 }}>
                当前页概览
              </h3>
              <p className="subtle" style={{ margin: "4px 0 0" }}>
                原版页面为主阅读视图；辅助文本用于选词翻译、搜索定位与批注。
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                className="select"
                value={textWidthPreference}
                data-testid="reader-preference-width"
                onChange={(event) => setTextWidthPreference(event.target.value as PaperReaderTextWidth)}
              >
                <option value="focused">阅读宽度 · 专注</option>
                <option value="standard">阅读宽度 · 标准</option>
                <option value="wide">阅读宽度 · 舒展</option>
              </select>
              <select
                className="select"
                value={textDensityPreference}
                data-testid="reader-preference-density"
                onChange={(event) => setTextDensityPreference(event.target.value as PaperReaderTextDensity)}
              >
                <option value="comfortable">阅读密度 · 舒展</option>
                <option value="standard">阅读密度 · 标准</option>
                <option value="compact">阅读密度 · 紧凑</option>
              </select>
              <select
                className="select"
                data-testid="reader-zoom-select"
                value={String(zoomPercent)}
                onChange={(event) => setZoomPercent(Number(event.target.value))}
                disabled={viewMode !== "page"}
              >
                {ZOOM_OPTIONS.map((zoom) => (
                  <option key={zoom} value={zoom}>
                    缩放 {zoom}%
                  </option>
                ))}
              </select>
              <Button className="secondary" type="button" onClick={() => setFigurePanelOpen(true)}>
                本页图像 ({currentPageFigures.length})
              </Button>
              <Button className="secondary" type="button" onClick={openOriginalPdf}>
                打开原始 PDF
              </Button>
              <Button className="secondary" type="button" onClick={() => void handleDownload()} disabled={downloading}>
                {downloading ? "正在重建..." : "重建阅读缓存"}
              </Button>
            </div>
          </div>

          <div className="subtle" style={{ marginTop: 8 }}>
            阅读宽度与密度偏好会保存在本机，后续打开论文时继续生效。
          </div>

          {reader.pages.length > 0 ? (
            <>
              {isPagePreviewWindowed ? (
                <div className="page-preview-strip-note subtle" data-testid="reader-page-preview-windowed-hint">
                  长文档性能模式：当前仅渲染关键页缩略图，共 {renderedPagePreviewCount} / {reader.pages.length} 页；完整跳页仍可通过上方页码下拉框完成。
                </div>
              ) : null}
              <div
                className={`page-preview-strip${isPagePreviewWindowed ? " windowed" : ""}`}
                data-testid="reader-page-preview-strip"
              >
                {pagePreviewStripItems.map((item) =>
                  item.kind === "gap" ? (
                    <div key={item.key} className="page-preview-gap" aria-hidden="true">
                      <span>省略 {item.skippedCount} 页</span>
                    </div>
                  ) : (
                    <button
                      key={item.page.page_no}
                      type="button"
                      className={`page-preview-card${item.page.page_no === effectivePageNo ? " active" : ""}`}
                      data-testid={`reader-page-preview-${item.page.page_no}`}
                      onClick={() => goToPage(item.page.page_no)}
                    >
                      <img
                        src={resolveApiAssetUrl(item.page.thumbnail_url || item.page.image_url)}
                        alt={`第 ${item.page.page_no} 页缩略图`}
                        className="page-preview-image"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="page-preview-footer">
                        <strong>第 {item.page.page_no} 页</strong>
                        <span className="subtle">点击切到该页</span>
                      </div>
                    </button>
                  ),
                )}
              </div>
            </>
          ) : null}
        </Card>
      ) : null}

      {viewMode === "page" ? (
        <Card>
          {currentPagePreview ? (
            <div className="paper-reader-page-shell">
              <div className="paper-reader-page-scroll">
                <button
                  type="button"
                  className="paper-reader-page-image-button"
                  style={{ width: `${zoomPercent}%` }}
                  onClick={() => openCurrentPagePreview(currentPagePreview)}
                >
                  <img
                    src={resolveApiAssetUrl(currentPagePreview.image_url)}
                    alt={`第 ${currentPagePreview.page_no} 页原版页面`}
                    className="paper-reader-page-image"
                    loading="eager"
                    decoding="async"
                  />
                </button>
              </div>
              <div className="subtle" style={{ textAlign: "center" }}>
                点击页面可放大查看。公式、版式与图文关系请以原版页面为准。
              </div>
            </div>
          ) : (
            <EmptyState
              title="当前未生成原版页面预览"
              hint="可先切到辅助文本继续阅读；如果问题持续存在，可尝试重建阅读缓存。"
            />
          )}
        </Card>
      ) : null}

      {viewMode === "text" ? (
        <Card>
          {currentPageParagraphs.length > 0 ? (
            <div
              className="paper-reader-text-shell"
              data-reader-width={textWidthPreference}
              data-reader-density={textDensityPreference}
            >
              {activeQuoteContext ? (
                <div className="reader-selection-context" data-testid="reader-selection-context">
                  <div className="reader-selection-context-top">
                    <div>
                      <strong>{selection ? "当前选区已就绪" : "引用原文已保留"}</strong>
                      <div className="subtle" style={{ marginTop: 4 }}>
                        {selection
                          ? "滚动后也可以继续翻译、写批注或回到引用段落，不必重新选区。"
                          : "当前引用原文会继续跟随批注和证据操作，直到你手动清空。"}
                      </div>
                    </div>
                    <span className="reader-chip">段落 #{activeQuoteContext.paragraphId}</span>
                  </div>
                  <p className="reader-selection-context-text" data-testid="reader-selection-context-text">
                    {compactTextPreview(activeQuoteContext.text, 220)}
                  </p>
                  <div className="reader-inline-action-row">
                    <Button
                      className="secondary"
                      type="button"
                      data-testid="reader-selection-context-translate"
                      onClick={() => void handleTranslateSelection(activeQuoteContext)}
                      disabled={translationLoading}
                    >
                      {translationLoading ? "翻译中..." : "翻译这段原文"}
                    </Button>
                    <Button
                      className="secondary"
                      type="button"
                      data-testid="reader-selection-context-annotate"
                      onClick={() => continueQuoteIntoAnnotation(activeQuoteContext)}
                    >
                      继续写批注
                    </Button>
                    <Button
                      className="secondary"
                      type="button"
                      data-testid="reader-selection-context-focus"
                      onClick={() => focusQuoteContextParagraph(activeQuoteContext)}
                    >
                      回到引用段落
                    </Button>
                    {projectId ? (
                      <Button
                        className="secondary"
                        type="button"
                        data-testid="reader-selection-context-evidence"
                        onClick={() => void handleAddEvidenceToProject()}
                        disabled={projectEvidenceSaving}
                      >
                        {projectEvidenceSaving ? "加入中..." : "加入证据板"}
                      </Button>
                    ) : null}
                    <Button
                      className="secondary"
                      type="button"
                      data-testid="reader-selection-context-clear"
                      onClick={() => clearQuoteContext()}
                    >
                      清空引用原文
                    </Button>
                  </div>
                </div>
              ) : null}

              <div
                ref={articleRef}
                className="paper-reader-text-article"
                data-testid="reader-text-article"
                data-reader-width={textWidthPreference}
                data-reader-density={textDensityPreference}
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
              >
                <div className="paper-reader-text-meta">
                  第 {effectivePageNo} 页 · 当前为辅助文本模式，可选词翻译、搜索定位与记录批注
                </div>
                <div className="paper-reader-text-overview" data-testid="reader-text-overview">
                  <div className="paper-reader-text-overview-grid">
                    <div className="paper-reader-text-overview-stat">
                      <span className="paper-reader-text-overview-label">正文段落</span>
                      <strong className="paper-reader-text-overview-value">{currentPageBodyCount} 段</strong>
                    </div>
                    <div className="paper-reader-text-overview-stat">
                      <span className="paper-reader-text-overview-label">章节锚点</span>
                      <strong className="paper-reader-text-overview-value">{currentPageHeadingCount} 处</strong>
                    </div>
                    <div className="paper-reader-text-overview-stat">
                      <span className="paper-reader-text-overview-label">图示 / 公式</span>
                      <strong className="paper-reader-text-overview-value">{currentPageSupportCount} 处</strong>
                    </div>
                    <div className="paper-reader-text-overview-stat">
                      <span className="paper-reader-text-overview-label">待回看</span>
                      <strong className="paper-reader-text-overview-value">{currentPageRevisitCount} 段</strong>
                    </div>
                  </div>
                  <div className="paper-reader-text-overview-note">{textModePageHint}</div>
                </div>
                <div className="paper-reader-text-flow">
                  {currentPageParagraphs.map((paragraph) => {
                    const isActive = activeParagraphId === paragraph.paragraph_id;
                    const isMatched = matchedParagraphIds.includes(paragraph.paragraph_id);
                    const hasAnnotation = currentPageAnnotations.some((item) => item.paragraph_id === paragraph.paragraph_id);
                    const className = [
                      "reader-text-block",
                      `reader-text-block-${paragraph.kind}`,
                      isActive ? "reader-text-block-active" : "",
                      isMatched ? "reader-text-block-match" : "",
                      hasAnnotation ? "reader-text-block-annotated" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return renderParagraph(
                      paragraph,
                      className,
                      buildParagraphStatusBadges(paragraph),
                      (element) => {
                        paragraphRefs.current[paragraph.paragraph_id] = element;
                      },
                      () => {
                        flushSync(() => setActiveParagraphId(paragraph.paragraph_id));
                        updateReaderUrl(paragraph.paragraph_id);
                      },
                    );
                  })}
                </div>
              </div>

              <div className="paper-reader-text-tools">
                <div ref={annotationPanelRef} className="paper-reader-annotation-panel">
                  <div className="paper-reader-header" style={{ alignItems: "center" }}>
                    <div>
                      <h4 className="title" style={{ fontSize: 17, margin: 0 }}>
                        批注工作台
                      </h4>
                      <p className="subtle" style={{ margin: "6px 0 0" }}>
                        把批注按待处理与已沉淀分开整理；点击任一条都能回到对应段落继续处理。
                      </p>
                    </div>
                    <span className="reader-chip">全文 {totalAnnotationCount} 条</span>
                  </div>

                  {activeParagraph ? (
                    <div className="reader-annotation-quote">
                      <div className="subtle">当前选中段落</div>
                      <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                        {activeParagraph.text.slice(0, 220)}
                        {activeParagraph.text.length > 220 ? "..." : ""}
                      </p>
                    </div>
                  ) : null}

                  {selectedQuoteForAnnotation ? (
                    <div className="reader-annotation-quote" data-testid="reader-annotation-quote">
                      <div className="subtle">将随批注保存的引用原文</div>
                      <p data-testid="reader-annotation-quote-text" style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                        {selectedQuoteForAnnotation}
                      </p>
                      <div className="reader-inline-action-row">
                        {activeQuoteContext ? (
                          <Button
                            className="secondary"
                            type="button"
                            onClick={() => void handleTranslateSelection(activeQuoteContext)}
                            disabled={translationLoading}
                          >
                            {translationLoading ? "翻译中..." : "翻译这段原文"}
                          </Button>
                        ) : null}
                        {projectId ? (
                          <Button
                            className="secondary"
                            type="button"
                            onClick={() => void handleAddEvidenceToProject()}
                            disabled={projectEvidenceSaving}
                          >
                            {projectEvidenceSaving ? "加入中..." : "把这段加入证据板"}
                          </Button>
                        ) : null}
                        <Button className="secondary" type="button" onClick={() => clearQuoteContext()}>
                          清空引用原文
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="subtle">
                      你可以先在正文中选中英文句子，再进行翻译、写批注或加入证据；系统会尽量保留引用原文，避免重复选区。
                    </div>
                  )}

                  <textarea
                    ref={annotationTextareaRef}
                    className="textarea"
                    placeholder="记录这一段对你的启发、疑问、复现提醒，或后续要查证的点。"
                    value={annotationDraft}
                    onChange={(event) => setAnnotationDraft(event.target.value)}
                  />
                  <div className="reader-inline-action-row" style={{ justifyContent: "space-between" }}>
                    {activeParagraph ? (
                      <Button
                        className="secondary"
                        type="button"
                        data-testid="reader-toggle-revisit"
                        onClick={() => {
                          toggleRevisitParagraph(activeParagraph.paragraph_id);
                          setRecentAction({
                            kind: "locate",
                            message: revisitParagraphIdSet.has(activeParagraph.paragraph_id)
                              ? "已从待回看列表移除当前段落。"
                              : "已把当前段落加入待回看列表。",
                            paragraphId: activeParagraph.paragraph_id,
                          });
                        }}
                      >
                        {revisitParagraphIdSet.has(activeParagraph.paragraph_id) ? "取消待回看" : "标记待回看"}
                      </Button>
                    ) : <span />}
                    <Button type="button" onClick={() => void handleCreateAnnotation()} disabled={annotationSaving}>
                      {annotationSaving ? "正在保存..." : "保存当前段落批注"}
                    </Button>
                  </div>

                  {projectId ? (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button
                        className="secondary"
                        type="button"
                        data-testid="reader-add-project-evidence"
                        onClick={() => void handleAddEvidenceToProject()}
                        disabled={projectEvidenceSaving}
                      >
                        {projectEvidenceSaving ? "加入项目中..." : "加入当前项目证据板"}
                      </Button>
                    </div>
                  ) : null}

                  <div className="reader-annotation-workbench" data-testid="reader-annotation-workbench">
                    <div className="reader-annotation-summary-grid">
                      <div className="reader-annotation-summary-card" data-testid="reader-annotation-summary-pending">
                        <span className="reader-annotation-summary-label">待处理</span>
                        <strong className="reader-annotation-summary-value">{pendingAnnotationItems.length} 条</strong>
                        <div className="subtle">
                          待回看 {pendingRevisitAnnotationCount} 条
                          {projectId ? ` · 待进证据 ${pendingProjectAnnotationCount} 条` : ""}
                        </div>
                      </div>
                      <div className="reader-annotation-summary-card">
                        <span className="reader-annotation-summary-label">当前页</span>
                        <strong className="reader-annotation-summary-value">{activePageAnnotationCount} 条</strong>
                        <div className="subtle">当前焦点 {activeParagraphAnnotations.length} 条</div>
                      </div>
                      <div className="reader-annotation-summary-card" data-testid="reader-annotation-summary-evidence">
                        <span className="reader-annotation-summary-label">{projectId ? "已进证据" : "已沉淀"}</span>
                        <strong className="reader-annotation-summary-value">
                          {projectId ? `${evidenceLinkedAnnotationCount} 条` : `${resolvedAnnotationItems.length} 条`}
                        </strong>
                        <div className="subtle">
                          {projectId ? "按当前项目证据联动判断" : "当前按待回看状态判断"}
                        </div>
                      </div>
                    </div>

                    <div className="reader-annotation-section">
                      <div className="reader-annotation-section-head">
                        <strong>待处理批注</strong>
                        <span className="reader-chip">{pendingAnnotationItems.length} 条</span>
                      </div>
                      {pendingAnnotationItems.length > 0 ? (
                        <div className="paper-reader-annotation-list" data-testid="reader-pending-annotations">
                          {pendingAnnotationItems.slice(0, 8).map((item) => renderAnnotationWorkbenchButton(item))}
                        </div>
                      ) : (
                        <EmptyState
                          title="当前没有待处理批注"
                          hint={projectId ? "已保存的批注要么已经沉淀进证据，要么没有被标成待回看。" : "把段落标成待回看后，这里会优先显示需要继续处理的批注。"}
                        />
                      )}
                    </div>

                    <div className="reader-annotation-section">
                      <div className="reader-annotation-section-head">
                        <strong>当前页批注</strong>
                        <span className="reader-chip">第 {effectivePageNo} 页 · {activePageAnnotationCount} 条</span>
                      </div>
                      {currentPageAnnotations.length > 0 ? (
                        <div className="paper-reader-annotation-list" data-testid="reader-current-page-annotations">
                          {annotationWorkbenchItems
                            .filter((item) => item.currentPage)
                            .map((item) => renderAnnotationWorkbenchButton(item))}
                        </div>
                      ) : (
                        <EmptyState title="当前页还没有批注" hint="选中正文并写下你的想法后，这里会显示当前页的批注记录。" />
                      )}
                    </div>

                    <div className="reader-annotation-section">
                      <div className="reader-annotation-section-head">
                        <strong>最近已沉淀</strong>
                        <span className="reader-chip">{resolvedAnnotationItems.length} 条</span>
                      </div>
                      {resolvedAnnotationItems.length > 0 ? (
                        <div className="paper-reader-annotation-list" data-testid="reader-resolved-annotations">
                          {resolvedAnnotationItems.slice(0, 6).map((item) => renderAnnotationWorkbenchButton(item))}
                        </div>
                      ) : (
                        <EmptyState
                          title="还没有已沉淀批注"
                          hint={projectId ? "把批注对应段落加入当前项目证据后，这里会开始累积已沉淀记录。" : "当前阅读器会先用待回看状态区分需要继续处理的批注。"}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="当前页暂无可用辅助文本"
              hint="这不影响你继续阅读原版页面；复杂版式、公式密集页可优先使用原版页面。"
            />
          )}
        </Card>
      ) : null}

      {viewMode === "workspace" ? (
        <PaperWorkspaceView
          paperId={paperId}
          requestedSummaryId={requestedSummaryId}
          initialWorkspace={reader}
          onWorkspaceChanged={loadReader}
          showPaperHeader={false}
          projectId={projectId}
        />
      ) : null}

      {selection && viewMode === "text" ? (
        <div
          className="reader-selection-toolbar"
          data-testid="reader-selection-toolbar"
          style={{ top: selection.top, left: selection.left }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button type="button" className="reader-selection-action" onClick={() => void handleTranslateSelection(selection)}>
            {translationLoading ? "翻译中..." : "英译中"}
          </button>
          <button
            type="button"
            className="reader-selection-action secondary"
            onClick={() => continueQuoteIntoAnnotation(selection)}
          >
            写批注
          </button>
          {projectId ? (
            <button
              type="button"
              className="reader-selection-action secondary"
              data-testid="reader-add-project-evidence-selection"
              onClick={() => void handleAddEvidenceToProject()}
              disabled={projectEvidenceSaving}
            >
              {projectEvidenceSaving ? "加入中..." : "加入证据板"}
            </button>
          ) : null}
        </div>
      ) : null}

      {translationDrawerOpen ? (
        <div className="reader-bottom-drawer" data-testid="reader-translation-drawer">
          <div className="reader-bottom-drawer-header">
            <div>
              <strong>英译中辅助翻译</strong>
              <div className="subtle">翻译结果会保留英文原文，并尽量不打断当前阅读位置。</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    closeTranslationDrawer({ restoreFocus: false });
                    focusAnnotationComposer("翻译结果已保留，可继续写批注。");
                  }}
                >
                继续写批注
              </Button>
              {projectId ? (
                <Button
                  className="secondary"
                  type="button"
                  onClick={() => void handleAddEvidenceToProject()}
                  disabled={projectEvidenceSaving}
                >
                  {projectEvidenceSaving ? "加入中..." : "加入当前项目证据板"}
                </Button>
              ) : null}
                <Button
                  className="secondary"
                  type="button"
                  data-testid="reader-translation-close"
                  onClick={() => {
                    closeTranslationDrawer({ clearContent: true });
                  }}
                >
                  关闭
              </Button>
            </div>
          </div>

          <div className="reader-bottom-drawer-body">
            <div className="reader-translation-card">
              <div>
                <div className="subtle">选中原文</div>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                  {translation?.content_en_snapshot || pinnedQuote?.text || selection?.text || "正在准备翻译内容..."}
                </p>
              </div>
              <div>
                <div className="subtle">中文翻译</div>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                  {translation?.content_zh || streamingTranslationText || "正在流式生成中文翻译..."}
                </p>
              </div>
              <div className="subtle">
                {translation?.disclaimer || "当前正在流式生成翻译结果，英文原文始终保留。"}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {figurePanelOpen ? (
        <div className="reader-lightbox-overlay" onClick={() => closeFigurePanel()}>
          <div className="reader-lightbox reader-figure-panel" data-testid="reader-figure-panel" onClick={(event) => event.stopPropagation()}>
            <div className="paper-reader-header" style={{ alignItems: "center" }}>
              <div>
                <h4 className="title" style={{ fontSize: 18, margin: 0 }}>
                  本页图集
                </h4>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  第 {effectivePageNo} 页 · 共 {currentPageFigures.length} 张图像
                </p>
              </div>
              <Button className="secondary" type="button" onClick={() => closeFigurePanel()}>
                关闭
              </Button>
            </div>
            {currentPageFigures.length === 0 ? (
              <EmptyState title="本页暂无图像" hint="切换到其他页后，可在这里查看该页图集。" />
            ) : (
              <div className="reader-figure-panel-grid">
                {currentPageFigures.map((figure) => (
                  <FigureCard key={figure.figure_id} figure={figure} onOpen={openFigurePreview} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {lightbox ? (
        <div className="reader-lightbox-overlay" onClick={() => closeLightbox()}>
          <div className="reader-lightbox" data-testid="reader-lightbox" onClick={(event) => event.stopPropagation()}>
            <div className="paper-reader-header" style={{ alignItems: "center" }}>
              <div>
                <h4 className="title" style={{ fontSize: 18, margin: 0 }}>
                  {lightbox.title}
                </h4>
                {lightbox.caption ? <p className="subtle" style={{ margin: "6px 0 0" }}>{lightbox.caption}</p> : null}
              </div>
              <Button className="secondary" type="button" onClick={() => closeLightbox()}>
                关闭
              </Button>
            </div>
            <img src={lightbox.src} alt={lightbox.title} className="reader-lightbox-image" decoding="async" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

