"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  getPaperPdfUrl,
  getPaperReader,
  resolveApiAssetUrl,
  translateSegmentStream,
} from "@/lib/api";
import { formatDateTime } from "@/lib/presentation";
import { paperReaderPath, projectPath } from "@/lib/routes";
import { readingStatusLabel, reproInterestLabel } from "@/lib/researchState";
import {
  PaperAnnotation,
  PaperReader,
  PaperReaderFigure,
  PaperReaderPagePreview,
  PaperReaderParagraph,
  TranslationResult,
} from "@/lib/types";

type ReaderMode = "page" | "text" | "workspace";

type SelectionContext = {
  text: string;
  paragraphId: number;
  top: number;
  left: number;
};

type FocusParagraphOptions = {
  behavior?: ScrollBehavior;
  updateUrl?: boolean;
  switchToText?: boolean;
};

type LightboxState = {
  src: string;
  title: string;
  caption?: string;
};

const ZOOM_OPTIONS = [100, 115, 130, 150];

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
  refCallback: (element: HTMLDivElement | null) => void,
  onClick: () => void,
) {
  if (paragraph.kind === "heading") {
    return (
      <div key={paragraph.paragraph_id} ref={refCallback} data-paragraph-id={paragraph.paragraph_id} data-testid={`reader-paragraph-${paragraph.paragraph_id}`} className={className} onClick={onClick}>
        <h3 className="reader-text-heading">{paragraph.text}</h3>
      </div>
    );
  }

  if (paragraph.kind === "formula") {
    return (
      <div key={paragraph.paragraph_id} ref={refCallback} data-paragraph-id={paragraph.paragraph_id} data-testid={`reader-paragraph-${paragraph.paragraph_id}`} className={className} onClick={onClick}>
        <div className="reader-text-formula-label">公式区</div>
        <pre className="reader-text-formula">{paragraph.text}</pre>
        <div className="subtle">公式与复杂排版请以原版页面为准。</div>
      </div>
    );
  }

  if (paragraph.kind === "caption") {
    return (
      <div key={paragraph.paragraph_id} ref={refCallback} data-paragraph-id={paragraph.paragraph_id} data-testid={`reader-paragraph-${paragraph.paragraph_id}`} className={className} onClick={onClick}>
        <p className="reader-text-caption">{paragraph.text}</p>
      </div>
    );
  }

  return (
    <div key={paragraph.paragraph_id} ref={refCallback} data-paragraph-id={paragraph.paragraph_id} data-testid={`reader-paragraph-${paragraph.paragraph_id}`} className={className} onClick={onClick}>
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
  const router = useRouter();
  const articleRef = useRef<HTMLDivElement | null>(null);
  const paragraphRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const initialTargetAppliedRef = useRef(false);
  const pendingFocusRef = useRef<{ paragraphId: number; behavior: ScrollBehavior } | null>(null);

  const [reader, setReader] = useState<PaperReader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewMode, setViewMode] = useState<ReaderMode>("page");
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [streamingTranslationText, setStreamingTranslationText] = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [figurePanelOpen, setFigurePanelOpen] = useState(false);
  const [currentPageNo, setCurrentPageNo] = useState<number | null>(null);
  const [activeParagraphId, setActiveParagraphId] = useState<number | null>(requestedParagraphId);
  const [locatorQuery, setLocatorQuery] = useState("");
  const [locatorError, setLocatorError] = useState("");
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [projectEvidenceSaving, setProjectEvidenceSaving] = useState(false);
  const [translationDrawerOpen, setTranslationDrawerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);

  const loadReader = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await getPaperReader(paperId);
      setReader(payload);
    } catch (loadError) {
      setError((loadError as Error).message || "论文阅读页加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    void loadReader();
  }, [loadReader]);

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

  useEffect(() => {
    if (!reader) return;

    if (!initialTargetAppliedRef.current && requestedParagraphId) {
      const target = paragraphMap.get(requestedParagraphId);
      initialTargetAppliedRef.current = true;
      if (target) {
        setViewMode("text");
        setCurrentPageNo(target.page_no);
        setActiveParagraphId(target.paragraph_id);
        pendingFocusRef.current = { paragraphId: target.paragraph_id, behavior: "auto" };
        setNotice("已定位到指定段落，当前已切到辅助文本模式。");
        return;
      }
    }

    const firstPage = pageNumbers[0] ?? 1;
    setCurrentPageNo((previous) => (previous && pageIndexMap.has(previous) ? previous : firstPage));
  }, [pageIndexMap, pageNumbers, paragraphMap, reader, requestedParagraphId]);

  const effectivePageNo = currentPageNo ?? pageNumbers[0] ?? 1;
  const currentPagePreview = (reader?.pages ?? []).find((page) => page.page_no === effectivePageNo) ?? null;
  const currentPageParagraphs = paragraphsByPage.get(effectivePageNo) ?? [];
  const currentPageParagraphIds = new Set(currentPageParagraphs.map((paragraph) => paragraph.paragraph_id));
  const currentPageFigures = (reader?.figures ?? []).filter((figure) => figure.page_no === effectivePageNo);
  const currentPageAnnotations = (reader?.annotations ?? []).filter((annotation) =>
    currentPageParagraphIds.has(annotation.paragraph_id),
  );
  const activeParagraph = activeParagraphId ? paragraphMap.get(activeParagraphId) ?? null : null;
  const currentPageIndex = pageIndexMap.get(effectivePageNo) ?? 0;
  const matchedParagraphIds = useMemo(() => {
    if (!locatorQuery.trim()) return [];
    const normalizedQuery = locatorQuery.trim().toLowerCase();
    return currentPageParagraphs
      .filter((paragraph) => paragraph.text.toLowerCase().includes(normalizedQuery))
      .map((paragraph) => paragraph.paragraph_id);
  }, [currentPageParagraphs, locatorQuery]);

  const selectedQuoteForAnnotation =
    selection && activeParagraphId && selection.paragraphId === activeParagraphId ? selection.text : "";

  useEffect(() => {
    if (!currentPageParagraphs.length) return;
    if (activeParagraphId && currentPageParagraphIds.has(activeParagraphId)) return;
    setActiveParagraphId(currentPageParagraphs[0]?.paragraph_id ?? null);
  }, [activeParagraphId, currentPageParagraphIds, currentPageParagraphs]);

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (viewMode === "workspace") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (target?.isContentEditable) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepPage(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepPage(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, currentPageIndex, pageNumbers]);

  function updateReaderUrl(paragraphId?: number | null) {
    router.replace(paperReaderPath(paperId, requestedSummaryId, paragraphId ?? undefined, projectId ?? undefined), { scroll: false });
  }

  function goToPage(pageNo: number) {
    if (!pageIndexMap.has(pageNo)) return;
    setCurrentPageNo(pageNo);
    setSelection(null);
    setLocatorError("");
    const firstParagraph = (paragraphsByPage.get(pageNo) ?? [])[0] ?? null;
    setActiveParagraphId(firstParagraph?.paragraph_id ?? null);
    if (viewMode === "text" && firstParagraph) {
      pendingFocusRef.current = { paragraphId: firstParagraph.paragraph_id, behavior: "smooth" };
    }
    updateReaderUrl(null);
  }

  function stepPage(direction: -1 | 1) {
    const nextIndex = currentPageIndex + direction;
    if (nextIndex < 0 || nextIndex >= pageNumbers.length) return;
    goToPage(pageNumbers[nextIndex]);
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
  }

  function captureSelection() {
    const currentSelection = window.getSelection();
    if (!currentSelection || currentSelection.rangeCount === 0) {
      setSelection(null);
      return;
    }

    const text = currentSelection.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const article = articleRef.current;
    const range = currentSelection.getRangeAt(0);
    const commonNode = range.commonAncestorContainer;
    const sourceElement = commonNode instanceof Element ? commonNode : commonNode.parentElement;
    if (!article || !sourceElement || !article.contains(sourceElement)) {
      setSelection(null);
      return;
    }

    const paragraphElement = sourceElement.closest<HTMLElement>("[data-paragraph-id]");
    if (!paragraphElement) {
      setSelection(null);
      return;
    }

    const paragraphId = Number(paragraphElement.dataset.paragraphId);
    if (!Number.isFinite(paragraphId)) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    setSelection({
      text,
      paragraphId,
      top: Math.max(rect.bottom + 8, 80),
      left: Math.max(Math.min(rect.left, window.innerWidth - 220), 16),
    });
    setTranslationError("");
    setActiveParagraphId(paragraphId);
  }

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

  async function handleTranslateSelection() {
    if (!selection) return;

    setTranslationLoading(true);
    setTranslationError("");
    setStreamingTranslationText("");
    setTranslation(null);
    setTranslationDrawerOpen(true);

    try {
      const result = await translateSegmentStream(
        {
          text: selection.text,
          mode: "selection",
          locator: {
            paper_id: paperId,
            paragraph_id: selection.paragraphId,
            selected_text: selection.text,
          },
        },
        {
          onDelta: (delta) => setStreamingTranslationText((previous) => `${previous}${delta}`),
        },
      );
      setTranslation(result);
      setStreamingTranslationText(result.content_zh);
      focusParagraph(selection.paragraphId, { behavior: "auto" });
      setNotice("已完成英译中辅助翻译，并回到当前段落。");
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
      await createPaperAnnotation(paperId, {
        paragraph_id: activeParagraphId,
        selected_text: selectedQuoteForAnnotation,
        note_text: annotationDraft.trim(),
      });
      setAnnotationDraft("");
      setNotice("当前段落批注已保存。");
      await loadReader();
      focusParagraph(activeParagraphId, { behavior: "auto", updateUrl: false });
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

    const paragraphId = activeParagraphId ?? selection?.paragraphId ?? null;
    const excerpt = (selectedQuoteForAnnotation || selection?.text || activeParagraph?.text || "").trim();

    if (!paragraphId || !excerpt) {
      setLocatorError("请先选中文本，或先激活一个段落。");
      return;
    }

    setProjectEvidenceSaving(true);
    setLocatorError("");
    try {
      await createProjectEvidence(projectId, {
        paper_id: paperId,
        paragraph_id: paragraphId,
        kind: "claim",
        excerpt,
        note_text: annotationDraft.trim(),
        source_label: activeParagraph ? `Reader paragraph p.${activeParagraph.page_no}` : "Reader selection",
      });
      setNotice("已加入当前项目证据板。");
      setAnnotationDraft("");
    } catch (projectError) {
      setLocatorError((projectError as Error).message || "加入项目证据板失败，请稍后重试。");
    } finally {
      setProjectEvidenceSaving(false);
    }
  }

  function handleLocateParagraph() {
    const query = locatorQuery.trim();
    if (!query || !reader) {
      setLocatorError("请输入关键词后再定位。");
      return;
    }

    const target = reader.paragraphs.find((paragraph) => paragraph.text.toLowerCase().includes(query.toLowerCase()));
    if (!target) {
      setLocatorError(`辅助文本中暂未找到“${query}”。`);
      return;
    }

    setLocatorError("");
    focusParagraph(target.paragraph_id);
    setNotice(`已定位到第 ${target.page_no} 页相关段落。`);
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

  return (
    <div className="paper-reader-shell">
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
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {projectId ? (
              <Button className="secondary" type="button" data-testid="reader-return-project" onClick={() => router.push(projectPath(projectId))}>
                返回项目工作台
              </Button>
            ) : null}
            <Button className={viewMode === "page" ? "" : "secondary"} type="button" data-testid="reader-mode-page" onClick={() => setViewMode("page")}>
              原版页面
            </Button>
            <Button className={viewMode === "text" ? "" : "secondary"} type="button" data-testid="reader-mode-text" onClick={() => setViewMode("text")}>
              辅助文本
            </Button>
            <Button
              className={viewMode === "workspace" ? "" : "secondary"}
              type="button"
              data-testid="reader-mode-workspace"
              onClick={() => setViewMode("workspace")}
            >
              论文工作区
            </Button>
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
          <EmptyState
            title="当前尚未下载 PDF"
            hint="你仍可先查看 abstract 与研究状态；下载 PDF 后即可进入原版页面阅读、辅助文本与本页图像。"
          />
          <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
            <Button type="button" onClick={() => void handleDownload()} disabled={downloading}>
              {downloading ? "正在下载 PDF..." : "下载 PDF 并生成阅读视图"}
            </Button>
          </div>
        </Card>
      ) : null}

      {reader.pdf_downloaded ? (
        <Card className="paper-reader-locator">
          <div className="paper-reader-locator-row">
            <strong>
              当前模式：
              {viewMode === "page" ? "原版页面" : viewMode === "text" ? "辅助文本" : "论文工作区"}
            </strong>
            <span className="subtle">当前页 {effectivePageNo} / 共 {pageNumbers.length || 0} 页</span>
            <span className="subtle">本页图像 {currentPageFigures.length} 张</span>
            <span className="subtle">本页批注 {activePageAnnotationCount} 条</span>
          </div>

          <div className="paper-reader-locator-row">
            <Button className="secondary" type="button" disabled={currentPageIndex <= 0} onClick={() => stepPage(-1)}>
              上一页
            </Button>
            <select className="select" value={String(effectivePageNo)} onChange={(event) => goToPage(Number(event.target.value))}>
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
              className="input"
              style={{ minWidth: 280, flex: 1 }}
              placeholder="按关键词定位辅助文本，例如 baseline、dataset、ablation"
              value={locatorQuery}
              onChange={(event) => {
                setLocatorQuery(event.target.value);
                setLocatorError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleLocateParagraph();
                }
              }}
            />
            <Button type="button" onClick={handleLocateParagraph}>
              定位关键词
            </Button>
          </div>
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

          {reader.pages.length > 0 ? (
            <div className="page-preview-strip">
              {reader.pages.map((page) => (
                <button
                  key={page.page_no}
                  type="button"
                  className={`page-preview-card${page.page_no === effectivePageNo ? " active" : ""}`}
                  onClick={() => goToPage(page.page_no)}
                >
                  <img
                    src={resolveApiAssetUrl(page.thumbnail_url || page.image_url)}
                    alt={`第 ${page.page_no} 页缩略图`}
                    className="page-preview-image"
                  />
                  <div className="page-preview-footer">
                    <strong>第 {page.page_no} 页</strong>
                    <span className="subtle">点击切到该页</span>
                  </div>
                </button>
              ))}
            </div>
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
            <div className="paper-reader-text-shell">
              <div ref={articleRef} className="paper-reader-text-article" data-testid="reader-text-article" onMouseUp={captureSelection} onKeyUp={captureSelection}>
                <div className="paper-reader-text-meta">
                  第 {effectivePageNo} 页 · 当前为辅助文本模式，可选词翻译、搜索定位与记录批注
                </div>
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
                    (element) => {
                      paragraphRefs.current[paragraph.paragraph_id] = element;
                    },
                    () => {
                      setActiveParagraphId(paragraph.paragraph_id);
                      updateReaderUrl(paragraph.paragraph_id);
                    },
                  );
                })}
              </div>

              <div className="paper-reader-text-tools">
                <div className="paper-reader-annotation-panel">
                  <div className="paper-reader-header" style={{ alignItems: "center" }}>
                    <div>
                      <h4 className="title" style={{ fontSize: 17, margin: 0 }}>
                        当前页批注
                      </h4>
                      <p className="subtle" style={{ margin: "6px 0 0" }}>
                        批注仅跟当前段落绑定；点击已有批注可回到对应段落。
                      </p>
                    </div>
                    <span className="reader-chip">当前页 {activePageAnnotationCount} 条</span>
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
                    <div className="reader-annotation-quote">
                      <div className="subtle">将随批注保存的选中原文</div>
                      <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{selectedQuoteForAnnotation}</p>
                    </div>
                  ) : (
                    <div className="subtle">
                      你可以先在正文中选中英文句子，再进行英译中或保存批注，系统会保留引用原文。
                    </div>
                  )}

                  <textarea
                    className="textarea"
                    placeholder="记录这一段对你的启发、疑问、复现提醒，或后续要查证的点。"
                    value={annotationDraft}
                    onChange={(event) => setAnnotationDraft(event.target.value)}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
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

                  {currentPageAnnotations.length > 0 ? (
                    <div className="paper-reader-annotation-list">
                      {currentPageAnnotations.map((item: PaperAnnotation) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`paper-reader-annotation-item${item.paragraph_id === activeParagraphId ? " active" : ""}`}
                          onClick={() => focusParagraph(item.paragraph_id, { behavior: "auto" })}
                        >
                          <strong>{item.selected_text ? "含引用原文" : "纯批注"}</strong>
                          <span className="subtle">{formatDateTime(item.updated_at)}</span>
                          {item.selected_text ? <div className="subtle">{item.selected_text}</div> : null}
                          <div>{item.note_text}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="当前页还没有批注" hint="选中正文并写下你的想法后，这里会显示当前页的批注记录。" />
                  )}
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
        <button
          type="button"
          className="reader-selection-toolbar"
          style={{ top: selection.top, left: selection.left }}
          onClick={() => void handleTranslateSelection()}
        >
          {translationLoading ? "翻译中..." : "英译中"}
        </button>
      ) : null}

      {selection && viewMode === "text" && projectId ? (
        <button
          type="button"
          className="reader-selection-toolbar reader-selection-toolbar-secondary"
          data-testid="reader-add-project-evidence-selection"
          style={{ top: selection.top + 44, left: selection.left }}
          onClick={() => void handleAddEvidenceToProject()}
          disabled={projectEvidenceSaving}
        >
          {projectEvidenceSaving ? "加入中..." : "加入当前项目证据板"}
        </button>
      ) : null}

      {translationDrawerOpen ? (
        <div className="reader-bottom-drawer">
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
                  setTranslationDrawerOpen(false);
                  setStreamingTranslationText("");
                  setTranslation(null);
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
                  {translation?.content_en_snapshot || selection?.text || "正在准备翻译内容..."}
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
        <div className="reader-lightbox-overlay" onClick={() => setFigurePanelOpen(false)}>
          <div className="reader-lightbox reader-figure-panel" onClick={(event) => event.stopPropagation()}>
            <div className="paper-reader-header" style={{ alignItems: "center" }}>
              <div>
                <h4 className="title" style={{ fontSize: 18, margin: 0 }}>
                  本页图集
                </h4>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  第 {effectivePageNo} 页 · 共 {currentPageFigures.length} 张图像
                </p>
              </div>
              <Button className="secondary" type="button" onClick={() => setFigurePanelOpen(false)}>
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
        <div className="reader-lightbox-overlay" onClick={() => setLightbox(null)}>
          <div className="reader-lightbox" onClick={(event) => event.stopPropagation()}>
            <div className="paper-reader-header" style={{ alignItems: "center" }}>
              <div>
                <h4 className="title" style={{ fontSize: 18, margin: 0 }}>
                  {lightbox.title}
                </h4>
                {lightbox.caption ? <p className="subtle" style={{ margin: "6px 0 0" }}>{lightbox.caption}</p> : null}
              </div>
              <Button className="secondary" type="button" onClick={() => setLightbox(null)}>
                关闭
              </Button>
            </div>
            <img src={lightbox.src} alt={lightbox.title} className="reader-lightbox-image" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
