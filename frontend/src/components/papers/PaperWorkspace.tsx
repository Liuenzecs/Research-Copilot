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
import { PaperWorkspace } from '@/lib/types';

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

  const [reflectionSummary, setReflectionSummary] = useState('');
  const [reflectionNote, setReflectionNote] = useState('');
  const [reportWorthy, setReportWorthy] = useState(false);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number | ''>('');

  const summaries = workspace?.summaries ?? [];

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
      const firstSummary = data.summaries[0]?.id;
      setSelectedSummaryId(firstSummary ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [paperId]);

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

  const latestSummary = useMemo(() => summaries[0], [summaries]);

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
            <option value="unread">unread</option>
            <option value="skimmed">skimmed</option>
            <option value="deep_read">deep_read</option>
            <option value="archived">archived</option>
          </select>
          <select className="select" value={reproInterest} onChange={(e) => setReproInterest(e.target.value)}>
            <option value="none">none</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
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
          <select
            className="select"
            value={selectedSummaryId}
            onChange={(e) => setSelectedSummaryId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">不绑定摘要</option>
            {summaries.map((item) => (
              <option key={item.id} value={item.id}>摘要 #{item.id} ({item.summary_type})</option>
            ))}
          </select>
          <input
            className="input"
            placeholder="一句话汇报摘要"
            value={reflectionSummary}
            onChange={(e) => setReflectionSummary(e.target.value)}
          />
          <textarea
            className="textarea"
            placeholder="论文心得补充"
            value={reflectionNote}
            onChange={(e) => setReflectionNote(e.target.value)}
          />
          <label className="subtle">
            <input type="checkbox" checked={reportWorthy} onChange={(e) => setReportWorthy(e.target.checked)} /> 标记为可汇报
          </label>
          <Button
            disabled={busy !== ''}
            onClick={() =>
              runAction('reflection', async () => {
                await createPaperReflection(currentPaper.id, {
                  summary_id: selectedSummaryId === '' ? undefined : selectedSummaryId,
                  stage: readingStatus,
                  lifecycle_status: 'draft',
                  content_structured_json: {
                    paper_in_my_words: reflectionNote,
                    one_sentence_report_summary: reflectionSummary,
                  },
                  content_markdown: reflectionNote,
                  is_report_worthy: reportWorthy,
                  report_summary: reflectionSummary,
                });
                setReflectionNote('');
                setNotice('论文心得已创建');
              })
            }
          >
            {busy === 'reflection' ? '创建中...' : '创建论文心得'}
          </Button>
        </div>
      </div>

      <div className="card">
        <h4 className="title" style={{ fontSize: 16 }}>关联记录</h4>
        <p className="subtle">心得 {workspace.reflections.length} 条 · 任务 {workspace.recent_tasks.length} 条</p>
        {workspace.reflections.slice(0, 5).map((item) => (
          <div key={item.id} style={{ marginTop: 6 }}>
            <strong>心得#{item.id}</strong> {item.stage} {item.report_summary ? `- ${item.report_summary}` : ''}
          </div>
        ))}
      </div>

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      {notice ? <p style={{ color: '#0f766e' }}>{notice}</p> : null}
    </div>
  );
}
