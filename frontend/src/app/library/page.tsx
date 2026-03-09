"use client";

import { useEffect, useState } from 'react';

import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import { listLibrary } from '@/lib/api';

export default function LibraryPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listLibrary()
      .then((res) => setItems(res.items as Array<Record<string, unknown>>))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Card>
        <h2 className="title">文献库</h2>
        <p className="subtle">可按阅读状态、主题簇、核心论文标记管理。</p>
      </Card>
      <Card>
        {loading ? <Loading /> : null}
        {!loading && items.length === 0 ? <EmptyState title="文献库为空" hint="先在论文搜索页保存论文。" /> : null}
        {!loading && items.length > 0 ? (
          <ul>
            {items.map((item) => (
              <li key={String(item.id)}>
                {String(item.title_en)} - {String(item.reading_status)} - 总结数 {String(item.summary_count)}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
