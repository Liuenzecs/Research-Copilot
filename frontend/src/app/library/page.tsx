"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import { listLibrary } from '@/lib/api';
import { paperReaderPath } from '@/lib/routes';
import { readingStatusLabel, READING_STATUS_OPTIONS, reproInterestLabel, REPRO_INTEREST_OPTIONS } from '@/lib/researchState';
import { LibraryItem } from '@/lib/types';

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [readingStatus, setReadingStatus] = useState('');
  const [reproInterest, setReproInterest] = useState('');
  const [coreOnly, setCoreOnly] = useState(false);
  const [hasSummary, setHasSummary] = useState(false);
  const [hasReflection, setHasReflection] = useState(false);

  useEffect(() => {
    listLibrary()
      .then((res) => setItems(res.items))
      .catch((loadError) => {
        setError((loadError as Error).message || '文献库加载失败，请稍后重试。');
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (readingStatus && item.reading_status !== readingStatus) return false;
      if (reproInterest && item.repro_interest !== reproInterest) return false;
      if (coreOnly && !item.is_core_paper) return false;
      if (hasSummary && (item.summary_count ?? 0) <= 0) return false;
      if (hasReflection && (item.reflection_count ?? 0) <= 0) return false;
      return true;
    });
  }, [items, readingStatus, reproInterest, coreOnly, hasSummary, hasReflection]);

  return (
    <>
      <Card>
        <h2 className="title">文献库</h2>
        <p className="subtle">按阅读状态和复现意向筛选，并直接进入独立论文阅读页。</p>
      </Card>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="grid-2">
          <select className="select" value={readingStatus} onChange={(event) => setReadingStatus(event.target.value)}>
            <option value="">全部阅读状态</option>
            {READING_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select className="select" value={reproInterest} onChange={(event) => setReproInterest(event.target.value)}>
            <option value="">全部复现兴趣</option>
            {REPRO_INTEREST_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="subtle">
            <input type="checkbox" checked={coreOnly} onChange={(event) => setCoreOnly(event.target.checked)} /> 仅核心论文
          </label>
          <label className="subtle">
            <input type="checkbox" checked={hasSummary} onChange={(event) => setHasSummary(event.target.checked)} /> 仅有摘要
          </label>
          <label className="subtle">
            <input type="checkbox" checked={hasReflection} onChange={(event) => setHasReflection(event.target.checked)} /> 仅有心得
          </label>
        </div>
      </div>

      <StatusStack items={error ? [{ variant: 'error' as const, message: error }] : []} />

      <Card>
        {loading ? <Loading /> : null}
        {!loading && filtered.length === 0 ? <EmptyState title="无匹配论文" hint="调整筛选条件后重试。" /> : null}
        {!loading && filtered.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {filtered.map((item) => (
              <li key={String(item.id)} className="library-item">
                <div style={{ display: 'grid', gap: 6 }}>
                  <strong style={{ fontSize: 16, lineHeight: 1.5 }}>{item.title_en}</strong>
                  <div className="subtle">
                    {item.source} · {item.year ?? 'N/A'} · 阅读状态 {readingStatusLabel(item.reading_status)} · 复现兴趣 {reproInterestLabel(item.repro_interest)}
                  </div>
                  <div className="subtle">
                    摘要 {item.summary_count} 条 · 心得 {item.reflection_count ?? 0} 条
                    {item.is_core_paper ? ' · 核心论文' : ''}
                    {item.pdf_local_path ? ' · 已下载 PDF' : ' · 尚未下载 PDF'}
                  </div>
                </div>
                <div className="library-item-actions">
                  <Link className="button secondary" href={paperReaderPath(item.id)}>
                    进入论文阅读页
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
