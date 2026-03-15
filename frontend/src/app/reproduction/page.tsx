"use client";

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import ReproStepTracker from '@/components/reproduction/ReproStepTracker';
import {
  createReproductionReflection,
  createReproductionStepLog,
  findRepos,
  getPaper,
  getReproductionDetail,
  listReproductions,
  planReproduction,
  updateReproduction,
  updateReproductionStep,
} from '@/lib/api';
import { Paper, ReproductionDetail, RepoCandidate } from '@/lib/types';

type ContextMode = 'idle' | 'ready_new' | 'continuing_recent' | 'detail';

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function buildReproductionUrl(params: { paperId?: number | null; reproductionId?: number | null }) {
  const search = new URLSearchParams();
  if (params.paperId) {
    search.set('paper_id', String(params.paperId));
  }
  if (params.reproductionId) {
    search.set('reproduction_id', String(params.reproductionId));
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

  const [manualPaperId, setManualPaperId] = useState('');
  const [manualReproductionId, setManualReproductionId] = useState('');

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
      setWarnings([]);
      setManualPaperId(queryPaperId ? String(queryPaperId) : '');
      setManualReproductionId(queryReproductionId ? String(queryReproductionId) : '');

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
            nextWarnings.push(`Repo 自动搜索失败：${(repoResult.reason as Error).message}。你仍可按 paper-only 继续。`);
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
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
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
      return '当前计划未绑定 repo，按 paper-only 推进。';
    }
    if (selectedRepo) {
      return `当前准备使用 repo：${selectedRepo.owner}/${selectedRepo.name}`;
    }
    if (activePaper) {
      return '当前尚未选择 repo，你仍可直接按 paper-only 新建复现。';
    }
    return '';
  }, [activePaper, detail, selectedRepo]);

  const planButtonLabel = detail && contextMode === 'continuing_recent'
    ? selectedRepo
      ? '新建新的复现记录（使用选中 Repo）'
      : '新建新的复现记录（paper-only）'
    : selectedRepo
      ? '用选中 Repo 生成复现计划'
      : '按 paper-only 生成复现计划';

  return (
    <>
      <Card>
        <h2 className="title">复现工作区</h2>
        <p className="subtle">流程：paper 上下文 → repo 候选 → 计划生成 → 步骤跟踪 → blocker/log 记录 → 复现心得。</p>
      </Card>

      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h3 className="title" style={{ fontSize: 16, margin: 0 }}>手工入口（次要）</h3>
        <div className="grid-2">
          <input
            className="input"
            placeholder="输入 paper_id 后载入论文上下文"
            value={manualPaperId}
            onChange={(event) => setManualPaperId(event.target.value)}
          />
          <input
            className="input"
            placeholder="输入 reproduction_id 直接打开"
            value={manualReproductionId}
            onChange={(event) => setManualReproductionId(event.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            className="secondary"
            disabled={busy !== ''}
            onClick={() => {
              const parsed = parsePositiveInt(manualPaperId);
              if (!parsed) {
                setError('请输入有效的 paper_id。');
                return;
              }
              router.push(buildReproductionUrl({ paperId: parsed }));
            }}
          >
            载入论文上下文
          </Button>
          <Button
            className="secondary"
            disabled={busy !== ''}
            onClick={() => {
              const parsed = parsePositiveInt(manualReproductionId);
              if (!parsed) {
                setError('请输入有效的 reproduction_id。');
                return;
              }
              router.push(buildReproductionUrl({ reproductionId: parsed }));
            }}
          >
            打开指定复现
          </Button>
        </div>
      </div>

      {loading ? <Loading text="加载复现工作区..." /> : null}

      {warnings.map((warning) => (
        <p key={warning} style={{ color: '#b45309', margin: 0 }}>{warning}</p>
      ))}
      {error ? <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}
      {notice ? <p style={{ color: '#0f766e', margin: 0 }}>{notice}</p> : null}

      {shouldShowContextCard ? (
        <Card>
          <h3 className="title" style={{ fontSize: 16 }}>当前复现上下文</h3>
          <p style={{ marginBottom: 6 }}>
            <strong>{contextModeLabel(contextMode)}</strong>
          </p>
          {contextMessage ? <p className="subtle" style={{ marginTop: 0 }}>{contextMessage}</p> : null}
          {activePaper ? (
            <p className="subtle" style={{ margin: 0 }}>
              论文：paper#{activePaper.id} · {activePaper.title_en}
            </p>
          ) : (
            <p className="subtle" style={{ margin: 0 }}>当前未加载到论文上下文。</p>
          )}
          {detail ? (
            <>
              <p className="subtle" style={{ margin: '6px 0 0 0' }}>
                复现：#{detail.reproduction_id} · 状态：{statusLabel(detail.status)} · 进度：{detail.progress_percent ?? 0}%
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
            <p className="subtle" style={{ margin: '6px 0 0 0' }}>Repo：当前计划未绑定 repo，按 paper-only 推进。</p>
          ) : null}
        </Card>
      ) : null}

      {activePaper ? (
        <Card>
          <h3 className="title" style={{ fontSize: 16 }}>Repo 候选与新建复现</h3>
          <p className="subtle">
            默认使用当前论文标题自动搜索 repo。你可以选择某个 repo 生成新计划，也可以不选 repo，直接按 paper-only 推进。
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
                  setNotice(selectedRepoId ? '已基于选中 Repo 创建新的复现记录。' : '已按 paper-only 创建新的复现记录。');
                  router.push(buildReproductionUrl({ paperId: activePaper.id, reproductionId: result.reproduction_id }));
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
            <p className="subtle">当前没有可用的 repo 候选，你仍可直接按 paper-only 生成计划。</p>
          )}
        </Card>
      ) : null}

      {detail ? (
        <>
          <Card>
            <h3 className="title" style={{ fontSize: 16 }}>复现概览 #{detail.reproduction_id}</h3>
            <p className="subtle">
              状态：{statusLabel(detail.status)} · 进度：{detail.progress_percent ?? 0}% · paper_id：{detail.paper_id ?? 'N/A'} · repo：{detail.repo ? `${detail.repo.owner}/${detail.repo.name}` : 'paper-only'}
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
              setNotice('步骤状态已更新。');
            }}
            onCreateLog={async (stepId, payload) => {
              if (!currentReproductionId) return;
              await createReproductionStepLog(currentReproductionId, stepId, payload);
              await refreshDetail();
              setNotice(payload.log_kind === 'blocker' ? '阻塞日志已保存，并已自动标记该步骤为 blocked。' : '步骤日志已保存，并已生成下一步建议。');
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
                  setNotice('复现心得已创建。');
                })
              }
            >
              {busy === 'reflection' ? '创建中...' : '创建复现心得'}
            </Button>
          </div>
        </>
      ) : null}

      {!loading && !activePaper && !detail && !error ? (
        <EmptyState title="等待复现上下文" hint="请从论文工作区进入，或在上方手工输入 paper_id / reproduction_id。" />
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
