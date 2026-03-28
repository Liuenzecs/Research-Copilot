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

const LIBRARY_PAGE_SIZE = 20;

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

function clampLibraryPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

function LibraryPagination({
  currentPage,
  totalPages,
  totalItems,
  testId,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  testId: string;
  onPageChange: (page: number) => void;
}) {
  if (totalItems === 0) return null;

  const start = (currentPage - 1) * LIBRARY_PAGE_SIZE + 1;
  const end = Math.min(currentPage * LIBRARY_PAGE_SIZE, totalItems);

  return (
    <div className="library-toolbar-card" data-testid={testId} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <strong>文库分页</strong>
          <div className="subtle" data-testid={`${testId}-summary`}>
            当前第 {currentPage} / {totalPages} 页，显示第 {start}-{end} 篇，共 {totalItems} 篇。
          </div>
        </div>
        <span className="library-tag">每页 {LIBRARY_PAGE_SIZE} 篇</span>
      </div>
      {totalPages > 1 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" className="button secondary" data-testid={`${testId}-first`} onClick={() => onPageChange(1)} disabled={currentPage === 1}>
            第一页
          </button>
          <button
            type="button"
            className="button secondary"
            data-testid={`${testId}-prev`}
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            上一页
          </button>
          <button
            type="button"
            className="button secondary"
            data-testid={`${testId}-next`}
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            下一页
          </button>
          <button
            type="button"
            className="button secondary"
            data-testid={`${testId}-last`}
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
          >
            最后一页
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function LibraryRoute() {
  usePageTitle('文库');

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewMode, setViewMode] = useState<'downloaded' | 'all'>('downloaded');
  const [query, setQuery] = useState('');
  const [readingStatus, setReadingStatus] = useState('');
  const [reproInterest, setReproInterest] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    listLibrary()
      .then((res) => setItems(res.items))
      .catch((loadError) => {
        setError((loadError as Error).message || '文库加载失败，请稍后重试。');
      })
      .finally(() => setLoading(false));
  }, []);

  const downloadedCount = useMemo(() => items.filter((item) => item.is_downloaded).length, [items]);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();

    return items.filter((item) => {
      if (viewMode === 'downloaded' && !item.is_downloaded) return false;
      if (readingStatus && item.reading_status !== readingStatus) return false;
      if (reproInterest && item.repro_interest !== reproInterest) return false;
      if (!lowered) return true;

      const haystacks = [item.title_en, item.authors, item.source, item.year ? String(item.year) : '']
        .join(' ')
        .toLowerCase();
      return haystacks.includes(lowered);
    });
  }, [items, query, readingStatus, reproInterest, viewMode]);

  const totalPages = Math.max(Math.ceil(filtered.length / LIBRARY_PAGE_SIZE), 1);
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * LIBRARY_PAGE_SIZE;
    return filtered.slice(start, start + LIBRARY_PAGE_SIZE);
  }, [currentPage, filtered]);

  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode, query, readingStatus, reproInterest]);

  useEffect(() => {
    setCurrentPage((page) => clampLibraryPage(page, totalPages));
  }, [totalPages]);

  return (
    <>
      <Card className="page-header-card">
        <span className="page-kicker">已积累资产</span>
        <h2 className="page-shell-title">文库</h2>
        <p className="page-shell-copy">这里优先展示你已经下载到本地的论文，先把可直接进入阅读的材料收口出来，再决定是否扩展到全库回看。</p>
      </Card>

      <div className="library-toolbar-card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`chip-toggle ${viewMode === 'downloaded' ? 'active' : ''}`.trim()}
            data-testid="library-view-downloaded"
            onClick={() => setViewMode('downloaded')}
          >
            我的文献（已下载）({downloadedCount})
          </button>
          <button
            type="button"
            className={`chip-toggle ${viewMode === 'all' ? 'active' : ''}`.trim()}
            data-testid="library-view-all"
            onClick={() => setViewMode('all')}
          >
            全部论文 ({items.length})
          </button>
        </div>

        <div className="subtle" data-testid="library-view-summary">
          {viewMode === 'downloaded'
            ? '默认只看已下载论文，优先把可直接进入阅读的材料收口出来。'
            : '当前显示全部论文，可用于全库回看和状态筛选。'} 当前共 {filtered.length} 篇，第 {currentPage} / {totalPages} 页。
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

      {!loading && filtered.length > 0 ? (
        <LibraryPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filtered.length}
          testId="library-pagination-top"
          onPageChange={(page) => setCurrentPage(clampLibraryPage(page, totalPages))}
        />
      ) : null}

      <Card className="library-list-card">
        {loading ? <Loading text="正在加载文库入口..." /> : null}
        {!loading && filtered.length === 0 ? (
          <EmptyState
            title={viewMode === 'downloaded' ? '当前还没有已下载论文' : '没有匹配的论文'}
            hint={viewMode === 'downloaded' ? '先把论文下载到本地后，这里就会形成可直接继续阅读的文库入口。' : '请调整筛选条件后再试。'}
          />
        ) : null}

        {!loading && filtered.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {pagedItems.map((item) => {
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
                        摘要 {item.summary_count} · 心得 {item.reflection_count ?? 0} · 复现 {item.reproduction_count} · 记忆 {item.memory_count}
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

      {!loading && filtered.length > LIBRARY_PAGE_SIZE ? (
        <LibraryPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filtered.length}
          testId="library-pagination-bottom"
          onPageChange={(page) => setCurrentPage(clampLibraryPage(page, totalPages))}
        />
      ) : null}
    </>
  );
}
