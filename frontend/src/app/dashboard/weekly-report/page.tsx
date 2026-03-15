"use client";

import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import ChoiceDialog from '@/components/common/ChoiceDialog';
import StatusStack from '@/components/common/StatusStack';
import ReportDraftEditor from '@/components/reporting/ReportDraftEditor';
import WeeklyReportPanel from '@/components/reporting/WeeklyReportPanel';
import { createWeeklyReportDraft, getWeeklyReportContext, listWeeklyReportDrafts, updateWeeklyReportDraft } from '@/lib/api';
import { formatDateTime, weekRangeLabel, weeklyReportStatusLabel } from '@/lib/presentation';
import { WeeklyReportContext, WeeklyReportDraft } from '@/lib/types';

type ContextSource = 'live' | 'snapshot';

function currentWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const format = (value: Date) => value.toISOString().slice(0, 10);
  return { weekStart: format(monday), weekEnd: format(sunday) };
}

function normalizeWeeklyReportContext(
  snapshot: Record<string, unknown>,
  fallback: { weekStart: string; weekEnd: string },
): WeeklyReportContext {
  return {
    week_start: typeof snapshot.week_start === 'string' ? snapshot.week_start : fallback.weekStart,
    week_end: typeof snapshot.week_end === 'string' ? snapshot.week_end : fallback.weekEnd,
    report_worthy_reflections: Array.isArray(snapshot.report_worthy_reflections)
      ? snapshot.report_worthy_reflections as WeeklyReportContext['report_worthy_reflections']
      : [],
    recent_papers: Array.isArray(snapshot.recent_papers)
      ? snapshot.recent_papers as WeeklyReportContext['recent_papers']
      : [],
    reproduction_progress: Array.isArray(snapshot.reproduction_progress)
      ? snapshot.reproduction_progress as WeeklyReportContext['reproduction_progress']
      : [],
    blockers: Array.isArray(snapshot.blockers)
      ? snapshot.blockers as WeeklyReportContext['blockers']
      : [],
    next_actions: Array.isArray(snapshot.next_actions) ? snapshot.next_actions as string[] : [],
  };
}

export default function WeeklyReportPage() {
  const currentWeek = useMemo(() => currentWeekRange(), []);
  const [weekStart, setWeekStart] = useState(currentWeek.weekStart);
  const [weekEnd, setWeekEnd] = useState(currentWeek.weekEnd);
  const [context, setContext] = useState<WeeklyReportContext | null>(null);
  const [contextSource, setContextSource] = useState<ContextSource>('live');
  const [draft, setDraft] = useState<WeeklyReportDraft | null>(null);
  const [history, setHistory] = useState<WeeklyReportDraft[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeVariant, setNoticeVariant] = useState<'success' | 'info'>('success');
  const [loading, setLoading] = useState(false);
  const [showDraftChoice, setShowDraftChoice] = useState(false);

  const currentRangeDrafts = useMemo(
    () => history.filter((item) => item.week_start === weekStart && item.week_end === weekEnd),
    [history, weekEnd, weekStart],
  );
  const latestCurrentRangeDraft = currentRangeDrafts[0] ?? null;

  async function reloadHistory() {
    try {
      const rows = await listWeeklyReportDrafts();
      setHistory(rows);
      return rows;
    } catch (reloadError) {
      setError((reloadError as Error).message || '历史草稿加载失败。');
      return [];
    }
  }

  function pushNotice(message: string, variant: 'success' | 'info' = 'success') {
    setNotice(message);
    setNoticeVariant(variant);
  }

  async function loadContext(nextWeekStart = weekStart, nextWeekEnd = weekEnd) {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const data = await getWeeklyReportContext(nextWeekStart, nextWeekEnd);
      setContext(data);
      setContextSource('live');
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await reloadHistory();
      await loadContext(currentWeek.weekStart, currentWeek.weekEnd);
    })();
  }, [currentWeek.weekEnd, currentWeek.weekStart]);

  async function createNewDraft() {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const row = await createWeeklyReportDraft({ week_start: weekStart, week_end: weekEnd });
      setDraft(row);
      await reloadHistory();
      const liveContext = await getWeeklyReportContext(weekStart, weekEnd);
      setContext(liveContext);
      setContextSource('live');
      pushNotice('周报草稿已生成，左侧继续显示当前周期的实时上下文。');
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setLoading(false);
      setShowDraftChoice(false);
    }
  }

  async function handleGenerateDraft() {
    if (currentRangeDrafts.length > 0) {
      setShowDraftChoice(true);
      return;
    }
    await createNewDraft();
  }

  async function saveDraft(payload: { draft_markdown?: string; status?: string; title?: string }) {
    if (!draft) return;
    setError('');
    setNotice('');
    try {
      const row = await updateWeeklyReportDraft(draft.id, payload);
      setDraft(row);
      await reloadHistory();
      pushNotice('周报草稿已保存。');
    } catch (saveError) {
      setError((saveError as Error).message);
    }
  }

  function openDraftSnapshot(item: WeeklyReportDraft, message = '已切换到该草稿保存时的历史快照。') {
    setDraft(item);
    setWeekStart(item.week_start);
    setWeekEnd(item.week_end);
    setContext(
      normalizeWeeklyReportContext(item.source_snapshot_json as Record<string, unknown>, {
        weekStart: item.week_start,
        weekEnd: item.week_end,
      }),
    );
    setContextSource('snapshot');
    pushNotice(message, 'info');
    setError('');
    setShowDraftChoice(false);
  }

  function continueLatestDraft() {
    if (!latestCurrentRangeDraft) return;
    openDraftSnapshot(latestCurrentRangeDraft, '你正在继续编辑该周最近一条草稿，左侧显示的是保存时的历史快照。');
  }

  return (
    <>
      <Card>
        <h2 className="title">周报工作区</h2>
        <p className="subtle">先确认本周上下文，再决定继续旧草稿还是新建一份草稿，避免误覆盖。</p>
      </Card>

      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <div className="grid-2">
          <input className="input" type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} />
          <input className="input" type="date" value={weekEnd} onChange={(event) => setWeekEnd(event.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button className="secondary" disabled={loading} onClick={() => loadContext()}>
            {loading && contextSource === 'live' ? '加载中...' : '加载上下文'}
          </Button>
          <Button disabled={loading} onClick={handleGenerateDraft}>
            {loading ? '处理中...' : '生成周报草稿'}
          </Button>
        </div>
        <p className="subtle" style={{ margin: 0 }}>
          当前周期：{weekRangeLabel(weekStart, weekEnd)}
          {currentRangeDrafts.length > 0 ? ` · 已有 ${currentRangeDrafts.length} 份草稿` : ' · 当前周期还没有草稿'}
        </p>
      </div>

      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...(notice ? [{ variant: noticeVariant, message: notice }] : []),
        ]}
      />

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <WeeklyReportPanel context={context} contextSource={contextSource} />
        <ReportDraftEditor draft={draft} onSave={saveDraft} />
      </div>

      <div className="card">
        <h3 className="title" style={{ fontSize: 16 }}>
          历史草稿
        </h3>
        {history.length === 0 ? (
          <p className="subtle">还没有历史周报草稿。</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {history.map((item) => {
              const isActive = draft?.id === item.id;
              const isCurrentWeekDraft = item.week_start === currentWeek.weekStart && item.week_end === currentWeek.weekEnd;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openDraftSnapshot(item)}
                  style={{
                    border: isActive ? '1px solid #0f766e' : '1px solid rgba(15, 23, 42, 0.08)',
                    borderRadius: 12,
                    background: isActive ? '#ecfdf5' : '#ffffff',
                    padding: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <strong>{item.title || '未命名周报草稿'}</strong>
                    <span className="subtle">{weeklyReportStatusLabel(item.status)}</span>
                    {isActive ? <span className="subtle">当前打开</span> : null}
                    {isCurrentWeekDraft ? <span className="subtle">本周</span> : null}
                  </div>
                  <div className="subtle">{weekRangeLabel(item.week_start, item.week_end)}</div>
                  <div className="subtle">最后更新：{formatDateTime(item.updated_at)}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ChoiceDialog
        open={showDraftChoice}
        title="当前周已经有草稿"
        description="你可以继续最近一条草稿，也可以保留它并新建一份新的草稿。"
        onClose={() => setShowDraftChoice(false)}
        options={[
          {
            label: '继续最近草稿',
            description: '直接打开该周最近一条草稿，并显示它保存时的历史快照。',
            onSelect: continueLatestDraft,
          },
          {
            label: '新建一份草稿',
            description: '基于当前实时上下文重新生成一份新的周报草稿。',
            variant: 'secondary',
            onSelect: createNewDraft,
          },
        ]}
      />
    </>
  );
}
