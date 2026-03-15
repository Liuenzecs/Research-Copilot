"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import PaperWorkspaceView from '@/components/papers/PaperWorkspace';
import { downloadPaper, getPaperPdfUrl, getPaperReader, translateSegment } from '@/lib/api';
import { readingStatusLabel, reproInterestLabel } from '@/lib/researchState';
import { PaperReader, TranslationResult } from '@/lib/types';

type SelectionContext = {
  text: string;
  paragraphId: number;
  top: number;
  left: number;
};

export default function PaperReaderScreen({
  paperId,
  requestedSummaryId = null,
}: {
  paperId: number;
  requestedSummaryId?: number | null;
}) {
  const router = useRouter();
  const articleRef = useRef<HTMLDivElement | null>(null);

  const [reader, setReader] = useState<PaperReader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [notice, setNotice] = useState('');
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const loadReader = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await getPaperReader(paperId);
      setReader(payload);
      setWarning(payload.text_notice || '');
    } catch (loadError) {
      setError((loadError as Error).message || '论文阅读页加载失败，请稍后重试。');
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

    const paragraphElement = sourceElement.closest<HTMLElement>('[data-paragraph-id]');
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
    const left = Math.min(rect.left, window.innerWidth - 180);

    setSelection({
      text,
      paragraphId,
      top: Math.max(rect.bottom + 8, 80),
      left: Math.max(left, 16),
    });
    setTranslationError('');
  }

  async function handleDownload() {
    setDownloading(true);
    setError('');
    setNotice('');

    try {
      const result = await downloadPaper(paperId);
      setNotice(`PDF 已下载到本地：${result.pdf_local_path}。正在刷新正文阅读内容。`);
      await loadReader();
    } catch (downloadError) {
      setError((downloadError as Error).message || 'PDF 下载失败，请稍后重试。');
    } finally {
      setDownloading(false);
    }
  }

  async function handleTranslateSelection() {
    if (!selection) return;

    setTranslationLoading(true);
    setTranslationError('');

    try {
      const result = await translateSegment({
        text: selection.text,
        mode: 'selection',
        locator: {
          paper_id: paperId,
          paragraph_id: selection.paragraphId,
          selected_text: selection.text,
        },
      });
      setTranslation(result);
    } catch (translateError) {
      setTranslationError((translateError as Error).message || '选词翻译失败，请稍后重试。');
    } finally {
      setTranslationLoading(false);
    }
  }

  if (loading && !reader) {
    return <Loading text="加载论文阅读页..." />;
  }

  if (!reader) {
    return <EmptyState title="论文阅读页不可用" hint={error || '请确认论文存在，或稍后重试。'} />;
  }

  return (
    <div className="paper-reader-shell">
      <Card>
        <div className="paper-reader-header">
          <div style={{ display: 'grid', gap: 8 }}>
            <h2 className="title" style={{ fontSize: 24, lineHeight: 1.5 }}>
              {reader.paper.title_en}
            </h2>
            <div className="subtle">{reader.paper.authors || 'Unknown authors'}</div>
            <div className="subtle">
              {reader.paper.source} · {reader.paper.year ?? 'N/A'} · {reader.paper.pdf_local_path ? '已下载 PDF' : '尚未下载 PDF'}
            </div>
            <div className="reader-chip-row">
              <span className="reader-chip">阅读状态：{readingStatusLabel(reader.research_state.reading_status)}</span>
              <span className="reader-chip">复现兴趣：{reproInterestLabel(reader.research_state.repro_interest)}</span>
              <span className="reader-chip">摘要 {summaryStats?.summaryCount ?? 0}</span>
              <span className="reader-chip">心得 {summaryStats?.reflectionCount ?? 0}</span>
              <span className="reader-chip">近期任务 {summaryStats?.taskCount ?? 0}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" disabled={downloading} onClick={handleDownload}>
              {downloading ? '下载中...' : reader.pdf_downloaded ? '重新加载 PDF 与正文' : '下载 PDF 并生成阅读文本'}
            </Button>
            <Button
              className="secondary"
              type="button"
              disabled={!reader.pdf_downloaded}
              onClick={() => window.open(getPaperPdfUrl(paperId, true), '_blank', 'noopener,noreferrer')}
            >
              打开原始 PDF
            </Button>
            <Button className="secondary" type="button" onClick={() => router.push(`/reproduction?paper_id=${paperId}`)}>
              进入复现工作区
            </Button>
          </div>
        </div>

        <div className="paper-reader-abstract">
          <div className="subtle" style={{ marginBottom: 6 }}>
            Abstract（英文原文 canonical）
          </div>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{reader.paper.abstract_en || '当前论文暂无 abstract。'}</p>
        </div>
      </Card>

      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...(warning ? [{ variant: reader.reader_ready ? 'info' as const : 'warning' as const, message: warning }] : []),
          ...(notice ? [{ variant: 'success' as const, message: notice }] : []),
          ...(translationError ? [{ variant: 'warning' as const, message: translationError }] : []),
        ]}
      />

      {!reader.pdf_downloaded ? (
        <EmptyState title="当前尚未下载 PDF" hint="你仍可先查看 abstract 和研究状态；下载 PDF 后即可进入正文阅读与选词翻译。" />
      ) : null}

      {reader.pdf_downloaded && !reader.reader_ready ? (
        <EmptyState title="正文暂不可读" hint="PDF 已下载，但当前尚未解析出可阅读段落。你仍可继续使用摘要、心得与复现入口。" />
      ) : null}

      {reader.reader_ready ? (
        <Card>
          <div className="paper-reader-header" style={{ alignItems: 'center' }}>
            <div>
              <h3 className="title" style={{ fontSize: 18 }}>
                论文正文阅读
              </h3>
              <p className="subtle" style={{ margin: '4px 0 0' }}>
                选中文本后会出现“翻译选中内容”按钮。中文翻译仅供辅助理解。
              </p>
            </div>
            <Button className="secondary" type="button" onClick={() => setTranslation(null)}>
              清空翻译卡片
            </Button>
          </div>

          {translation ? (
            <div className="reader-translation-card">
              <div>
                <div className="subtle">选中原文</div>
                <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{translation.content_en_snapshot}</p>
              </div>
              <div>
                <div className="subtle">中文翻译</div>
                <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{translation.content_zh}</p>
              </div>
              <div className="subtle">{translation.disclaimer}</div>
            </div>
          ) : null}

          <div ref={articleRef} className="paper-reader-article-shell" onMouseUp={captureSelection} onKeyUp={captureSelection}>
            <article className="paper-reader-article">
              {reader.paragraphs.map((paragraph) => (
                <p key={paragraph.paragraph_id} data-paragraph-id={paragraph.paragraph_id} className="reader-paragraph">
                  {paragraph.text}
                </p>
              ))}
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
          {translationLoading ? '翻译中...' : '翻译选中内容'}
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
