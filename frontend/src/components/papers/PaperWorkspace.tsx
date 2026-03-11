"use client";

import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import {
  createPaperReflection,
  deepSummary,
  downloadPaper,
  getPaperPdfUrl,
  getPaperWorkspace,
  pushPaperToMemory,
  quickSummary,
  updatePaperResearchState,
} from '@/lib/api';
import {
  readingStatusLabel,
  READING_STATUS_OPTIONS,
  reproInterestLabel,
  REPRO_INTEREST_OPTIONS,
} from '@/lib/researchState';
import { PaperWorkspace } from '@/lib/types';

type WorthReproducing = 'yes' | 'maybe' | 'no';

type ReflectionDraft = {
  mostImportantContribution: string;
  whatILearned: string;
  worthReproducing: WorthReproducing;
  reportSummary: string;
  freeNotes: string;
};

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = (value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function deriveWorthReproducing(reproInterest: string): WorthReproducing {
  if (reproInterest === 'high' || reproInterest === 'medium') return 'yes';
  if (reproInterest === 'low') return 'maybe';
  return 'no';
}

function summarizeText(text: string, max = 220): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
}

function buildDraftFromContext(workspace: PaperWorkspace, summaryId: number | ''): ReflectionDraft {
  const summary = summaryId
    ? workspace.summaries.find((item) => item.id === summaryId)
    : workspace.summaries[0];

  const mostImportantContribution = firstNonEmpty(
    summary?.contributions_en,
    summary?.method_en,
    summary?.problem_en,
    summarizeText(summary?.content_en || ''),
  );

  const whatILearned = firstNonEmpty(
    summarizeText(summary?.content_en || '', 360),
    summarizeText(workspace.paper.abstract_en || '', 360),
  );

  const reportSummary = summarizeText(
    firstNonEmpty(
      summary?.contributions_en,
      `${workspace.paper.title_en}：${whatILearned}`,
      workspace.paper.title_en,
    ),
    120,
  );

  return {
    mostImportantContribution,
    whatILearned,
    worthReproducing: deriveWorthReproducing(workspace.research_state.repro_interest || 'none'),
    reportSummary,
    freeNotes: '',
  };
}

export default function PaperWorkspaceView({ paperId }: { paperId: number | null }) {
  const [workspace, setWorkspace] = useState<PaperWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const [readingStatus, setReadingStatus] = useState('unread');
  const [interestLevel, setInterestLevel] = useState(3);
  const [reproInterest, setReproInterest] = useState('none');
  const [isCorePaper, setIsCorePaper] = useState(false);
  const [topicCluster, setTopicCluster] = useState('');

  const [reflectionDraft, setReflectionDraft] = useState<ReflectionDraft>({
    mostImportantContribution: '',
    whatILearned: '',
    worthReproducing: 'no',
    reportSummary: '',
    freeNotes: '',
  });
  const [reportWorthy, setReportWorthy] = useState(false);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number | ''>('');
  const [reflectionDirty, setReflectionDirty] = useState(false);
  const [lastPrefillKey, setLastPrefillKey] = useState('');

  const summaries = workspace?.summaries ?? [];

  const selectedSummary = useMemo(() => {
    if (selectedSummaryId === '') return summaries[0];
    return summaries.find((item) => item.id === selectedSummaryId) || summaries[0];
  }, [summaries, selectedSummaryId]);

  async function reload() {
    if (!paperId) {
      setWorkspace(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getPaperWorkspace(paperId);
      setWorkspace(data);
      setReadingStatus(data.research_state.reading_status || 'unread');
      setInterestLevel(data.research_state.interest_level || 3);
      setReproInterest(data.research_state.repro_interest || 'none');
      setIsCorePaper(Boolean(data.research_state.is_core_paper));
      setTopicCluster(data.research_state.topic_cluster || '');
      setSelectedSummaryId((previous) => {
        const summaryIds = data.summaries.map((item) => item.id);
        if (previous !== '' && summaryIds.includes(previous as number)) {
          return previous;
        }
        return data.summaries[0]?.id ?? '';
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [paperId]);

  useEffect(() => {
    if (!workspace) return;
    const summaryKey = selectedSummaryId === '' ? (workspace.summaries[0]?.id ?? 'none') : selectedSummaryId;
    const prefillKey = [
      workspace.paper.id,
      summaryKey,
      workspace.research_state.repro_interest || 'none',
      workspace.research_state.reading_status || 'unread',
    ].join(':');

    if (reflectionDirty && prefillKey === lastPrefillKey) return;

    const draft = buildDraftFromContext(workspace, selectedSummaryId);
    setReflectionDraft(draft);
    setLastPrefillKey(prefillKey);
    setReflectionDirty(false);
  }, [workspace, selectedSummaryId, reflectionDirty, lastPrefillKey]);

  function updateReflectionDraft(patch: Partial<ReflectionDraft>) {
    setReflectionDraft((previous) => ({ ...previous, ...patch }));
    setReflectionDirty(true);
  }

  async function runAction(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const currentPaper = workspace?.paper;
  const latestSummary = summaries[0];

  if (!paperId) {
    return <EmptyState title="未选择论文" hint="请从左侧结果选择论文进入集中工作区。" />;
  }

  if (loading && !workspace) {
    return <Loading text="加载论文工作区..." />;
  }

  if (!workspace || !currentPaper) {
    return <EmptyState title="论文工作区不可用" hint={error || '请重试。'} />;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <h3 className="title" style={{ fontSize: 18 }}>{currentPaper.title_en}</h3>
        <p className="subtle">{currentPaper.authors || 'Unknown authors'}</p>
        <p className="subtle">{currentPaper.source} · {currentPaper.year ?? 'N/A'} · PDF: {currentPaper.pdf_local_path || '未下载'}</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <Button
            onClick={() =>
              runAction('download', async () => {
                const result = await downloadPaper(currentPaper.id);
                setNotice(`PDF 已保存到：${result.pdf_local_path}`);
              })
            }
            disabled={busy !== ''}
          >
            {busy === 'download' ? '下载中...' : '下载PDF'}
          </Button>
          <Button
            className="secondary"
            disabled={!currentPaper.pdf_local_path}
            onClick={() => window.open(getPaperPdfUrl(currentPaper.id, true), '_blank', 'noopener,noreferrer')}
            title={currentPaper.pdf_local_path ? '在浏览器打开/保存该 PDF' : '请先下载 PDF'}
          >
            打开PDF
          </Button>
          <Button
            onClick={() =>
              runAction('quick', async () => {
                const result = await quickSummary(currentPaper.id);
                setNotice(`快速总结已生成：#${result.id}（${result.provider || 'heuristic'}/${result.model || 'local'}）`);
              })
            }
            disabled={busy !== ''}
            className="secondary"
          >
            {busy === 'quick' ? '生成中...' : '快速总结'}
          </Button>
          <Button
            onClick={() =>
              runAction('deep', async () => {
                const result = await deepSummary(currentPaper.id);
                setNotice(`深度总结已生成：#${result.id}（${result.provider || 'heuristic'}/${result.model || 'local'}）`);
              })
            }
            disabled={busy !== ''}
            className="secondary"
          >
            {busy === 'deep' ? '生成中...' : '深度总结'}
          </Button>
          <Button
            onClick={() =>
              runAction('memory', async () => {
                const result = await pushPaperToMemory(currentPaper.id);
                setNotice(`已推送到长期记忆，memory_id=${result.memory_id}`);
              })
            }
            disabled={busy !== ''}
            className="secondary"
          >
            {busy === 'memory' ? '处理中...' : '推送到记忆'}
          </Button>
        </div>
      </div>

      <div className="card">
        <h4 className="title" style={{ fontSize: 16 }}>阅读状态</h4>
        <div className="grid-2" style={{ marginTop: 8 }}>
          <select className="select" value={readingStatus} onChange={(e) => setReadingStatus(e.target.value)}>
            {READING_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select className="select" value={reproInterest} onChange={(e) => setReproInterest(e.target.value)}>
            {REPRO_INTEREST_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="grid-2" style={{ marginTop: 8 }}>
          <input
            className="input"
            type="number"
            min={1}
            max={5}
            value={interestLevel}
            onChange={(e) => setInterestLevel(Number(e.target.value))}
            placeholder="interest_level 1-5"
          />
          <input className="input" value={topicCluster} onChange={(e) => setTopicCluster(e.target.value)} placeholder="topic_cluster" />
        </div>
        <label className="subtle" style={{ display: 'block', marginTop: 8 }}>
          <input type="checkbox" checked={isCorePaper} onChange={(e) => setIsCorePaper(e.target.checked)} /> 核心论文
        </label>
        <div style={{ marginTop: 10 }}>
          <Button
            className="secondary"
            disabled={busy !== ''}
            onClick={() =>
              runAction('state', async () => {
                await updatePaperResearchState(currentPaper.id, {
                  reading_status: readingStatus,
                  interest_level: interestLevel,
                  repro_interest: reproInterest,
                  topic_cluster: topicCluster,
                  is_core_paper: isCorePaper,
                });
                setNotice('阅读状态已更新');
              })
            }
          >
            {busy === 'state' ? '保存中...' : '更新阅读状态'}
          </Button>
        </div>
      </div>

      <div className="card">
        <h4 className="title" style={{ fontSize: 16 }}>论文摘要与结构化心得</h4>
        {latestSummary ? (
          <>
            <p className="subtle">
              当前摘要: #{latestSummary.id} ({latestSummary.summary_type}) · provider={latestSummary.provider || 'heuristic'} ·
              model={latestSummary.model || 'local'}
            </p>
            {latestSummary.provider === 'heuristic' ? (
              <p className="subtle" style={{ color: '#b45309' }}>
                当前是本地兜底摘要。若你已配置 DeepSeek，请重启后端使 .env 生效。
              </p>
            ) : null}
            <p style={{ whiteSpace: 'pre-wrap' }}>{latestSummary.content_en}</p>
          </>
        ) : (
          <p className="subtle">暂无摘要，请先执行快速或深度总结。</p>
        )}

        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <p className="subtle" style={{ margin: 0 }}>
            上下文：paper#{currentPaper.id}
            {selectedSummary ? ` · summary#${selectedSummary.id}` : ''}
            {' · 当前阅读阶段 '}
            {readingStatusLabel(readingStatus)}
            {' · 复现兴趣 '}
            {reproInterestLabel(reproInterest)}
          </p>
          <select
            className="select"
            value={selectedSummaryId}
            onChange={(e) => {
              setSelectedSummaryId(e.target.value ? Number(e.target.value) : '');
              setReflectionDirty(false);
            }}
          >
            <option value="">不绑定摘要</option>
            {summaries.map((item) => (
              <option key={item.id} value={item.id}>摘要 #{item.id} ({item.summary_type})</option>
            ))}
          </select>
          <textarea
            className="textarea"
            placeholder="最重要贡献（可编辑预填）"
            value={reflectionDraft.mostImportantContribution}
            onChange={(e) => updateReflectionDraft({ mostImportantContribution: e.target.value })}
          />
          <textarea
            className="textarea"
            placeholder="我学到了什么（可编辑预填）"
            value={reflectionDraft.whatILearned}
            onChange={(e) => updateReflectionDraft({ whatILearned: e.target.value })}
          />
          <select
            className="select"
            value={reflectionDraft.worthReproducing}
            onChange={(e) => updateReflectionDraft({ worthReproducing: e.target.value as WorthReproducing })}
          >
            <option value="yes">值得复现</option>
            <option value="maybe">可评估后再决定</option>
            <option value="no">暂不复现</option>
          </select>
          <input
            className="input"
            placeholder="一句话汇报摘要（可编辑预填）"
            value={reflectionDraft.reportSummary}
            onChange={(e) => updateReflectionDraft({ reportSummary: e.target.value })}
          />
          <textarea
            className="textarea"
            placeholder="自由补充笔记"
            value={reflectionDraft.freeNotes}
            onChange={(e) => updateReflectionDraft({ freeNotes: e.target.value })}
          />
          <label className="subtle">
            <input type="checkbox" checked={reportWorthy} onChange={(e) => setReportWorthy(e.target.checked)} /> 标记为可汇报
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              className="secondary"
              type="button"
              disabled={!workspace}
              onClick={() => {
                if (!workspace) return;
                setReflectionDraft(buildDraftFromContext(workspace, selectedSummaryId));
                setReflectionDirty(false);
                setNotice('已根据当前论文上下文重新预填。');
              }}
            >
              重新预填草稿
            </Button>
            <Button
              disabled={busy !== ''}
              onClick={() =>
                runAction('reflection', async () => {
                  const selectedSummaryValue = selectedSummaryId === '' ? selectedSummary?.id : selectedSummaryId;
                  const markdownSections = [
                    reflectionDraft.mostImportantContribution ? `## Most Important Contribution\n${reflectionDraft.mostImportantContribution}` : '',
                    reflectionDraft.whatILearned ? `## What I Learned\n${reflectionDraft.whatILearned}` : '',
                    reflectionDraft.freeNotes ? `## Free Notes\n${reflectionDraft.freeNotes}` : '',
                  ].filter(Boolean);

                  await createPaperReflection(currentPaper.id, {
                    summary_id: selectedSummaryValue || undefined,
                    stage: readingStatus,
                    lifecycle_status: 'draft',
                    content_structured_json: {
                      related_paper_title: currentPaper.title_en,
                      related_paper_source: currentPaper.source,
                      related_summary_id: selectedSummaryValue ? String(selectedSummaryValue) : '',
                      reading_stage: readingStatus,
                      most_important_contribution: reflectionDraft.mostImportantContribution,
                      what_i_learned: reflectionDraft.whatILearned,
                      worth_reproducing: reflectionDraft.worthReproducing,
                      worth_reporting_to_professor: reportWorthy ? 'yes' : 'no',
                      one_sentence_report_summary: reflectionDraft.reportSummary,
                      free_notes: reflectionDraft.freeNotes,
                    },
                    content_markdown: markdownSections.join('\n\n'),
                    is_report_worthy: reportWorthy,
                    report_summary: reflectionDraft.reportSummary,
                  });
                  setReflectionDirty(false);
                  setNotice('论文心得已创建（草稿，可继续编辑）。');
                })
              }
            >
              {busy === 'reflection' ? '创建中...' : '创建论文心得'}
            </Button>
          </div>
        </div>
      </div>

      <div className="card">
        <h4 className="title" style={{ fontSize: 16 }}>关联记录</h4>
        <p className="subtle">心得 {workspace.reflections.length} 条 · 任务 {workspace.recent_tasks.length} 条</p>
        {workspace.reflections.slice(0, 5).map((item) => (
          <div key={item.id} style={{ marginTop: 6 }}>
            <strong>心得#{item.id}</strong> {readingStatusLabel(item.stage)} {item.report_summary ? `- ${item.report_summary}` : ''}
          </div>
        ))}
      </div>

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      {notice ? <p style={{ color: '#0f766e' }}>{notice}</p> : null}
    </div>
  );
}
