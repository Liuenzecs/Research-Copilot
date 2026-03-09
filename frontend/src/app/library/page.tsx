"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import { listLibrary } from '@/lib/api';
import { LibraryItem } from '@/lib/types';

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [readingStatus, setReadingStatus] = useState('');
  const [reproInterest, setReproInterest] = useState('');
  const [coreOnly, setCoreOnly] = useState(false);
  const [hasSummary, setHasSummary] = useState(false);
  const [hasReflection, setHasReflection] = useState(false);

  useEffect(() => {
    listLibrary()
      .then((res) => setItems(res.items))
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
        <p className="subtle">按阅读状态和复现意向筛选，并直接进入论文工作区。</p>
      </Card>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="grid-2">
          <select className="select" value={readingStatus} onChange={(e) => setReadingStatus(e.target.value)}>
            <option value="">全部阅读状态</option>
            <option value="unread">unread</option>
            <option value="skimmed">skimmed</option>
            <option value="deep_read">deep_read</option>
            <option value="archived">archived</option>
          </select>
          <select className="select" value={reproInterest} onChange={(e) => setReproInterest(e.target.value)}>
            <option value="">全部复现兴趣</option>
            <option value="none">none</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="subtle"><input type="checkbox" checked={coreOnly} onChange={(e) => setCoreOnly(e.target.checked)} /> 仅核心论文</label>
          <label className="subtle"><input type="checkbox" checked={hasSummary} onChange={(e) => setHasSummary(e.target.checked)} /> 仅有摘要</label>
          <label className="subtle"><input type="checkbox" checked={hasReflection} onChange={(e) => setHasReflection(e.target.checked)} /> 仅有心得</label>
        </div>
      </div>

      <Card>
        {loading ? <Loading /> : null}
        {!loading && filtered.length === 0 ? <EmptyState title="无匹配论文" hint="调整筛选条件后重试。" /> : null}
        {!loading && filtered.length > 0 ? (
          <ul>
            {filtered.map((item) => (
              <li key={String(item.id)} style={{ marginBottom: 8 }}>
                <strong>{item.title_en}</strong>
                <span className="subtle">{' '}· {item.reading_status} · summary={item.summary_count} · reflection={item.reflection_count ?? 0}</span>
                <div>
                  <Link className="button secondary" href={`/search?paper_id=${item.id}`}>打开论文工作区</Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
