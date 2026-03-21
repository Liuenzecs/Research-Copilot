"use client";

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import {
  createAiPaperReflection,
  createPaperReflection,
  deepSummaryStream,
  downloadPaper,
  getPaperPdfUrl,
  getPaperWorkspace,
  markPaperOpened,
  pushPaperToMemory,
  quickSummaryStream,
  updatePaperResearchState,
} from '@/lib/api';
import { formatDateTime, summaryTypeLabel, taskStatusLabel, taskTypeLabel } from '@/lib/presentation';
import { queryKeys } from '@/lib/queryKeys';
import {
  readingStatusLabel,
  READING_STATUS_OPTIONS,
  reproInterestLabel,
  REPRO_INTEREST_OPTIONS,
} from '@/lib/researchState';
import { reflectionsPath, reproductionPath } from '@/lib/routes';
import { AiReflectionMode, PaperWorkspace as PaperWorkspaceData, Reflection } from '@/lib/types';

type WorthReproducing = 'yes' | 'maybe' | 'no';
type SummarySelection = number | 'none' | 'auto';

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

function buildDraftFromContext(workspace: PaperWorkspaceData, summaryId: Exclude<SummarySelection, 'auto'>): ReflectionDraft {
  const summary = typeof summaryId === 'number' ? workspace.summaries.find((item) => item.id === summaryId) : undefined;

  const mostImportantContribution = firstNonEmpty(
    summary?.contributions_en,
    summary?.method_en,
    summary?.problem_en,
    summarizeText(summary?.content_en || ''),
    summarizeText(workspace.paper.abstract_en || ''),
    workspace.paper.title_en,
  );

  const whatILearned = firstNonEmpty(
    summarizeText(summary?.content_en || '', 360),
    summarizeText(workspace.paper.abstract_en || '', 360),
    workspace.paper.title_en,
  );

  const reportSummary = summarizeText(
    firstNonEmpty(
      summary?.contributions_en,
      summarizeText(workspace.paper.abstract_en || '', 120),
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

function buildDraftFromReflection(reflection: Reflection, fallbackWorth: WorthReproducing): ReflectionDraft {
  const structured = reflection.content_structured_json || {};
  const worth = structured.worth_reproducing;
  return {
    mostImportantContribution: structured.most_important_contribution || "",
    whatILearned: structured.what_i_learned || "",
    worthReproducing: worth === "yes" || worth === "maybe" || worth === "no" ? worth : fallbackWorth,
    reportSummary: reflection.report_summary || structured.one_sentence_report_summary || "",
    freeNotes: structured.free_notes || "",
  };
}

type PaperWorkspaceViewProps = {
  paperId: number | null;
  requestedSummaryId?: number | null;
  initialWorkspace?: PaperWorkspaceData | null;
  onWorkspaceChanged?: () => Promise<void> | void;
  showPaperHeader?: boolean;
  projectId?: number | null;
};

export default function PaperWorkspaceView({
  paperId,
  requestedSummaryId = null,
  initialWorkspace = null,
  onWorkspaceChanged,
  showPaperHeader = true,
  projectId = null,
}: PaperWorkspaceViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [workspace, setWorkspace] = useState<PaperWorkspaceData | null>(initialWorkspace);
  const [loading, setLoading] = useState(Boolean(paperId) && !initialWorkspace);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const [readingStatus, setReadingStatus] = useState('unread');
  const [interestLevel, setInterestLevel] = useState(3);
  const [reproInterest, setReproInterest] = useState('none');
  const [readAt, setReadAt] = useState('');
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
  const [selectedSummaryId, setSelectedSummaryId] = useState<SummarySelection>('auto');
  const [reflectionDirty, setReflectionDirty] = useState(false);
  const [lastPrefillKey, setLastPrefillKey] = useState('');
  const [appliedRequestedSummaryKey, setAppliedRequestedSummaryKey] = useState('');
  const [streamingSummary, setStreamingSummary] = useState<{ type: 'quick' | 'deep'; content: string } | null>(null);
  const [lastCreatedReflectionId, setLastCreatedReflectionId] = useState<number | null>(null);
  const workspaceQuery = useQuery({
    queryKey: paperId ? queryKeys.papers.workspace(paperId) : ['papers', 'workspace', 'inactive'],
    queryFn: ({ signal }) => getPaperWorkspace(paperId!, { signal }),
    enabled: Boolean(paperId),
  });

  const summaries = workspace?.summaries ?? [];
  const effectiveSummarySelection: Exclude<SummarySelection, 'auto'> =
    selectedSummaryId === 'auto' ? (summaries[0]?.id ?? 'none') : selectedSummaryId;

  const selectedSummary = useMemo(() => {
    if (typeof effectiveSummarySelection !== 'number') return undefined;
    return summaries.find((item) => item.id === effectiveSummarySelection);
  }, [effectiveSummarySelection, summaries]);

  function applyWorkspaceState(data: PaperWorkspaceData, preserveSelection = true) {
    setWorkspace(data);
    setReadingStatus(data.research_state.reading_status || 'unread');
    setInterestLevel(data.research_state.interest_level || 3);
    setReproInterest(data.research_state.repro_interest || 'none');
    setReadAt(data.research_state.read_at || '');
    setIsCorePaper(Boolean(data.research_state.is_core_paper));
    setTopicCluster(data.research_state.topic_cluster || '');
    setSelectedSummaryId((previous) => {
      if (!preserveSelection) {
        return data.summaries[0]?.id ?? 'none';
      }
      const summaryIds = data.summaries.map((item) => item.id);
      if (previous === 'auto') return data.summaries[0]?.id ?? 'none';
      if (previous === 'none') return 'none';
      if (summaryIds.includes(previous)) return previous;
      return data.summaries[0]?.id ?? 'none';
    });
  }

  useEffect(() => {
    if (workspaceQuery.data) {
      setError('');
      setLoading(false);
      applyWorkspaceState(workspaceQuery.data);
    }
  }, [workspaceQuery.data]);

  useEffect(() => {
    if (workspaceQuery.error) {
      setLoading(false);
      setError((workspaceQuery.error as Error).message);
    }
  }, [workspaceQuery.error]);

  async function reload() {
    if (!paperId) {
      setWorkspace(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.papers.workspace(paperId),
        queryFn: ({ signal }) => getPaperWorkspace(paperId, { signal }),
      });
      applyWorkspaceState(data);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!paperId) {
      setWorkspace(null);
      return;
    }

    if (initialWorkspace && initialWorkspace.paper.id === paperId) {
      applyWorkspaceState(initialWorkspace);
      queryClient.setQueryData(queryKeys.papers.workspace(paperId), initialWorkspace);
    }
  }, [initialWorkspace, paperId, queryClient]);

  useEffect(() => {
    if (!paperId) return;
    let cancelled = false;
    void markPaperOpened(paperId)
      .then((payload) => {
        if (cancelled) return;
        queryClient.setQueryData<PaperWorkspaceData | null>(queryKeys.papers.workspace(paperId), (current) =>
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
        // Ignore transient touch failures; the workspace itself can still be used.
      });
    return () => {
      cancelled = true;
    };
  }, [paperId, queryClient]);

  useEffect(() => {
    setLastCreatedReflectionId(null);
  }, [paperId]);

  useEffect(() => {
    if (!workspace) return;

    const prefillKey = [
      workspace.paper.id,
      String(effectiveSummarySelection),
      workspace.research_state.repro_interest || 'none',
      workspace.research_state.reading_status || 'unread',
    ].join(':');

    if (reflectionDirty && prefillKey === lastPrefillKey) return;

    setReflectionDraft(buildDraftFromContext(workspace, effectiveSummarySelection));
    setLastPrefillKey(prefillKey);
    setReflectionDirty(false);
  }, [effectiveSummarySelection, lastPrefillKey, reflectionDirty, workspace]);

  useEffect(() => {
    if (!requestedSummaryId) {
      setAppliedRequestedSummaryKey('');
      return;
    }

    if (!workspace) return;

    const requestKey = `${workspace.paper.id}:${requestedSummaryId}`;
    if (appliedRequestedSummaryKey === requestKey) return;

    if (workspace.summaries.some((item) => item.id === requestedSummaryId)) {
      setSelectedSummaryId(requestedSummaryId);
      setReflectionDirty(false);
      setAppliedRequestedSummaryKey(requestKey);
      setNotice('已定位到你指定的摘要。');
      return;
    }

    setAppliedRequestedSummaryKey(requestKey);
  }, [appliedRequestedSummaryKey, requestedSummaryId, workspace]);

  function updateReflectionDraft(patch: Partial<ReflectionDraft>) {
    setReflectionDraft((previous) => ({ ...previous, ...patch }));
    setReflectionDirty(true);
  }

  function applyGeneratedReflection(reflection: Reflection) {
    setReflectionDraft(buildDraftFromReflection(reflection, deriveWorthReproducing(reproInterest || 'none')));
    setReportWorthy(Boolean(reflection.is_report_worthy));
    if (reflection.related_summary_id) {
      setSelectedSummaryId(reflection.related_summary_id);
    }
    setLastCreatedReflectionId(reflection.id);
    setReflectionDirty(true);
  }

  async function runAction(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      await fn();
      await reload();
      await onWorkspaceChanged?.();
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function handleStreamingSummary(summaryType: 'quick' | 'deep') {
    if (!currentPaper) return;

    setBusy(summaryType);
    setError('');
    setNotice('');
    setStreamingSummary({ type: summaryType, content: '' });

    try {
      const result =
        summaryType === 'quick'
          ? await quickSummaryStream(currentPaper.id, {
              onDelta: (delta) =>
                setStreamingSummary((previous) =>
                  previous && previous.type === 'quick'
                    ? { ...previous, content: `${previous.content}${delta}` }
                    : { type: 'quick', content: delta },
                ),
            })
          : await deepSummaryStream(currentPaper.id, '', {
              onDelta: (delta) =>
                setStreamingSummary((previous) =>
                  previous && previous.type === 'deep'
                    ? { ...previous, content: `${previous.content}${delta}` }
                    : { type: 'deep', content: delta },
                ),
            });

      await reload();
      setSelectedSummaryId(result.id);
      setReflectionDirty(false);
      await onWorkspaceChanged?.();
      setNotice(summaryType === 'quick' ? '快速总结已生成，并已保存到当前摘要列表。' : '深度总结已生成，并已保存到当前摘要列表。');
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setStreamingSummary(null);
      setBusy('');
    }
  }

  async function handleAiReflection(mode: AiReflectionMode) {
    if (!currentPaper) return;
    setBusy(`ai-reflection-${mode}`);
    setError('');
    setNotice('');
    try {
      const createdReflection = await createAiPaperReflection(currentPaper.id, {
        mode,
        project_id: projectId,
        summary_id: typeof effectiveSummarySelection === 'number' ? effectiveSummarySelection : null,
        event_date: readAt || null,
      });
      await reload();
      applyGeneratedReflection(createdReflection);
      await onWorkspaceChanged?.();
      setNotice(
        mode === 'quick'
          ? 'AI 快速心得已生成并保存为草稿。'
          : mode === 'critical'
            ? 'AI 批判阅读已生成并保存为草稿。'
            : 'AI 导师汇报版已生成并保存为草稿。',
      );
    } catch (actionError) {
      setError((actionError as Error).message || 'AI 生成论文心得失败');
    } finally {
      setBusy('');
    }
  }

  const currentPaper = workspace?.paper;

  if (!paperId) {
    return <EmptyState title="未选择论文" hint="请先从论文搜索或文献库进入论文阅读页。" />;
  }

  if (loading && !workspace) {
    return <Loading text="加载论文工作区..." />;
  }

  if (!workspace || !currentPaper) {
    return <EmptyState title="论文工作区不可用" hint={error || '请稍后重试。'} />;
  }

  const actionButtons = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <Button
        disabled={busy !== ''}
        onClick={() =>
          runAction('download', async () => {
            const result = await downloadPaper(currentPaper.id);
            setNotice(`PDF 已保存到：${result.pdf_local_path}`);
          })
        }
      >
        {busy === 'download' ? '下载中...' : '下载 PDF'}
      </Button>
      <Button
        className="secondary"
        disabled={!currentPaper.pdf_local_path}
        onClick={() => window.open(getPaperPdfUrl(currentPaper.id, true), '_blank', 'noopener,noreferrer')}
        title={currentPaper.pdf_local_path ? '在浏览器打开或保存 PDF' : '请先下载 PDF'}
      >
        打开原始 PDF
      </Button>
      <Button
        className="secondary"
        disabled={busy !== ''}
        onClick={() => void handleStreamingSummary('quick')}
      >
        {busy === 'quick' ? '生成中...' : '快速总结'}
      </Button>
      <Button
        className="secondary"
        disabled={busy !== ''}
        onClick={() => void handleStreamingSummary('deep')}
      >
        {busy === 'deep' ? '生成中...' : '深度总结'}
      </Button>
      <Button
        className="secondary"
        disabled={busy !== ''}
        onClick={() =>
          runAction('memory', async () => {
            await pushPaperToMemory(currentPaper.id);
            setNotice('论文已推送到长期记忆。');
          })
        }
      >
        {busy === 'memory' ? '处理中...' : '推送到记忆'}
      </Button>
      <Button className="secondary" type="button" onClick={() => navigate(reproductionPath({ paperId: currentPaper.id, projectId }))}>
        进入复现工作区
      </Button>
      <Button className="secondary" type="button" onClick={() => navigate(reflectionsPath({ paperId: currentPaper.id, projectId }))}>
        查看这篇论文的心得
      </Button>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...(notice ? [{ variant: 'success' as const, message: notice }] : []),
        ]}
      />

      {lastCreatedReflectionId ? (
        <div className="card">
          <h4 className="title" style={{ fontSize: 16 }}>
            刚保存的论文心得
          </h4>
          <p className="subtle" style={{ marginTop: 4 }}>
            已同步到“研究心得”页，也会出现在下方的关联记录里。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Button type="button" onClick={() => navigate(reflectionsPath({ reflectionId: lastCreatedReflectionId, paperId: currentPaper.id, projectId }))}>
              查看刚保存的心得
            </Button>
            <Button className="secondary" type="button" onClick={() => navigate(reflectionsPath({ paperId: currentPaper.id, projectId }))}>
              查看这篇论文的所有心得
            </Button>
          </div>
        </div>
      ) : null}

      {showPaperHeader ? (
        <div className="card">
          <h3 className="title" style={{ fontSize: 18 }}>
            {currentPaper.title_en}
          </h3>
          <p className="subtle">{currentPaper.authors || '作者未知'}</p>
          <p className="subtle">
            {currentPaper.source} · {currentPaper.year ?? '年份未知'} · PDF：{currentPaper.pdf_local_path || '未下载'}
          </p>
          <p className="subtle">
            最近打开时间：{workspace.research_state.last_opened_at ? formatDateTime(workspace.research_state.last_opened_at) : '暂无'}
            {' · '}
            计入阅读日期：{workspace.research_state.read_at || '未设置'}
          </p>
          {actionButtons}
        </div>
      ) : (
        <div className="card">
          <h3 className="title" style={{ fontSize: 16 }}>
            论文工作区
          </h3>
          <p className="subtle" style={{ marginTop: 4 }}>
            在这里继续完成摘要、研究状态、心得和复现衔接。
          </p>
          {actionButtons}
        </div>
      )}

      <div className="card">
        <h4 className="title" style={{ fontSize: 16 }}>
          阅读状态
        </h4>
        <div className="grid-2" style={{ marginTop: 8 }}>
          <select className="select" value={readingStatus} onChange={(event) => setReadingStatus(event.target.value)}>
            {READING_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select className="select" value={reproInterest} onChange={(event) => setReproInterest(event.target.value)}>
            {REPRO_INTEREST_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid-2" style={{ marginTop: 8 }}>
          <input
            className="input"
            max={5}
            min={1}
            placeholder="兴趣分 1-5"
            type="number"
            value={interestLevel}
            onChange={(event) => setInterestLevel(Number(event.target.value))}
          />
          <input
            className="input"
            placeholder="主题分组"
            value={topicCluster}
            onChange={(event) => setTopicCluster(event.target.value)}
          />
        </div>

        <div className="grid-2" style={{ marginTop: 8 }}>
          <input
            className="input"
            type="date"
            value={readAt}
            onChange={(event) => setReadAt(event.target.value)}
          />
          <div className="subtle" style={{ display: 'flex', alignItems: 'center' }}>
            最近打开：{workspace.research_state.last_opened_at ? formatDateTime(workspace.research_state.last_opened_at) : '暂无'}
          </div>
        </div>

        <p className="subtle" style={{ marginTop: 8 }}>
          当前计入阅读日期：{workspace.research_state.read_at || '未设置'}
        </p>

        <label className="subtle" style={{ display: 'block', marginTop: 8 }}>
          <input type="checkbox" checked={isCorePaper} onChange={(event) => setIsCorePaper(event.target.checked)} /> 核心论文
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
                  read_at: readAt || null,
                  clear_read_at: !readAt,
                  topic_cluster: topicCluster,
                  is_core_paper: isCorePaper,
                });
                setNotice('阅读状态已更新。');
              })
            }
          >
            {busy === 'state' ? '保存中...' : '更新阅读状态'}
          </Button>
        </div>
      </div>

      <div className="card">
        <h4 className="title" style={{ fontSize: 16 }}>
          当前摘要与论文心得
        </h4>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, marginBottom: 10 }}>
          <Button className="secondary" type="button" disabled={busy !== ''} onClick={() => void handleAiReflection('quick')}>
            {busy === 'ai-reflection-quick' ? '生成中...' : 'AI 快速心得'}
          </Button>
          <Button className="secondary" type="button" disabled={busy !== ''} onClick={() => void handleAiReflection('critical')}>
            {busy === 'ai-reflection-critical' ? '生成中...' : 'AI 批判阅读'}
          </Button>
          <Button className="secondary" type="button" disabled={busy !== ''} onClick={() => void handleAiReflection('advisor')}>
            {busy === 'ai-reflection-advisor' ? '生成中...' : 'AI 导师汇报版'}
          </Button>
        </div>

        {streamingSummary ? (
          <>
            <p className="subtle">正在流式生成：{streamingSummary.type === 'quick' ? '快速总结' : '深度总结'}</p>
            <p className="subtle" style={{ color: '#2563eb' }}>
              模型输出会实时追加；完成后会自动保存为新的摘要记录。
            </p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{streamingSummary.content || '正在连接模型并开始生成...'}</p>
          </>
        ) : selectedSummary ? (
          <>
            <p className="subtle">
              当前摘要：{summaryTypeLabel(selectedSummary.summary_type)} · 生成方式：
              {selectedSummary.provider || 'heuristic'}/{selectedSummary.model || 'local'}
            </p>
            {selectedSummary.provider === 'heuristic' ? (
              <p className="subtle" style={{ color: '#b45309' }}>
                当前是本地兜底摘要。若你已配置 DeepSeek/OpenAI，请重启后端使配置生效。
              </p>
            ) : null}
            <p style={{ whiteSpace: 'pre-wrap' }}>{selectedSummary.content_en}</p>
          </>
        ) : summaries.length > 0 ? (
          <p className="subtle">当前选择为“不绑定摘要”。这里不显示摘要内容；心得预填会回退到论文标题和摘要。</p>
        ) : (
          <p className="subtle">暂无摘要，请先执行快速总结或深度总结。</p>
        )}

        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <p className="subtle" style={{ margin: 0 }}>
            上下文：当前论文
            {selectedSummary ? ' · 已绑定当前摘要' : ' · 仅论文上下文'}
            {' · 当前阅读阶段 '}
            {readingStatusLabel(readingStatus)}
            {' · 复现兴趣 '}
            {reproInterestLabel(reproInterest)}
          </p>
          <select
            className="select"
            value={String(effectiveSummarySelection)}
            onChange={(event) => {
              setSelectedSummaryId(event.target.value === 'none' ? 'none' : Number(event.target.value));
              setReflectionDirty(false);
            }}
          >
            <option value="none">不绑定摘要</option>
            {summaries.map((item) => (
              <option key={item.id} value={item.id}>
                {summaryTypeLabel(item.summary_type)}
              </option>
            ))}
          </select>
          <textarea
            className="textarea"
            placeholder="最重要贡献（可编辑预填）"
            value={reflectionDraft.mostImportantContribution}
            onChange={(event) => updateReflectionDraft({ mostImportantContribution: event.target.value })}
          />
          <textarea
            className="textarea"
            placeholder="我学到了什么（可编辑预填）"
            value={reflectionDraft.whatILearned}
            onChange={(event) => updateReflectionDraft({ whatILearned: event.target.value })}
          />
          <select
            className="select"
            value={reflectionDraft.worthReproducing}
            onChange={(event) => updateReflectionDraft({ worthReproducing: event.target.value as WorthReproducing })}
          >
            <option value="yes">值得复现</option>
            <option value="maybe">可评估后再决定</option>
            <option value="no">暂不复现</option>
          </select>
          <input
            className="input"
            placeholder="一句话汇报摘要（可编辑预填）"
            value={reflectionDraft.reportSummary}
            onChange={(event) => updateReflectionDraft({ reportSummary: event.target.value })}
          />
          <textarea
            className="textarea"
            placeholder="自由补充笔记"
            value={reflectionDraft.freeNotes}
            onChange={(event) => updateReflectionDraft({ freeNotes: event.target.value })}
          />
          <label className="subtle">
            <input type="checkbox" checked={reportWorthy} onChange={(event) => setReportWorthy(event.target.checked)} /> 标记为可汇报
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              className="secondary"
              disabled={!workspace}
              type="button"
              onClick={() => {
                if (!workspace) return;
                setReflectionDraft(buildDraftFromContext(workspace, effectiveSummarySelection));
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
                  const selectedSummaryValue = typeof effectiveSummarySelection === 'number' ? effectiveSummarySelection : undefined;
                  const markdownSections = [
                    reflectionDraft.mostImportantContribution ? `## Most Important Contribution\n${reflectionDraft.mostImportantContribution}` : '',
                    reflectionDraft.whatILearned ? `## What I Learned\n${reflectionDraft.whatILearned}` : '',
                    reflectionDraft.freeNotes ? `## Free Notes\n${reflectionDraft.freeNotes}` : '',
                  ].filter(Boolean);

                  const createdReflection = await createPaperReflection(currentPaper.id, {
                    summary_id: selectedSummaryValue,
                    stage: readingStatus,
                    lifecycle_status: 'draft',
                    event_date: readAt || undefined,
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
                  setLastCreatedReflectionId(createdReflection.id);
                  setReflectionDirty(false);
                  setNotice('论文心得已保存；可以直接打开“研究心得”页继续查看。');
                })
              }
            >
              {busy === 'reflection' ? '创建中...' : '创建论文心得'}
            </Button>
          </div>
        </div>
      </div>

      <div className="card">
        <h4 className="title" style={{ fontSize: 16 }}>
          关联记录
        </h4>
        <p className="subtle">心得 {workspace.reflections.length} 条 · 最近任务 {workspace.recent_tasks.length} 条</p>

        <p className="subtle" style={{ marginTop: 4 }}>
          这里只显示最近 5 条心得；完整记录可以在“研究心得”页里按当前论文筛选查看。
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, marginBottom: 10 }}>
          <Button className="secondary" type="button" onClick={() => navigate(reflectionsPath({ paperId: currentPaper.id, projectId }))}>
            查看这篇论文的全部心得
          </Button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {workspace.reflections.slice(0, 5).map((item) => (
            <div key={item.id} className="reader-meta-card">
              <strong>论文心得</strong>
              <div className="subtle">
                {readingStatusLabel(item.stage)} · {item.report_summary || '暂无汇报摘要'}
              </div>
            </div>
          ))}
          {workspace.reflections.length === 0 ? <p className="subtle">当前还没有论文心得。</p> : null}
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {workspace.recent_tasks.slice(0, 5).map((task) => (
            <div key={task.id} className="reader-meta-card">
              <strong>{taskTypeLabel(task.task_type)}</strong>
              <div className="subtle">
                {taskStatusLabel(task.status)} · 创建于 {formatDateTime(task.created_at)}
              </div>
            </div>
          ))}
          {workspace.recent_tasks.length === 0 ? <p className="subtle">当前还没有近期任务记录。</p> : null}
        </div>
      </div>
    </div>
  );
}
