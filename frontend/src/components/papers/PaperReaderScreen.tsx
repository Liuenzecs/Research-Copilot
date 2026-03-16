"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import EmptyState from "@/components/common/EmptyState";
import Loading from "@/components/common/Loading";
import StatusStack from "@/components/common/StatusStack";
import PaperWorkspaceView from "@/components/papers/PaperWorkspace";
import { createPaperAnnotation, downloadPaper, getPaperPdfUrl, getPaperReader, translateSegment } from "@/lib/api";
import { formatDateTime } from "@/lib/presentation";
import { paperReaderPath } from "@/lib/routes";
import { readingStatusLabel, reproInterestLabel } from "@/lib/researchState";
import { PaperReader, TranslationResult } from "@/lib/types";

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
  const [warning, setWarning] = useState("");
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [activeParagraphId, setActiveParagraphId] = useState<number | null>(requestedParagraphId);
  const [locatorQuery, setLocatorQuery] = useState("");
  const [locatorError, setLocatorError] = useState("");
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [annotationSaving, setAnnotationSaving] = useState(false);

  const loadReader = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await getPaperReader(paperId);
      setReader(payload);
      setWarning(payload.text_notice || "");
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

  const matchedParagraphIds = useMemo(() => {
    const query = locatorQuery.trim().toLowerCase();
    if (!query || !reader) return [];

    return reader.paragraphs
      .filter((paragraph) => paragraph.text.toLowerCase().includes(query))
      .map((paragraph) => paragraph.paragraph_id);
  }, [locatorQuery, reader]);

  const activeParagraphIndex = activeParagraphId ? (paragraphIndexMap.get(activeParagraphId) ?? -1) : -1;
  const activeParagraphNumber = activeParagraphIndex >= 0 ? activeParagraphIndex + 1 : null;
  const activeParagraph = activeParagraphId
    ? (reader?.paragraphs.find((paragraph) => paragraph.paragraph_id === activeParagraphId) ?? null)
    : null;
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
    const element = paragraphRefs.current[paragraphId];
    if (!element) return false;

    setActiveParagraphId(paragraphId);
    element.scrollIntoView({
      behavior: options?.behavior ?? "smooth",
      block: "center",
    });

    if (options?.updateUrl !== false) {
      updateReaderUrl(paragraphId);
    }
    return true;
  }, [updateReaderUrl]);

  useEffect(() => {
    if (!reader?.reader_ready || reader.paragraphs.length === 0) return;

    if (requestedParagraphId && paragraphIndexMap.has(requestedParagraphId)) {
      const frame = window.requestAnimationFrame(() => {
        focusParagraph(requestedParagraphId, { behavior: "auto", updateUrl: false });
        const paragraphNumber = (paragraphIndexMap.get(requestedParagraphId) ?? 0) + 1;
        setNotice(`已定位到正文第 ${paragraphNumber} 段。`);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (!activeParagraphId) {
      setActiveParagraphId(reader.paragraphs[0]?.paragraph_id ?? null);
    }
    return undefined;
  }, [activeParagraphId, focusParagraph, paragraphIndexMap, reader, requestedParagraphId]);

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
      setNotice(`PDF 已下载到本地：${result.pdf_local_path}。正在刷新正文阅读内容。`);
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

    try {
      const result = await translateSegment({
        text: selection.text,
        mode: "selection",
        locator: {
          paper_id: paperId,
          paragraph_id: selection.paragraphId,
          selected_text: selection.text,
        },
      });
      setTranslation(result);
      focusParagraph(selection.paragraphId);
      const paragraphNumber = (paragraphIndexMap.get(selection.paragraphId) ?? 0) + 1;
      setNotice(`已完成选词翻译，并定位到正文第 ${paragraphNumber} 段。`);
    } catch (translateError) {
      setTranslationError((translateError as Error).message || "选词翻译失败，请稍后重试。");
    } finally {
      setTranslationLoading(false);
    }
  }

  async function handleCreateAnnotation() {
    if (!activeParagraphId) {
      setLocatorError("请先选中或定位到一个正文段落。");
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
      setNotice(`已保存正文第 ${paragraphNumber} 段的批注。`);
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

    const target = reader.paragraphs.find((paragraph) => paragraph.text.toLowerCase().includes(query.toLowerCase()));
    if (!target) {
      setLocatorError(`正文中暂未找到“${query}”。`);
      return;
    }

    setLocatorError("");
    focusParagraph(target.paragraph_id);
    const paragraphNumber = (paragraphIndexMap.get(target.paragraph_id) ?? 0) + 1;
    setNotice(`已定位到包含“${query}”的正文第 ${paragraphNumber} 段。`);
  }

  function handleStepParagraph(offset: -1 | 1) {
    if (!reader || reader.paragraphs.length === 0) return;

    const fallbackIndex = offset > 0 ? 0 : reader.paragraphs.length - 1;
    const currentIndex = activeParagraphId ? (paragraphIndexMap.get(activeParagraphId) ?? fallbackIndex) : fallbackIndex;
    const nextIndex = Math.max(0, Math.min(reader.paragraphs.length - 1, currentIndex + offset));
    const target = reader.paragraphs[nextIndex];
    if (!target) return;

    setLocatorError("");
    focusParagraph(target.paragraph_id);
    setNotice(`已切换到正文第 ${nextIndex + 1} 段。`);
  }

  function handleOpenReproduction() {
    router.push(`/reproduction?paper_id=${paperId}`);
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
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button type="button" disabled={downloading} onClick={handleDownload}>
              {downloading ? "下载中..." : reader.pdf_downloaded ? "重新加载 PDF 与正文" : "下载 PDF 并生成阅读文本"}
            </Button>
            <Button
              className="secondary"
              type="button"
              disabled={!reader.pdf_downloaded}
              onClick={() => window.open(getPaperPdfUrl(paperId, true), "_blank", "noopener,noreferrer")}
            >
              打开原始 PDF
            </Button>
            <Button className="secondary" type="button" onClick={handleOpenReproduction}>
              进入复现工作区
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
          ...(warning ? [{ variant: reader.reader_ready ? "info" as const : "warning" as const, message: warning }] : []),
          ...(notice ? [{ variant: "success" as const, message: notice }] : []),
          ...(translationError ? [{ variant: "warning" as const, message: translationError }] : []),
          ...(locatorError ? [{ variant: "warning" as const, message: locatorError }] : []),
        ]}
      />

      {!reader.pdf_downloaded ? (
        <EmptyState
          title="当前尚未下载 PDF"
          hint="你仍可先查看 abstract 和研究状态；下载 PDF 后即可进入正文阅读与选词翻译。"
        />
      ) : null}

      {reader.pdf_downloaded && !reader.reader_ready ? (
        <EmptyState
          title="正文暂不可读"
          hint="PDF 已下载，但当前尚未解析出可阅读段落。你仍可继续使用摘要、心得与复现入口。"
        />
      ) : null}

      {reader.reader_ready ? (
        <Card>
          <div className="paper-reader-header" style={{ alignItems: "center" }}>
            <div>
              <h3 className="title" style={{ fontSize: 18 }}>
                论文正文阅读
              </h3>
              <p className="subtle" style={{ margin: "4px 0 0" }}>
                你可以按关键词定位正文、点击段落高亮，或选中文本后直接翻译。中文翻译仅用于辅助理解。
              </p>
            </div>
            <Button className="secondary" type="button" onClick={() => setTranslation(null)}>
              清空翻译卡片
            </Button>
          </div>

          <div className="paper-reader-locator">
            <div className="paper-reader-locator-row">
              <strong>正文定位</strong>
              <span className="subtle">共 {reader.paragraphs.length} 段</span>
              {activeParagraphNumber ? <span className="subtle">当前第 {activeParagraphNumber} 段</span> : null}
              {matchedParagraphIds.length > 0 ? (
                <span className="subtle">关键词命中 {matchedParagraphIds.length} 段</span>
              ) : null}
            </div>

            <div className="paper-reader-locator-row">
              <input
                className="input"
                style={{ minWidth: 260, flex: 1 }}
                placeholder="按关键词定位正文段落，例如 baseline、dataset、ablation"
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
              <Button className="secondary" type="button" onClick={() => handleStepParagraph(-1)}>
                上一段
              </Button>
              <Button className="secondary" type="button" onClick={() => handleStepParagraph(1)}>
                下一段
              </Button>
              <Button type="button" onClick={handleLocateParagraph}>
                定位关键词
              </Button>
            </div>
          </div>

          <div className="paper-reader-annotation-layout">
            <div className="paper-reader-annotation-panel">
              <div className="paper-reader-locator-row">
                <strong>当前段落批注</strong>
                {activeParagraphNumber ? <span className="subtle">正在批注第 {activeParagraphNumber} 段</span> : null}
                <span className="subtle">已保存 {reader.annotations.length} 条批注</span>
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
                      你也可以先在该段中选中文本，再保存批注，系统会一并保留引用片段。
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
                <p className="subtle" style={{ margin: 0 }}>请先点击正文中的任一段落，再为它写批注。</p>
              )}
            </div>

            <div className="paper-reader-annotation-panel">
              <div className="paper-reader-locator-row">
                <strong>批注回看</strong>
                {activeParagraphNumber ? <span className="subtle">当前段落已有 {activeParagraphAnnotations.length} 条</span> : null}
              </div>
              {reader.annotations.length === 0 ? (
                <p className="subtle" style={{ margin: 0 }}>当前还没有正文批注。你可以先从正在阅读的关键段落开始记录。</p>
              ) : (
                <div className="paper-reader-annotation-list">
                  {reader.annotations.slice(0, 12).map((item) => {
                    const paragraphNumber = (paragraphIndexMap.get(item.paragraph_id) ?? 0) + 1;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`paper-reader-annotation-item${item.paragraph_id === activeParagraphId ? " active" : ""}`}
                        onClick={() => {
                          setLocatorError("");
                          focusParagraph(item.paragraph_id);
                          setNotice(`已跳回正文第 ${paragraphNumber} 段的批注位置。`);
                        }}
                      >
                        <div className="paper-reader-locator-row">
                          <strong>第 {paragraphNumber} 段</strong>
                          <span className="subtle">{formatDateTime(item.updated_at)}</span>
                        </div>
                        {item.selected_text ? <div className="subtle">引用：{item.selected_text}</div> : null}
                        <div style={{ whiteSpace: "pre-wrap" }}>{item.note_text}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {translation ? (
            <div className="reader-translation-card">
              <div>
                <div className="subtle">选中原文</div>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{translation.content_en_snapshot}</p>
              </div>
              <div>
                <div className="subtle">中文翻译</div>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{translation.content_zh}</p>
              </div>
              <div className="subtle">{translation.disclaimer}</div>
            </div>
          ) : null}

          <div ref={articleRef} className="paper-reader-article-shell" onMouseUp={captureSelection} onKeyUp={captureSelection}>
            <article className="paper-reader-article">
              {reader.paragraphs.map((paragraph, index) => {
                const isActive = activeParagraphId === paragraph.paragraph_id;
                const isMatched = matchedParagraphIds.includes(paragraph.paragraph_id);
                const className = [
                  "reader-paragraph",
                  isActive ? "reader-paragraph-active" : "",
                  isMatched ? "reader-paragraph-match" : "",
                ].filter(Boolean).join(" ");

                return (
                  <p
                    key={paragraph.paragraph_id}
                    ref={(element) => {
                      paragraphRefs.current[paragraph.paragraph_id] = element;
                    }}
                    data-paragraph-id={paragraph.paragraph_id}
                    className={className}
                    onClick={() => {
                      setLocatorError("");
                      focusParagraph(paragraph.paragraph_id);
                    }}
                  >
                    <span className="reader-paragraph-meta">
                      <span className="reader-paragraph-badge">第 {index + 1} 段</span>
                      <span className="reader-paragraph-action">点击可高亮并保持定位</span>
                    </span>
                    {paragraph.text}
                  </p>
                );
              })}
            </article>
          </div>
        </Card>
      ) : null}

      {selection ? (
        <button
          type="button"
          className="reader-selection-toolbar"
          style={{ top: selection.top, left: selection.left }}
          onClick={() => void handleTranslateSelection()}
        >
          {translationLoading ? "翻译中..." : "翻译选中内容"}
        </button>
      ) : null}

      <PaperWorkspaceView
        paperId={paperId}
        requestedSummaryId={requestedSummaryId}
        initialWorkspace={reader}
        onWorkspaceChanged={loadReader}
        showPaperHeader={false}
      />
    </div>
  );
}
