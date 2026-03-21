"use client";

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import ProjectContextBanner from '@/components/projects/ProjectContextBanner';
import ReflectionEditor from '@/components/reflections/ReflectionEditor';
import ReflectionTimeline from '@/components/reflections/ReflectionTimeline';
import { getReflection, listReflections } from '@/lib/api';
import { reflectionLifecycleLabel } from '@/lib/presentation';
import { projectPath } from '@/lib/routes';
import { usePageTitle } from '@/lib/usePageTitle';
import { Reflection } from '@/lib/types';

type PresetKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'last_30_days' | 'all' | 'custom';

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(now, mondayOffset + offsetWeeks * 7);
  const sunday = addDays(monday, 6);
  return { start: formatDate(monday), end: formatDate(sunday) };
}

function getPresetRange(preset: PresetKey) {
  const today = new Date();
  switch (preset) {
    case 'today':
      return { dateFrom: formatDate(today), dateTo: formatDate(today) };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { dateFrom: formatDate(yesterday), dateTo: formatDate(yesterday) };
    }
    case 'this_week': {
      const range = getWeekRange(0);
      return { dateFrom: range.start, dateTo: range.end };
    }
    case 'last_week': {
      const range = getWeekRange(-1);
      return { dateFrom: range.start, dateTo: range.end };
    }
    case 'last_30_days':
      return { dateFrom: formatDate(addDays(today, -29)), dateTo: formatDate(today) };
    case 'all':
      return { dateFrom: '', dateTo: '' };
    default:
      return { dateFrom: '', dateTo: '' };
  }
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export default function ReflectionsRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedReflectionId = parsePositiveInt(searchParams.get('reflection_id'));
  const requestedPaperId = parsePositiveInt(searchParams.get('paper_id'));
  const projectId = parsePositiveInt(searchParams.get('project_id'));
  const initialWeek = useMemo(() => getPresetRange('this_week'), []);

  const [items, setItems] = useState<Reflection[]>([]);
  const [dateFrom, setDateFrom] = useState(initialWeek.dateFrom);
  const [dateTo, setDateTo] = useState(initialWeek.dateTo);
  const [preset, setPreset] = useState<PresetKey>('this_week');
  const [reflectionType, setReflectionType] = useState('');
  const [status, setStatus] = useState('');
  const [reportWorthyFilter, setReportWorthyFilter] = useState<'all' | 'only'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [highlightedReflectionId, setHighlightedReflectionId] = useState<number | null>(null);
  const [showComposer, setShowComposer] = useState(() => !requestedReflectionId);

  usePageTitle(projectId ? '项目心得' : '研究心得');

  const summary = useMemo(
    () => ({
      total: items.length,
      reportWorthy: items.filter((item) => item.is_report_worthy).length,
      paper: items.filter((item) => item.reflection_type === 'paper').length,
      reproduction: items.filter((item) => item.reflection_type === 'reproduction').length,
    }),
    [items],
  );

  function applyPreset(nextPreset: PresetKey) {
    const range = getPresetRange(nextPreset);
    setPreset(nextPreset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  }

  async function reload() {
    setLoading(true);
    setError('');
    setWarnings([]);
    setNotice('');

    try {
      const rows = await listReflections({
        reflection_type: reflectionType || undefined,
        lifecycle_status: status || undefined,
        is_report_worthy: reportWorthyFilter === 'only' ? true : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        project_id: projectId || undefined,
        related_paper_id: requestedPaperId || undefined,
      });

      let nextItems = rows as Reflection[];
      setHighlightedReflectionId(null);

      if (requestedReflectionId) {
        try {
          const targetReflection = await getReflection(requestedReflectionId);
          if (!nextItems.some((item) => item.id === targetReflection.id)) {
            nextItems = [targetReflection, ...nextItems];
          }
          setHighlightedReflectionId(targetReflection.id);
          setNotice('已定位到指定心得。');
        } catch {
          setWarnings(['指定心得不存在或当前无法加载，已回退到普通时间线视图。']);
        }
      }

      if (!requestedReflectionId && requestedPaperId) {
        setNotice('已切换到当前论文的心得视图。');
      }

      setItems(nextItems);
    } catch (reloadError) {
      setError((reloadError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [dateFrom, dateTo, reflectionType, reportWorthyFilter, requestedPaperId, requestedReflectionId, status]);

  useEffect(() => {
    setShowComposer(!requestedReflectionId);
  }, [requestedReflectionId]);

  return (
    <>
      <Card>
        <h2 className="title">研究心得</h2>
        <p className="subtle">按周节奏查看论文心得和复现心得，保留时间线回顾与深链定位能力。</p>
        {projectId ? (
          <ProjectContextBanner
            projectId={projectId}
            message={requestedPaperId ? `当前为项目上下文心得视图，并已聚焦到论文 #${requestedPaperId}。` : '当前为项目上下文心得视图。'}
            actions={
              requestedPaperId ? (
                <Button className="secondary" type="button" onClick={() => navigate(`/reflections?project_id=${projectId}`)}>
                  查看项目全部心得
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {requestedPaperId && !projectId ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <span className="subtle">当前仅显示论文 #{requestedPaperId} 的心得</span>
            <Button className="secondary" type="button" onClick={() => navigate('/reflections')}>
              查看全部心得
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button className={preset === 'today' ? '' : 'secondary'} onClick={() => applyPreset('today')}>今天</Button>
          <Button className={preset === 'yesterday' ? '' : 'secondary'} onClick={() => applyPreset('yesterday')}>昨天</Button>
          <Button className={preset === 'this_week' ? '' : 'secondary'} onClick={() => applyPreset('this_week')}>本周</Button>
          <Button className={preset === 'last_week' ? '' : 'secondary'} onClick={() => applyPreset('last_week')}>上周</Button>
          <Button className={preset === 'last_30_days' ? '' : 'secondary'} onClick={() => applyPreset('last_30_days')}>最近30天</Button>
          <Button className={preset === 'all' ? '' : 'secondary'} onClick={() => applyPreset('all')}>全部</Button>
        </div>

        <div className="grid-2">
          <input
            className="input"
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setPreset('custom');
              setDateFrom(event.target.value);
            }}
          />
          <input
            className="input"
            type="date"
            value={dateTo}
            onChange={(event) => {
              setPreset('custom');
              setDateTo(event.target.value);
            }}
          />
        </div>

        <div className="grid-2">
          <select className="select" value={reflectionType} onChange={(event) => setReflectionType(event.target.value)}>
            <option value="">全部心得类型</option>
            <option value="paper">论文心得</option>
            <option value="reproduction">复现心得</option>
          </select>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部生命周期</option>
            <option value="draft">{reflectionLifecycleLabel('draft')}</option>
            <option value="finalized">{reflectionLifecycleLabel('finalized')}</option>
            <option value="archived">{reflectionLifecycleLabel('archived')}</option>
          </select>
        </div>

        <select className="select" value={reportWorthyFilter} onChange={(event) => setReportWorthyFilter(event.target.value as 'all' | 'only')}>
          <option value="all">全部汇报状态</option>
          <option value="only">仅可汇报</option>
        </select>

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            padding: 12,
            borderRadius: 10,
            background: '#f8fafc',
            border: '1px solid rgba(15, 23, 42, 0.08)',
          }}
        >
          <span className="subtle">当前结果：{summary.total}</span>
          <span className="subtle">可汇报：{summary.reportWorthy}</span>
          <span className="subtle">论文心得：{summary.paper}</span>
          <span className="subtle">复现心得：{summary.reproduction}</span>
        </div>
      </div>

      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...warnings.map((message) => ({ variant: 'warning' as const, message })),
          ...(notice ? [{ variant: 'info' as const, message: notice }] : []),
        ]}
      />

      {loading ? <Loading text="加载心得时间线..." /> : null}
      <ReflectionTimeline reflections={items} highlightedReflectionId={highlightedReflectionId} projectId={projectId} />

      <Card>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h3 className="title" style={{ fontSize: 16, margin: 0 }}>
              新建研究心得
            </h3>
            <p className="subtle" style={{ margin: '6px 0 0' }}>
              {requestedReflectionId
                ? '当前是从记忆或深链定位到已有心得，默认先展示该心得内容。'
                : '在这里补充新的论文心得或复现心得。'}
            </p>
          </div>
          <Button className="secondary" type="button" onClick={() => setShowComposer((previous) => !previous)}>
            {showComposer ? '收起新建表单' : '展开新建表单'}
          </Button>
        </div>
      </Card>

      {showComposer ? <ReflectionEditor onCreated={reload} /> : null}
    </>
  );
}
