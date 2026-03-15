"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import ReflectionEditor from '@/components/reflections/ReflectionEditor';
import ReflectionTimeline from '@/components/reflections/ReflectionTimeline';
import { getReflection, listReflections } from '@/lib/api';
import { Reflection } from '@/lib/types';

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  return monday.toISOString().slice(0, 10);
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function ReflectionsPageContent() {
  const searchParams = useSearchParams();
  const requestedReflectionId = parsePositiveInt(searchParams.get('reflection_id'));

  const [items, setItems] = useState<Reflection[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [highlightedReflectionId, setHighlightedReflectionId] = useState<number | null>(null);

  async function reload() {
    setLoading(true);
    setError('');
    setWarnings([]);
    setNotice('');

    try {
      const rows = await listReflections({
        lifecycle_status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
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

      setItems(nextItems);
    } catch (reloadError) {
      setError((reloadError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [dateFrom, dateTo, requestedReflectionId, status]);

  return (
    <>
      <Card>
        <h2 className="title">研究心得</h2>
        <p className="subtle">结构化模板 + 时间线，支持上下文链接与汇报摘要提炼。</p>
      </Card>

      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <div className="grid-2">
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="finalized">已定稿</option>
          <option value="archived">已归档</option>
        </select>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button className="secondary" onClick={() => { setDateFrom(daysAgo(7)); setDateTo(new Date().toISOString().slice(0, 10)); }}>最近7天</Button>
          <Button className="secondary" onClick={() => { setDateFrom(daysAgo(30)); setDateTo(new Date().toISOString().slice(0, 10)); }}>最近30天</Button>
          <Button className="secondary" onClick={() => { setDateFrom(startOfWeek()); setDateTo(new Date().toISOString().slice(0, 10)); }}>本周</Button>
          <Button className="secondary" onClick={() => { setDateFrom(''); setDateTo(''); setStatus(''); }}>清空筛选</Button>
        </div>
      </div>

      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...warnings.map((message) => ({ variant: 'warning' as const, message })),
          ...(notice ? [{ variant: 'info' as const, message: notice }] : []),
        ]}
      />

      <ReflectionEditor onCreated={reload} />
      {loading ? <Loading text="加载心得时间线..." /> : null}
      <ReflectionTimeline reflections={items} highlightedReflectionId={highlightedReflectionId} />
    </>
  );
}

export default function ReflectionsPage() {
  return (
    <Suspense fallback={<Loading text="加载心得页面..." />}>
      <ReflectionsPageContent />
    </Suspense>
  );
}
