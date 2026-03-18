"use client";

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import ReproStepTracker from '@/components/reproduction/ReproStepTracker';
import {
  createReproductionReflection,
  createReproductionStepLog,
  findRepos,
  getPaper,
  getReproductionDetail,
  listReproductions,
  planReproduction,
  searchPapers,
  updateReproduction,
  updateReproductionStep,
} from '@/lib/api';
import { projectPath } from '@/lib/routes';
import { Paper, ReproductionDetail, ReproductionListItem, RepoCandidate } from '@/lib/types';

type ContextMode = 'idle' | 'ready_new' | 'continuing_recent' | 'detail';
type RecentReproductionItem = ReproductionListItem & { paperTitle?: string };

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function buildReproductionUrl(params: { paperId?: number | null; reproductionId?: number | null; projectId?: number | null }) {
  const search = new URLSearchParams();
  if (params.paperId) {
    search.set('paper_id', String(params.paperId));
  }
  if (params.reproductionId) {
    search.set('reproduction_id', String(params.reproductionId));
  }
  if (params.projectId) {
    search.set('project_id', String(params.projectId));
  }
  const query = search.toString();
  return query ? `/reproduction?${query}` : '/reproduction';
}

function formatDateTime(value?: string | null) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

function statusLabel(status: string) {
  switch (status) {
    case 'planned':
      return '已规划';
    case 'in_progress':
      return '进行中';
    case 'done':
      return '已完成';
    case 'blocked':
      return '已阻塞';
    default:
      return status;
  }
}

function contextModeLabel(mode: ContextMode) {
  switch (mode) {
    case 'continuing_recent':
      return '继续最近一次复现';
    case 'detail':
      return '查看指定复现';
    case 'ready_new':
      return '准备新建复现';
    default:
      return '等待上下文';
  }
}

function ReproductionPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryPaperId = parsePositiveInt(searchParams.get('paper_id'));
  const queryReproductionId = parsePositiveInt(searchParams.get('reproduction_id'));
  const projectId = parsePositiveInt(searchParams.get('project_id'));

  const [paperLookupQuery, setPaperLookupQuery] = useState('');
  const [paperLookupResults, setPaperLookupResults] = useState<Paper[]>([]);
  const [paperLookupLoading, setPaperLookupLoading] = useState(false);
  const [recentReproductions, setRecentReproductions] = useState<RecentReproductionItem[]>([]);
  const [info, setInfo] = useState('');

  const [contextMode, setContextMode] = useState<ContextMode>('idle');
  const [contextMessage, setContextMessage] = useState('');
  const [activePaper, setActivePaper] = useState<Paper | null>(null);
  const [repoCandidates, setRepoCandidates] = useState<RepoCandidate[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);

  const [detail, setDetail] = useState<ReproductionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState('');

  const [progressSummary, setProgressSummary] = useState('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const [todayWork, setTodayWork] = useState('');
  const [issue, setIssue] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [reportSummary, setReportSummary] = useState('');
  const [reportWorthy, setReportWorthy] = useState(false);

  function applyDetail(data: ReproductionDetail) {
    setDetail(data);
    setProgressSummary(data.progress_summary || '');
    setProgressPercent(data.progress_percent ?? 0);
  }

  async function loadDetail(id: number) {
    const data = await getReproductionDetail(id);
    applyDetail(data);
    return data;
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromQuery() {
      setLoading(true);
      setBusy('');
      setError('');
      setNotice('');
      setInfo('');
      setWarnings([]);

      if (queryReproductionId) {
        setContextMode('detail');
        setContextMessage('你正在查看指定复现。');
        setRepoCandidates([]);
        setSelectedRepoId(null);

        try {
          const reproduction = await getReproductionDetail(queryReproductionId);
          if (cancelled) return;
          applyDetail(reproduction);

          if (reproduction.paper_id) {
            try {
              const paper = await getPaper(reproduction.paper_id);
              if (cancelled) return;
              setActivePaper(paper);
            } catch (paperError) {
              if (cancelled) return;
              setActivePaper(null);
              setWarnings([`论文上下文加载失败：${(paperError as Error).message}`]);
            }
          } else {
            setActivePaper(null);
          }
        } catch (e) {
          if (cancelled) return;
          setDetail(null);
          setActivePaper(null);
          setError((e as Error).message);
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
        return;
      }

      if (queryPaperId) {
        const nextWarnings: string[] = [];
        setDetail(null);
        setSelectedRepoId(null);

        try {
          const paper = await getPaper(queryPaperId);
          if (cancelled) return;
          setActivePaper(paper);

          const [repoResult, reproductionResult] = await Promise.allSettled([
            findRepos({ paper_id: queryPaperId, query: paper.title_en }),
            listReproductions({ paper_id: queryPaperId, limit: 1 }),
          ]);

          if (cancelled) return;

          if (repoResult.status === 'fulfilled') {
            setRepoCandidates(repoResult.value.items);
          } else {
            setRepoCandidates([]);
            nextWarnings.push(`Repo 自动搜索失败：${(repoResult.reason as Error).message}。你仍可按仅论文上下文继续。`);
          }

          if (reproductionResult.status === 'fulfilled' && reproductionResult.value.length > 0) {
            try {
              const latestReproduction = await getReproductionDetail(reproductionResult.value[0].reproduction_id);
              if (cancelled) return;
              applyDetail(latestReproduction);
              setContextMode('continuing_recent');
              setContextMessage('你正在继续最近一次复现。');
            } catch (reproError) {
              if (cancelled) return;
              setDetail(null);
              setContextMode('ready_new');
              setContextMessage('当前论文暂无可继续的复现记录，已准备新建。');
              nextWarnings.push(`最近复现加载失败：${(reproError as Error).message}。这不会影响你新建复现。`);
            }
          } else {
            setDetail(null);
            setContextMode('ready_new');
            setContextMessage('当前论文暂无历史复现，已准备新建。');
            if (reproductionResult.status === 'rejected') {
              nextWarnings.push(`历史复现查询失败：${(reproductionResult.reason as Error).message}。这不会影响你新建复现。`);
            }
          }

          setWarnings(nextWarnings);
        } catch (e) {
          if (cancelled) return;
          setActivePaper(null);
          setRepoCandidates([]);
          setSelectedRepoId(null);
          setContextMode('idle');
          setContextMessage('');
          setError((e as Error).message);
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
        return;
      }

      setActivePaper(null);
      setRepoCandidates([]);
      setSelectedRepoId(null);
      setDetail(null);
      setContextMode('idle');
      setContextMessage('');
      setLoading(false);
    }

    void hydrateFromQuery();
    return () => {
      cancelled = true;
    };
  }, [queryPaperId, queryReproductionId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentReproductions() {
      try {
        const rows = await listReproductions({ limit: 8, project_id: projectId || undefined });
        if (cancelled) return;

        const paperIds = Array.from(
          new Set(
            rows
              .map((item) => item.paper_id)
              .filter((value): value is number => typeof value === 'number' && value > 0),
          ),
        );

        const titleEntries = await Promise.all(
          paperIds.map(async (paperId) => {
            try {
              const paper = await getPaper(paperId);
              return [paperId, paper.title_en] as const;
            } catch {
              return [paperId, '未能加载论文标题'] as const;
            }
          }),
        );

        if (cancelled) return;

        const paperTitleMap = new Map<number, string>(titleEntries);
        setRecentReproductions(
          rows.map((item) => ({
            ...item,
            paperTitle: item.paper_id ? paperTitleMap.get(item.paper_id) ?? '未命名论文' : '未绑定论文',
          })),
        );
      } catch {
        if (!cancelled) {
          setRecentReproductions([]);
        }
      }
    }

    void loadRecentReproductions();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function refreshDetail() {
    if (!detail) return;
    const latest = await loadDetail(detail.reproduction_id);
    if (latest.paper_id && (!activePaper || activePaper.id !== latest.paper_id)) {
      try {
        const paper = await getPaper(latest.paper_id);
        setActivePaper(paper);
      } catch {
        setWarnings((previous) => {
          const message = '论文上下文刷新失败，但当前复现详情仍可继续查看。';
          return previous.includes(message) ? previous : [...previous, message];
        });
      }
    }
  }

  async function runBusyAction(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError('');
    setNotice('');
    setInfo('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function searchPaperContext() {
    if (!paperLookupQuery.trim()) {
      setError('请输入论文标题或关键词。');
      return;
    }

    setPaperLookupLoading(true);
    setError('');
    setNotice('');
    setInfo('');
    try {
      const payload = await searchPapers(paperLookupQuery.trim(), 6);
      const items = payload.items ?? [];
      setPaperLookupResults(items);
      if (items.length > 0) {
        setNotice(`已找到 ${items.length} 篇候选论文，请直接选择进入复现工作区。`);
      } else {
        setInfo('没有找到匹配论文。你可以换一个标题关键词重试。');
      }
    } catch (searchError) {
      setError((searchError as Error).message || '论文搜索失败，请稍后重试。');
    } finally {
      setPaperLookupLoading(false);
    }
  }

  const selectedRepo = repoCandidates.find((item) => item.id === selectedRepoId) ?? null;
  const currentRepo = detail?.repo ?? selectedRepo;
  const currentReproductionId = detail?.reproduction_id ?? null;
  const shouldShowContextCard = Boolean(activePaper || detail);

  const contextSummary = useMemo(() => {
    if (detail?.repo) {
      return `当前计划绑定 repo：${detail.repo.owner}/${detail.repo.name}`;
    }
    if (detail) {
      return '当前计划未绑定代码仓，按仅论文上下文推进。';
    }
    if (selectedRepo) {
      return `当前准备使用 repo：${selectedRepo.owner}/${selectedRepo.name}`;
    }
    if (activePaper) {
      return '当前尚未选择代码仓，你仍可直接按仅论文上下文新建复现。';
    }
    return '';
  }, [activePaper, detail, selectedRepo]);

  const planButtonLabel = detail && contextMode === 'continuing_recent'
    ? selectedRepo
      ? '新建新的复现记录（使用选中 Repo）'
      : '新建新的复现记录（仅论文上下文）'
    : selectedRepo
      ? '用选中 Repo 生成复现计划'
      : '按仅论文上下文生成复现计划';

  return (
    <>
      <Card>
        <h2 className="title">复现工作区</h2>
        <p className="subtle">流程：paper 上下文 → repo 候选 → 计划生成 → 步骤跟踪 → blocker/log 记录 → 复现心得。</p>
        {projectId ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <span className="subtle">当前为项目上下文复现视图</span>
            <Button className="secondary" type="button" onClick={() => router.push(projectPath(projectId))}>
              返回项目工作台
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h3 className="title" style={{ fontSize: 16, margin: 0 }}>手工入口（按论文标题选择）</h3>
        <p className="subtle" style={{ margin: 0 }}>
          不需要记住任何论文编号或复现编号。直接按论文标题搜索，或从最近复现记录中继续即可。
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="输入论文标题或关键词，例如 diffusion reproducibility"
            value={paperLookupQuery}
            onChange={(event) => setPaperLookupQuery(event.target.value)}
            style={{ flex: '1 1 320px' }}
          />
          <Button className="secondary" disabled={paperLookupLoading || busy !== ''} onClick={() => void searchPaperContext()}>
            {paperLookupLoading ? '搜索中...' : '搜索论文并进入复现'}
          </Button>
        </div>
        {paperLookupResults.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {paperLookupResults.map((paper) => (
              <button
                key={paper.id}
                type="button"
                className="reader-meta-card"
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => router.push(buildReproductionUrl({ paperId: paper.id, projectId }))}
              >
                <strong>{paper.title_en}</strong>
                <div className="subtle">{paper.source} · {paper.year ?? 'N/A'}</div>
              </button>
            ))}
          </div>
        ) : null}
        <div style={{ display: 'grid', gap: 8 }}>
          <strong>最近复现记录</strong>
          {recentReproductions.length > 0 ? (
            recentReproductions.map((item) => (
              <button
                key={item.reproduction_id}
                type="button"
                className="reader-meta-card"
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => router.push(buildReproductionUrl({ reproductionId: item.reproduction_id, projectId }))}
              >
                <strong>{item.paperTitle || '未绑定论文'}</strong>
                <div className="subtle">
                  {statusLabel(item.status)} · {item.progress_percent ?? 0}% · {item.progress_summary || '暂无进度摘要'}
                </div>
                <div className="subtle">最后更新：{formatDateTime(item.updated_at)}</div>
              </button>
            ))
          ) : (
            <p className="subtle" style={{ margin: 0 }}>当前还没有最近复现记录。你可以先按论文标题搜索进入复现上下文。</p>
          )}
        </div>
      </div>

      {loading ? <Loading text="加载复现工作区..." /> : null}

      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...warnings.map((message) => ({ variant: 'warning' as const, message })),
          ...(info ? [{ variant: 'info' as const, message: info }] : []),
          ...(notice ? [{ variant: 'success' as const, message: notice }] : []),
        ]}
      />

      {shouldShowContextCard ? (
        <Card>
          <h3 className="title" style={{ fontSize: 16 }}>当前复现上下文</h3>
          <p style={{ marginBottom: 6 }}>
            <strong>{contextModeLabel(contextMode)}</strong>
          </p>
          {contextMessage ? <p className="subtle" style={{ marginTop: 0 }}>{contextMessage}</p> : null}
          {activePaper ? (
            <p className="subtle" style={{ margin: 0 }}>
              论文：{activePaper.title_en}
            </p>
          ) : (
            <p className="subtle" style={{ margin: 0 }}>当前未加载到论文上下文。</p>
          )}
          {detail ? (
            <>
              <p className="subtle" style={{ margin: '6px 0 0 0' }}>
                当前复现记录 · 状态：{statusLabel(detail.status)} · 进度：{detail.progress_percent ?? 0}%
              </p>
              <p className="subtle" style={{ margin: '6px 0 0 0' }}>
                进度摘要：{detail.progress_summary || '尚未填写'}
              </p>
              <p className="subtle" style={{ margin: '6px 0 0 0' }}>
                最后更新：{formatDateTime(detail.updated_at)}
              </p>
            </>
          ) : (
            <p className="subtle" style={{ margin: '6px 0 0 0' }}>当前还没有打开复现记录，正在准备新建。</p>
          )}
          <p className="subtle" style={{ margin: '6px 0 0 0' }}>{contextSummary}</p>
          {currentRepo ? (
            <p className="subtle" style={{ margin: '6px 0 0 0' }}>
              Repo：{currentRepo.owner}/{currentRepo.name} · <a href={currentRepo.repo_url} target="_blank" rel="noopener noreferrer">{currentRepo.repo_url}</a>
            </p>
          ) : detail ? (
            <p className="subtle" style={{ margin: '6px 0 0 0' }}>代码仓：当前计划未绑定代码仓，按仅论文上下文推进。</p>
          ) : null}
        </Card>
      ) : null}

      {activePaper ? (
        <Card>
          <h3 className="title" style={{ fontSize: 16 }}>Repo 候选与新建复现</h3>
          <p className="subtle">
            默认使用当前论文标题自动搜索代码仓。你可以选择某个代码仓生成新计划，也可以不选代码仓，直接按仅论文上下文推进。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <Button
              disabled={busy !== ''}
              onClick={() =>
                runBusyAction('plan', async () => {
                  const result = await planReproduction({
                    paper_id: activePaper.id,
                    repo_id: selectedRepoId,
                  });
                  setNotice(selectedRepoId ? '已基于选中代码仓创建新的复现记录。' : '已按仅论文上下文创建新的复现记录。');
                  router.push(buildReproductionUrl({ paperId: activePaper.id, reproductionId: result.reproduction_id, projectId }));
                })
              }
            >
              {busy === 'plan' ? '生成中...' : planButtonLabel}
            </Button>
            <Button className="secondary" disabled={busy !== ''} onClick={() => setSelectedRepoId(null)}>
              清空 Repo 选择
            </Button>
          </div>

          {repoCandidates.length > 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {repoCandidates.map((repo) => (
                <label
                  key={repo.id}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    border: selectedRepoId === repo.id ? '1px solid #0f766e' : undefined,
                    display: 'grid',
                    gap: 4,
                    margin: 0,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      checked={selectedRepoId === repo.id}
                      name="repo-candidate"
                      type="radio"
                      onChange={() => setSelectedRepoId(repo.id)}
                    />
                    <strong>{repo.owner}/{repo.name}</strong>
                    <span className="subtle">⭐ {repo.stars} · Forks {repo.forks}</span>
                  </div>
                  <a href={repo.repo_url} target="_blank" rel="noopener noreferrer">{repo.repo_url}</a>
                  <p className="subtle" style={{ margin: 0 }}>{repo.readme_summary || '暂无 README 摘要。'}</p>
                </label>
              ))}
            </div>
          ) : (
            <p className="subtle">当前没有可用的代码仓候选，你仍可直接按仅论文上下文生成计划。</p>
          )}
        </Card>
      ) : null}

      {detail ? (
        <>
          <Card>
            <h3 className="title" style={{ fontSize: 16 }}>复现概览</h3>
            <p className="subtle">
              状态：{statusLabel(detail.status)} · 进度：{detail.progress_percent ?? 0}% · 代码仓：{detail.repo ? `${detail.repo.owner}/${detail.repo.name}` : '仅论文上下文'}
            </p>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{detail.plan_markdown}</pre>
          </Card>

          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>更新整体进度</h4>
            <input
              className="input"
              placeholder="请填写当前复现进度摘要"
              value={progressSummary}
              onChange={(event) => setProgressSummary(event.target.value)}
            />
            <input
              className="input"
              max={100}
              min={0}
              type="number"
              value={progressPercent}
              onChange={(event) => setProgressPercent(Number(event.target.value))}
            />
            <Button
              className="secondary"
              disabled={busy !== ''}
              onClick={() =>
                runBusyAction('progress', async () => {
                  if (!currentReproductionId) return;
                  await updateReproduction(currentReproductionId, {
                    progress_summary: progressSummary,
                    progress_percent: progressPercent,
                  });
                  await refreshDetail();
                  setNotice('复现整体进度已保存。');
                })
              }
            >
              {busy === 'progress' ? '保存中...' : '保存进度'}
            </Button>
          </div>

          <ReproStepTracker
            detail={detail}
            onUpdateStep={async (stepId, payload) => {
              if (!currentReproductionId) return;
              await updateReproductionStep(currentReproductionId, stepId, payload);
              await refreshDetail();
              setNotice(payload.step_status === 'blocked' ? '步骤已标记为阻塞。' : '步骤信息已保存。');
            }}
            onCreateLog={async (stepId, payload) => {
              if (!currentReproductionId) return;
              await createReproductionStepLog(currentReproductionId, stepId, payload);
              await refreshDetail();
              setNotice(payload.log_kind === 'blocker' ? '阻塞日志已保存，并已自动将该步骤标记为阻塞。' : '步骤日志已保存，并已给出下一步建议。');
            }}
          />

          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>复现心得快速记录</h4>
            <textarea className="textarea" placeholder="我今天做了什么" value={todayWork} onChange={(event) => setTodayWork(event.target.value)} />
            <textarea className="textarea" placeholder="遇到的问题" value={issue} onChange={(event) => setIssue(event.target.value)} />
            <textarea className="textarea" placeholder="下一步" value={nextStep} onChange={(event) => setNextStep(event.target.value)} />
            <input className="input" placeholder="一句话汇报摘要" value={reportSummary} onChange={(event) => setReportSummary(event.target.value)} />
            <label className="subtle">
              <input type="checkbox" checked={reportWorthy} onChange={(event) => setReportWorthy(event.target.checked)} /> 标记为可汇报
            </label>
            <Button
              disabled={busy !== ''}
              onClick={() =>
                runBusyAction('reflection', async () => {
                  if (!currentReproductionId) return;
                  await createReproductionReflection(currentReproductionId, {
                    stage: 'progress',
                    lifecycle_status: 'draft',
                    is_report_worthy: reportWorthy,
                    report_summary: reportSummary,
                    content_structured_json: {
                      what_i_did_today: todayWork,
                      issues_encountered: issue,
                      next_step: nextStep,
                      one_sentence_report_summary: reportSummary,
                    },
                    content_markdown: [todayWork, issue, nextStep].filter(Boolean).join('\n\n'),
                  });
                  setTodayWork('');
                  setIssue('');
                  setNextStep('');
                  setReportSummary('');
                  setReportWorthy(false);
                  await refreshDetail();
                  setNotice(reportWorthy ? '复现心得已创建，并可进入周报上下文使用。' : '复现心得已创建。');
                })
              }
            >
              {busy === 'reflection' ? '创建中...' : '创建复现心得'}
            </Button>
          </div>
        </>
      ) : null}

      {!loading && !activePaper && !detail && !error ? (
        <EmptyState title="等待复现上下文" hint="请从论文阅读页进入，或在上方按论文标题搜索/从最近复现记录中选择。" />
      ) : null}
    </>
  );
}

export default function ReproductionPage() {
  return (
    <Suspense fallback={<Loading text="加载复现工作区..." />}>
      <ReproductionPageContent />
    </Suspense>
  );
}
