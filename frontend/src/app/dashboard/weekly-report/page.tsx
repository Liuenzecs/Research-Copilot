"use client";

import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import ReportDraftEditor from '@/components/reporting/ReportDraftEditor';
import WeeklyReportPanel from '@/components/reporting/WeeklyReportPanel';
import { createWeeklyReportDraft, getWeeklyReportContext, listWeeklyReportDrafts, updateWeeklyReportDraft } from '@/lib/api';
import { WeeklyReportContext, WeeklyReportDraft } from '@/lib/types';

function currentWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const format = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: format(monday), weekEnd: format(sunday) };
}

export default function WeeklyReportPage() {
  const initial = useMemo(() => currentWeekRange(), []);
  const [weekStart, setWeekStart] = useState(initial.weekStart);
  const [weekEnd, setWeekEnd] = useState(initial.weekEnd);
  const [context, setContext] = useState<WeeklyReportContext | null>(null);
  const [draft, setDraft] = useState<WeeklyReportDraft | null>(null);
  const [history, setHistory] = useState<WeeklyReportDraft[]>([]);
  const [error, setError] = useState('');

  async function reloadHistory() {
    const rows = await listWeeklyReportDrafts();
    setHistory(rows);
  }

  useEffect(() => {
    reloadHistory();
  }, []);

  async function loadContext() {
    setError('');
    try {
      const data = await getWeeklyReportContext(weekStart, weekEnd);
      setContext(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function generateDraft() {
    setError('');
    try {
      const row = await createWeeklyReportDraft({ week_start: weekStart, week_end: weekEnd });
      setDraft(row);
      await reloadHistory();
      const ctx = await getWeeklyReportContext(weekStart, weekEnd);
      setContext(ctx);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveDraft(payload: { draft_markdown?: string; status?: string; title?: string }) {
    if (!draft) return;
    const row = await updateWeeklyReportDraft(draft.id, payload);
    setDraft(row);
    await reloadHistory();
  }

  return (
    <>
      <Card>
        <h2 className="title">周报工作区</h2>
        <p className="subtle">汇总可汇报心得、复现进展与阻塞，并生成导师更新草稿。</p>
      </Card>

      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <div className="grid-2">
          <input className="input" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          <input className="input" type="date" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button className="secondary" onClick={loadContext}>加载上下文</Button>
          <Button onClick={generateDraft}>生成周报草稿</Button>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <WeeklyReportPanel context={context} />
        <ReportDraftEditor draft={draft} onSave={saveDraft} />
      </div>

      <div className="card">
        <h3 className="title" style={{ fontSize: 16 }}>历史草稿</h3>
        <ul>
          {history.map((item) => (
            <li key={item.id}>
              <button type="button" className="button secondary" onClick={() => setDraft(item)}>
                {item.week_start} ~ {item.week_end} · {item.status}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
    </>
  );
}
