"use client";

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import { listLibrary } from '@/lib/api';
import { formatDateTime } from '@/lib/presentation';
import { paperReaderPath } from '@/lib/routes';
import { readingStatusLabel, READING_STATUS_OPTIONS, reproInterestLabel, REPRO_INTEREST_OPTIONS } from '@/lib/researchState';
import { usePageTitle } from '@/lib/usePageTitle';
import { LibraryItem } from '@/lib/types';

function buildItemTags(item: LibraryItem): string[] {
  const tags: string[] = [];
  if (item.is_downloaded) tags.push('已下载');
  if (item.in_memory) tags.push('已入记忆');
  if (item.summary_count > 0) tags.push('有摘要');
  if ((item.reflection_count ?? 0) > 0) tags.push('有心得');
  if (item.reproduction_count > 0) tags.push('有复现');
  if (item.is_core_paper) tags.push('核心论文');
  return tags;
}

export default function LibraryRoute() {
  usePageTitle('文库');

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewMyOnly, setViewMyOnly] = useState(true);
  const [query, setQuery] = useState('');
  const [readingStatus, setReadingStatus] = useState('');
  const [reproInterest, setReproInterest] = useState('');

  useEffect(() => {
    listLibrary()
      .then((res) => setItems(res.items))
      .catch((loadError) => {
        setError((loadError as Error).message || '阅读入口加载失败，请稍后重试。');
      })
      .finally(() => setLoading(false));
  }, []);

  const myItemsCount = useMemo(() => items.filter((item) => item.is_my_library).length, [items]);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();

    return items.filter((item) => {
      if (viewMyOnly && !item.is_my_library) return false;
      if (readingStatus && item.reading_status !== readingStatus) return false;
      if (reproInterest && item.repro_interest !== reproInterest) return false;
      if (!lowered) return true;

      const haystacks = [item.title_en, item.authors, item.source, item.year ? String(item.year) : '']
        .join(' ')
        .toLowerCase();
      return haystacks.includes(lowered);
    });
  }, [items, query, readingStatus, reproInterest, viewMyOnly]);

  return (
    <>
      <Card className="page-header-card">
        <span className="page-kicker">已积累资产</span>
        <h2 className="page-shell-title">文库</h2>
        <p className="page-shell-copy">这里优先展示你已经沉淀下来的论文资产。需要找新论文时，再走搜索入口。</p>
      </Card>

      <div className="library-toolbar-card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`chip-toggle ${viewMyOnly ? 'active' : ''}`.trim()}
            onClick={() => setViewMyOnly(true)}
          >
            我的文献 ({myItemsCount})
          </button>
          <button
            type="button"
            className={`chip-toggle ${!viewMyOnly ? 'active' : ''}`.trim()}
            onClick={() => setViewMyOnly(false)}
          >
            全部论文 ({items.length})
          </button>
        </div>

        <input
          className="input"
          placeholder="按标题、作者、来源或年份搜索，例如 transformer、diffusion、ICLR 2024"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

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
      </div>

      <StatusStack items={error ? [{ variant: 'error' as const, message: error }] : []} />

      <Card className="library-list-card">
        {loading ? <Loading text="正在加载阅读入口..." /> : null}
        {!loading && filtered.length === 0 ? (
          <EmptyState
            title={viewMyOnly ? '当前还没有可继续阅读的文献' : '没有匹配的论文'}
            hint={viewMyOnly ? '先搜索一篇论文并下载、总结、记录心得或推入记忆后，这里就会逐渐形成你的阅读入口。' : '请调整筛选条件后再试。'}
          />
        ) : null}

        {!loading && filtered.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {filtered.map((item) => {
              const tags = buildItemTags(item);
              return (
                <li key={String(item.id)} className="library-item">
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <strong style={{ fontSize: 16, lineHeight: 1.5 }}>{item.title_en}</strong>
                      <div className="subtle">{item.authors || '作者信息暂缺'}</div>
                      <div className="subtle">
                        {item.source} · {item.year ?? '年份未知'} · 阅读状态 {readingStatusLabel(item.reading_status)} · 复现兴趣{' '}
                        {reproInterestLabel(item.repro_interest)}
                      </div>
                      <div className="subtle">
                        最近动作：{item.last_activity_label}
                        {item.last_activity_at ? ` · ${formatDateTime(item.last_activity_at)}` : ''}
                      </div>
                      {item.read_at ? <div className="subtle">计入阅读日期：{item.read_at}</div> : null}
                      <div className="subtle">
                        摘要 {item.summary_count} · 心得 {item.reflection_count ?? 0} · 复现 {item.reproduction_count} · 记忆{' '}
                        {item.memory_count}
                      </div>
                    </div>

                    {tags.length > 0 ? (
                      <div className="library-tag-row">
                        {tags.map((tag) => (
                          <span key={tag} className="library-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="library-item-actions">
                    <Link className="button secondary" to={paperReaderPath(item.id)}>
                      继续阅读
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
