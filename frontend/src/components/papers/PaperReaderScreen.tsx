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
  createPaperAnnotation,
  downloadPaper,
  getPaperPdfUrl,
  getPaperReader,
  resolveApiAssetUrl,
  translateSegmentStream,
} from "@/lib/api";
import { formatDateTime } from "@/lib/presentation";
import { paperReaderPath } from "@/lib/routes";
import { readingStatusLabel, reproInterestLabel } from "@/lib/researchState";
import {
  PaperReader,
  PaperReaderFigure,
  PaperReaderPagePreview,
  TranslationResult,
} from "@/lib/types";

type SelectionContext = {
  text: string;
  paragraphId: number;
  top: number;
  left: number;
};

type FocusParagraphOptions = {
  behavior?: ScrollBehavior;
  updateUrl?: boolean;
};

type LightboxState = {
  src: string;
  title: string;
  caption?: string;
};

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
          alt={figure.caption_text || `论文图像 ${figure.figure_id}`}
          className="reader-figure-image"
        />
      </button>
      <div className="reader-figure-meta">
        <strong>图像 · 第 {figure.page_no} 页</strong>
        {figure.caption_text ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{figure.caption_text}</div>
        ) : (
          <div className="subtle">当前图片暂无可提取 caption。</div>
        )}
        {figure.match_mode === "approximate" ? (
          <div className="subtle">当前位置为近似匹配，便于你快速回看相关图像。</div>
        ) : null}
      </div>
    </div>
  );
}

export default function PaperReaderScreen({
  paperId,
  requestedSummaryId = null,
  requestedParagraphId = null,
}: {
  paperId: number;
  requestedSummaryId?: number | null;
  requestedParagraphId?: number | null;
}) {
  const router = useRouter();
  const articleRef = useRef<HTMLDivElement | null>(null);
  const paragraphRefs = useRef<Record<number, HTMLParagraphElement | null>>({});

  const [reader, setReader] = useState<PaperReader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [streamingTranslationText, setStreamingTranslationText] = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [viewMode, setViewMode] = useState<"reading" | "workspace">("reading");
  const [translationDrawerOpen, setTranslationDrawerOpen] = useState(false);
  const [figurePanelOpen, setFigurePanelOpen] = useState(false);
  const [activeParagraphId, setActiveParagraphId] = useState<number | null>(requestedParagraphId);
  const [currentPageNo, setCurrentPageNo] = useState<number | null>(null);
  const [locatorQuery, setLocatorQuery] = useState("");
  const [locatorError, setLocatorError] = useState("");
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

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

  const summaryStats = useMemo(() => {
    if (!reader) return null;
    return {
      summaryCount: reader.summaries.length,
      reflectionCount: reader.reflections.length,
      taskCount: reader.recent_tasks.length,
    };
  }, [reader]);

  const paragraphIndexMap = useMemo(() => {
    const indexMap = new Map<number, number>();
    (reader?.paragraphs ?? []).forEach((paragraph, index) => {
      indexMap.set(paragraph.paragraph_id, index);
    });
    return indexMap;
  }, [reader?.paragraphs]);

  const paragraphsByPage = useMemo(() => {
    const map = new Map<number, PaperReader["paragraphs"]>();
    (reader?.paragraphs ?? []).forEach((paragraph) => {
      const current = map.get(paragraph.page_no) ?? [];
      current.push(paragraph);
      map.set(paragraph.page_no, current);
    });
    return map;
  }, [reader?.paragraphs]);

  const pageNumbers = useMemo(() => {
    const fromParagraphs = Array.from(paragraphsByPage.keys()).sort((a, b) => a - b);
    if (fromParagraphs.length > 0) return fromParagraphs;
    return Array.from(new Set((reader?.pages ?? []).map((item) => item.page_no))).sort((a, b) => a - b);
  }, [paragraphsByPage, reader?.pages]);

  const pageFirstParagraphMap = useMemo(() => {
    const map = new Map<number, number>();
    pageNumbers.forEach((pageNo) => {
      const paragraphs = paragraphsByPage.get(pageNo) ?? [];
      if (paragraphs[0]) {
        map.set(pageNo, paragraphs[0].paragraph_id);
      }
    });
    return map;
  }, [pageNumbers, paragraphsByPage]);

  const matchedParagraphIds = useMemo(() => {
    const query = locatorQuery.trim().toLowerCase();
    if (!query || !reader) return [];
    return reader.paragraphs
      .filter((paragraph) => paragraph.text.toLowerCase().includes(query))
      .map((paragraph) => paragraph.paragraph_id);
  }, [locatorQuery, reader]);

  const activeParagraph = activeParagraphId
    ? (reader?.paragraphs.find((paragraph) => paragraph.paragraph_id === activeParagraphId) ?? null)
    : null;

  useEffect(() => {
    if (!reader?.paragraphs.length) return;
    if (requestedParagraphId) {
      const requested = reader.paragraphs.find((item) => item.paragraph_id === requestedParagraphId);
      if (requested) {
        setActiveParagraphId(requested.paragraph_id);
        setCurrentPageNo(requested.page_no);
        return;
      }
    }
    if (activeParagraphId) {
      const current = reader.paragraphs.find((item) => item.paragraph_id === activeParagraphId);
      if (current) {
        setCurrentPageNo(current.page_no);
        return;
      }
    }
    const firstParagraph = reader.paragraphs[0];
    setActiveParagraphId(firstParagraph.paragraph_id);
    setCurrentPageNo(firstParagraph.page_no);
  }, [activeParagraphId, reader, requestedParagraphId]);

  const effectivePageNo = currentPageNo ?? activeParagraph?.page_no ?? pageNumbers[0] ?? 1;
  const currentPageParagraphs = useMemo(
    () => paragraphsByPage.get(effectivePageNo) ?? [],
    [effectivePageNo, paragraphsByPage],
  );
  const currentPageParagraphIds = useMemo(
    () => new Set(currentPageParagraphs.map((paragraph) => paragraph.paragraph_id)),
    [currentPageParagraphs],
  );
  const currentPageIndex = pageNumbers.findIndex((pageNo) => pageNo === effectivePageNo);
  const currentPagePreview = (reader?.pages ?? []).find((page) => page.page_no === effectivePageNo) ?? null;
  const currentPageFigures = useMemo(
    () => (reader?.figures ?? []).filter((figure) => figure.page_no === effectivePageNo),
    [effectivePageNo, reader?.figures],
  );
  const currentPageAnnotations = useMemo(
    () => (reader?.annotations ?? []).filter((item) => currentPageParagraphIds.has(item.paragraph_id)),
    [currentPageParagraphIds, reader?.annotations],
  );
  const activeParagraphAnnotations = useMemo(() => {
    if (!reader || !activeParagraphId) return [];
    return reader.annotations.filter((item) => item.paragraph_id === activeParagraphId);
  }, [activeParagraphId, reader]);
  const selectedQuoteForAnnotation =
    selection && selection.paragraphId === activeParagraphId ? selection.text : "";

  const updateReaderUrl = useCallback((paragraphId: number | null) => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", paperReaderPath(paperId, requestedSummaryId, paragraphId));
  }, [paperId, requestedSummaryId]);

  const focusParagraph = useCallback((paragraphId: number, options?: FocusParagraphOptions) => {
    const paragraph = reader?.paragraphs.find((item) => item.paragraph_id === paragraphId);
    if (!paragraph) return false;

    setActiveParagraphId(paragraphId);
    setCurrentPageNo(paragraph.page_no);

    const applyScroll = () => {
      const element = paragraphRefs.current[paragraphId];
      if (!element) return;
      element.scrollIntoView({
        behavior: options?.behavior ?? "smooth",
        block: "center",
      });
    };

    if (options?.behavior === "auto") {
      window.requestAnimationFrame(applyScroll);
    } else {
      applyScroll();
    }

    if (options?.updateUrl !== false) {
      updateReaderUrl(paragraphId);
    }
    return true;
  }, [reader?.paragraphs, updateReaderUrl]);

  function clearSelection() {
    setSelection(null);
  }

  function captureSelection() {
    const currentSelection = window.getSelection();
    if (!currentSelection || currentSelection.rangeCount === 0) {
      clearSelection();
      return;
    }

    const text = currentSelection.toString().trim();
    if (!text) {
      clearSelection();
      return;
    }

    const article = articleRef.current;
    const range = currentSelection.getRangeAt(0);
    const commonNode = range.commonAncestorContainer;
    const sourceElement = commonNode instanceof Element ? commonNode : commonNode.parentElement;
    if (!article || !sourceElement || !article.contains(sourceElement)) {
      clearSelection();
      return;
    }

    const paragraphElement = sourceElement.closest<HTMLElement>("[data-paragraph-id]");
    if (!paragraphElement) {
      clearSelection();
      return;
    }

    const paragraphId = Number(paragraphElement.dataset.paragraphId);
    if (!Number.isFinite(paragraphId)) {
      clearSelection();
      return;
    }

    const rect = range.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - 220);
    setActiveParagraphId(paragraphId);
    const paragraph = reader?.paragraphs.find((item) => item.paragraph_id === paragraphId);
    if (paragraph) {
      setCurrentPageNo(paragraph.page_no);
    }
    updateReaderUrl(paragraphId);
    setSelection({
      text,
      paragraphId,
      top: Math.max(rect.bottom + 8, 80),
      left: Math.max(left, 16),
    });
    setTranslationError("");
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
      const paragraphNumber = (paragraphIndexMap.get(selection.paragraphId) ?? 0) + 1;
      setNotice(`已完成英译中辅助翻译，并回到当前页的第 ${paragraphNumber} 段。`);
    } catch (translateError) {
      setTranslationError((translateError as Error).message || "选词翻译失败，请稍后重试。");
    } finally {
      setTranslationLoading(false);
    }
  }

  async function handleCreateAnnotation() {
    if (!activeParagraphId) {
      setLocatorError("请先选中当前页中的一个正文段落。");
      return;
    }
    if (!annotationDraft.trim()) {
      setLocatorError("请先写下批注内容。");
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
      const paragraphNumber = (paragraphIndexMap.get(activeParagraphId) ?? 0) + 1;
      setAnnotationDraft("");
      setNotice(`已保存当前页第 ${paragraphNumber} 段的批注。`);
      await loadReader();
      focusParagraph(activeParagraphId, { behavior: "auto" });
    } catch (annotationError) {
      setLocatorError((annotationError as Error).message || "保存批注失败，请稍后重试。");
    } finally {
      setAnnotationSaving(false);
    }
  }

  function handleLocateParagraph() {
    const query = locatorQuery.trim();
    if (!query) {
      setLocatorError("请输入关键词后再定位。");
      return;
    }
    if (!reader) return;

    const target = reader.paragraphs.find((paragraph) =>
      paragraph.text.toLowerCase().includes(query.toLowerCase()),
    );
    if (!target) {
      setLocatorError(`正文中暂未找到“${query}”。`);
      return;
    }

    setLocatorError("");
    focusParagraph(target.paragraph_id);
    setNotice(`已定位到第 ${target.page_no} 页相关正文。`);
  }

  function goToPage(pageNo: number) {
    const firstParagraphId = pageFirstParagraphMap.get(pageNo);
    if (firstParagraphId) {
      focusParagraph(firstParagraphId, { behavior: "auto" });
      setNotice(`已切换到第 ${pageNo} 页。`);
      return;
    }
    setCurrentPageNo(pageNo);
    setNotice(`已切换到第 ${pageNo} 页。`);
  }

  function stepPage(offset: -1 | 1) {
    if (currentPageIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(pageNumbers.length - 1, currentPageIndex + offset));
    const nextPageNo = pageNumbers[nextIndex];
    if (nextPageNo) {
      goToPage(nextPageNo);
    }
  }

  function openCurrentPagePreview(page: PaperReaderPagePreview) {
    setLightbox({
      src: resolveApiAssetUrl(page.image_url),
      title: `第 ${page.page_no} 页预览`,
    });
  }

  function openFigurePreview(figure: PaperReaderFigure) {
    setLightbox({
      src: resolveApiAssetUrl(figure.image_url),
      title: `图像 · 第 ${figure.page_no} 页`,
      caption: figure.caption_text,
    });
  }

  if (loading) {
    return <Loading text="正在加载论文阅读页..." />;
  }

  if (!reader) {
    return <EmptyState title="未找到论文阅读数据" hint="请返回文献搜索页重新打开该论文。" />;
  }

  return (
    <div className="paper-reader-shell">
      <Card>
        <div className="paper-reader-header">
          <div>
            <h2 className="title" style={{ fontSize: 24, marginBottom: 8 }}>
              {reader.paper.title_en}
            </h2>
            <div className="subtle" style={{ display: "grid", gap: 4 }}>
              <span>
                来源：{reader.paper.source}
                {reader.paper.year ? ` · ${reader.paper.year}` : ""}
              </span>
              <span>
                阅读状态：{readingStatusLabel(reader.research_state.reading_status)} · 复现兴趣：
                {reproInterestLabel(reader.research_state.repro_interest)}
              </span>
            </div>
            <div className="reader-chip-row" style={{ marginTop: 12 }}>
              <span className="reader-chip">摘要 {summaryStats?.summaryCount ?? 0}</span>
              <span className="reader-chip">心得 {summaryStats?.reflectionCount ?? 0}</span>
              <span className="reader-chip">近期任务 {summaryStats?.taskCount ?? 0}</span>
              <span className="reader-chip">总页数 {pageNumbers.length}</span>
              <span className="reader-chip">图像 {reader.figures.length}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button type="button" disabled={downloading} onClick={handleDownload}>
              {downloading ? "下载中..." : reader.pdf_downloaded ? "重新加载 PDF 与阅读缓存" : "下载 PDF 并生成阅读内容"}
            </Button>
            <Button
              className="secondary"
              type="button"
              disabled={!reader.pdf_downloaded}
              onClick={() => window.open(getPaperPdfUrl(paperId, true), "_blank", "noopener,noreferrer")}
            >
              打开原始 PDF
            </Button>
            <Button className="secondary" type="button" onClick={() => router.push(`/reproduction?paper_id=${paperId}`)}>
              进入复现工作区
            </Button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button
              type="button"
              className={`chip-toggle ${viewMode === "reading" ? "active" : ""}`.trim()}
              onClick={() => setViewMode("reading")}
            >
              阅读视图
            </button>
            <button
              type="button"
              className={`chip-toggle ${viewMode === "workspace" ? "active" : ""}`.trim()}
              onClick={() => setViewMode("workspace")}
            >
              论文工作区
            </button>
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
            ? [{ variant: reader.reader_ready ? "info" as const : "warning" as const, message: reader.text_notice }]
            : []),
          ...reader.reader_notices.map((message) => ({ variant: "warning" as const, message })),
          ...(notice ? [{ variant: "success" as const, message: notice }] : []),
          ...(translationError ? [{ variant: "warning" as const, message: translationError }] : []),
          ...(locatorError ? [{ variant: "warning" as const, message: locatorError }] : []),
        ]}
      />

      {!reader.pdf_downloaded ? (
        <EmptyState
          title="当前尚未下载 PDF"
          hint="你仍可先查看 abstract 和研究状态；下载 PDF 后即可进入翻页阅读、页面预览和图片辅助。"
        />
      ) : null}

      {viewMode === "reading" && reader.reader_ready ? (
        <Card>
          <div className="paper-reader-header" style={{ alignItems: "center" }}>
            <div>
              <h3 className="title" style={{ fontSize: 18 }}>
                按页阅读
              </h3>
              <p className="subtle" style={{ margin: "4px 0 0" }}>
                当前以正文阅读为主。翻译放到底部抽屉，图片改为本页图集，不再打断正文主线。
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                className="secondary"
                type="button"
                disabled={!currentPagePreview}
                onClick={() => currentPagePreview && openCurrentPagePreview(currentPagePreview)}
              >
                查看本页预览
              </Button>
              <Button className="secondary" type="button" onClick={() => setFigurePanelOpen(true)}>
                本页图像 ({currentPageFigures.length})
              </Button>
              <Button
                className="secondary"
                type="button"
                disabled={!translation && !streamingTranslationText}
                onClick={() => {
                  setTranslation(null);
                  setStreamingTranslationText("");
                  setTranslationDrawerOpen(false);
                }}
              >
                清空翻译
              </Button>
            </div>
          </div>

          <div className="paper-reader-page-toolbar">
            <div className="paper-reader-locator-row">
              <strong>翻页</strong>
              <span className="subtle">
                当前第 {effectivePageNo} 页 / 共 {pageNumbers.length} 页
              </span>
              <span className="subtle">本页正文 {currentPageParagraphs.length} 段</span>
              <span className="subtle">本页图像 {currentPageFigures.length} 张</span>
            </div>

            <div className="paper-reader-locator-row">
              <Button className="secondary" type="button" disabled={currentPageIndex <= 0} onClick={() => stepPage(-1)}>
                上一页
              </Button>
              <select
                className="select"
                value={String(effectivePageNo)}
                onChange={(event) => goToPage(Number(event.target.value))}
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
                disabled={currentPageIndex < 0 || currentPageIndex >= pageNumbers.length - 1}
                onClick={() => stepPage(1)}
              >
                下一页
              </Button>
              <input
                className="input"
                style={{ minWidth: 260, flex: 1 }}
                placeholder="按关键词定位正文，例如 baseline、dataset、ablation"
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
          </div>

          <div className="paper-reader-page-layout">
            <div ref={articleRef} className="paper-reader-page-main" onMouseUp={captureSelection} onKeyUp={captureSelection}>
              <article className="paper-reader-page-article">
                {currentPageParagraphs.map((paragraph, index) => {
                  const isActive = activeParagraphId === paragraph.paragraph_id;
                  const isMatched = matchedParagraphIds.includes(paragraph.paragraph_id);
                  const hasAnnotation = currentPageAnnotations.some((item) => item.paragraph_id === paragraph.paragraph_id);
                  const className = [
                    "reader-page-paragraph",
                    isActive ? "reader-page-paragraph-active" : "",
                    isMatched ? "reader-page-paragraph-match" : "",
                    hasAnnotation ? "reader-page-paragraph-annotated" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div key={paragraph.paragraph_id} className="reader-page-flow-block">
                      <p
                        ref={(element) => {
                          paragraphRefs.current[paragraph.paragraph_id] = element;
                        }}
                        data-paragraph-id={paragraph.paragraph_id}
                        className={className}
                        onClick={() => focusParagraph(paragraph.paragraph_id)}
                      >
                        {index === 0 ? (
                          <span className="reader-page-paragraph-meta">第 {effectivePageNo} 页 · 点击段落可定位、翻译与批注</span>
                        ) : null}
                        {paragraph.text}
                      </p>
                    </div>
                  );
                })}
              </article>
            </div>

            <div className="paper-reader-page-side">
              <div className="paper-reader-annotation-panel">
                <div className="paper-reader-locator-row">
                  <strong>当前段落批注</strong>
                  {activeParagraph ? <span className="subtle">正在编辑当前页选中段落</span> : null}
                </div>
                {activeParagraph ? (
                  <>
                    <p className="subtle" style={{ margin: 0 }}>
                      当前段落片段：{activeParagraph.text.slice(0, 160)}
                      {activeParagraph.text.length > 160 ? "..." : ""}
                    </p>
                    {selectedQuoteForAnnotation ? (
                      <div className="reader-annotation-quote">
                        <div className="subtle">将随批注保存的选中原文</div>
                        <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{selectedQuoteForAnnotation}</p>
                      </div>
                    ) : (
                      <p className="subtle" style={{ margin: 0 }}>
                        你可以先选中英文句子再翻译或保存批注，系统会保留引用原文。
                      </p>
                    )}
                    <textarea
                      className="textarea"
                      placeholder="记录这段正文对你有什么启发、疑问、复现提醒或后续要查证的点"
                      value={annotationDraft}
                      onChange={(event) => setAnnotationDraft(event.target.value)}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button type="button" disabled={annotationSaving} onClick={() => void handleCreateAnnotation()}>
                        {annotationSaving ? "保存中..." : "保存当前段落批注"}
                      </Button>
                      <Button className="secondary" type="button" onClick={() => setAnnotationDraft("")}>
                        清空批注草稿
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="subtle" style={{ margin: 0 }}>请先点击当前页中的正文段落，再写批注。</p>
                )}
              </div>

              <div className="paper-reader-annotation-panel">
                <div className="paper-reader-locator-row">
                  <strong>本页批注回看</strong>
                  <span className="subtle">共 {currentPageAnnotations.length} 条</span>
                </div>
                {currentPageAnnotations.length === 0 ? (
                  <p className="subtle" style={{ margin: 0 }}>当前页还没有批注。</p>
                ) : (
                  <div className="paper-reader-annotation-list">
                    {currentPageAnnotations.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`paper-reader-annotation-item${item.paragraph_id === activeParagraphId ? " active" : ""}`}
                        onClick={() => {
                          focusParagraph(item.paragraph_id, { behavior: "auto" });
                          setNotice("已回到本页批注对应的正文位置。");
                        }}
                      >
                        <div className="paper-reader-locator-row">
                          <strong>本页批注</strong>
                          <span className="subtle">{formatDateTime(item.updated_at)}</span>
                        </div>
                        {item.selected_text ? <div className="subtle">引用：{item.selected_text}</div> : null}
                        <div style={{ whiteSpace: "pre-wrap" }}>{item.note_text}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {viewMode === "workspace" ? (
        <PaperWorkspaceView
          paperId={paperId}
          requestedSummaryId={requestedSummaryId}
          initialWorkspace={reader}
          onWorkspaceChanged={loadReader}
          showPaperHeader={false}
        />
      ) : null}

      {selection ? (
        <button
          type="button"
          className="reader-selection-toolbar"
          style={{ top: selection.top, left: selection.left }}
          onClick={() => void handleTranslateSelection()}
        >
          {translationLoading ? "翻译中..." : "英译中"}
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
                  {translation?.content_zh || streamingTranslationText || "正在通过模型流式生成中文译文..."}
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
                <h4 className="title" style={{ fontSize: 18, margin: 0 }}>本页图集</h4>
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
                <h4 className="title" style={{ fontSize: 18, margin: 0 }}>{lightbox.title}</h4>
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
