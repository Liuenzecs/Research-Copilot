"use client";

import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import ReportDraftEditor from '@/components/reporting/ReportDraftEditor';
import WeeklyReportPanel from '@/components/reporting/WeeklyReportPanel';
import { createWeeklyReportDraft, getWeeklyReportContext, listWeeklyReportDrafts, updateWeeklyReportDraft } from '@/lib/api';
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

function normalizeWeeklyReportContext(snapshot: Record<string, unknown>, fallback: { weekStart: string; weekEnd: string }): WeeklyReportContext {
  return {
    week_start: typeof snapshot.week_start === 'string' ? snapshot.week_start : fallback.weekStart,
    week_end: typeof snapshot.week_end === 'string' ? snapshot.week_end : fallback.weekEnd,
    report_worthy_reflections: Array.isArray(snapshot.report_worthy_reflections) ? snapshot.report_worthy_reflections as WeeklyReportContext['report_worthy_reflections'] : [],
    recent_papers: Array.isArray(snapshot.recent_papers) ? snapshot.recent_papers as WeeklyReportContext['recent_papers'] : [],
    reproduction_progress: Array.isArray(snapshot.reproduction_progress) ? snapshot.reproduction_progress as WeeklyReportContext['reproduction_progress'] : [],
    blockers: Array.isArray(snapshot.blockers) ? snapshot.blockers as WeeklyReportContext['blockers'] : [],
    next_actions: Array.isArray(snapshot.next_actions) ? snapshot.next_actions as string[] : [],
  };
}

export default function WeeklyReportPage() {
  const initial = useMemo(() => currentWeekRange(), []);
  const [weekStart, setWeekStart] = useState(initial.weekStart);
  const [weekEnd, setWeekEnd] = useState(initial.weekEnd);
  const [context, setContext] = useState<WeeklyReportContext | null>(null);
  const [contextSource, setContextSource] = useState<ContextSource>('live');
  const [draft, setDraft] = useState<WeeklyReportDraft | null>(null);
  const [history, setHistory] = useState<WeeklyReportDraft[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function reloadHistory() {
    const rows = await listWeeklyReportDrafts();
    setHistory(rows);
  }

  async function loadContext(nextWeekStart = weekStart, nextWeekEnd = weekEnd) {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const data = await getWeeklyReportContext(nextWeekStart, nextWeekEnd);
      setContext(data);
      setContextSource('live');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadHistory();
    void loadContext(initial.weekStart, initial.weekEnd);
  }, []);

  async function generateDraft() {
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
      setNotice('周报草稿已生成，左侧仍显示当前实时上下文。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function saveDraft(payload: { draft_markdown?: string; status?: string; title?: string }) {
    if (!draft) return;
    setError('');
    setNotice('');
    try {
      const row = await updateWeeklyReportDraft(draft.id, payload);
      setDraft(row);
      await reloadHistory();
      setNotice('周报草稿已保存。');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function openDraftSnapshot(item: WeeklyReportDraft) {
    setDraft(item);
    setWeekStart(item.week_start);
    setWeekEnd(item.week_end);
    setContext(normalizeWeeklyReportContext(item.source_snapshot_json as Record<string, unknown>, { weekStart: item.week_start, weekEnd: item.week_end }));
    setContextSource('snapshot');
    setNotice('已切换到该草稿生成时保存的历史快照。');
    setError('');
  }

  return (
    <>
      <Card>
        <h2 className="title">周报工作区</h2>
        <p className="subtle">汇总可汇报心得、论文活动、复现进展与阻塞，并生成导师更新草稿。</p>
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
          <Button disabled={loading} onClick={generateDraft}>
            {loading ? '生成中...' : '生成周报草稿'}
          </Button>
        </div>
      </div>

      {error ? <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}
      {notice ? <p style={{ color: '#0f766e', margin: 0 }}>{notice}</p> : null}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <WeeklyReportPanel context={context} contextSource={contextSource} />
        <ReportDraftEditor draft={draft} onSave={saveDraft} />
      </div>

      <div className="card">
        <h3 className="title" style={{ fontSize: 16 }}>历史草稿</h3>
        {history.length === 0 ? (
          <p className="subtle">还没有历史周报草稿。</p>
        ) : (
          <ul style={{ margin: 0 }}>
            {history.map((item) => (
              <li key={item.id} style={{ marginBottom: 8 }}>
                <button type="button" className="button secondary" onClick={() => openDraftSnapshot(item)}>
                  {item.week_start} ~ {item.week_end} · {item.status}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
