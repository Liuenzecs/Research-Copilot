"use client";

import { useEffect, useState } from 'react';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import ReflectionEditor from '@/components/reflections/ReflectionEditor';
import ReflectionTimeline from '@/components/reflections/ReflectionTimeline';
import { listReflections } from '@/lib/api';
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

export default function ReflectionsPage() {
  const [items, setItems] = useState<Reflection[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');

  async function reload() {
    const rows = await listReflections({
      lifecycle_status: status || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    });
    setItems(rows as Reflection[]);
  }

  useEffect(() => {
    reload();
  }, [dateFrom, dateTo, status]);

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
          <option value="draft">draft</option>
          <option value="finalized">finalized</option>
          <option value="archived">archived</option>
        </select>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button className="secondary" onClick={() => { setDateFrom(daysAgo(7)); setDateTo(new Date().toISOString().slice(0, 10)); }}>最近7天</Button>
          <Button className="secondary" onClick={() => { setDateFrom(daysAgo(30)); setDateTo(new Date().toISOString().slice(0, 10)); }}>最近30天</Button>
          <Button className="secondary" onClick={() => { setDateFrom(startOfWeek()); setDateTo(new Date().toISOString().slice(0, 10)); }}>本周</Button>
          <Button className="secondary" onClick={() => { setDateFrom(''); setDateTo(''); setStatus(''); }}>清空筛选</Button>
        </div>
      </div>

      <ReflectionEditor onCreated={reload} />
      <ReflectionTimeline reflections={items} />
    </>
  );
}
