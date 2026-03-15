"use client";

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import Card from '@/components/common/Card';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import PaperList from '@/components/papers/PaperList';
import PaperSearchForm from '@/components/papers/PaperSearchForm';
import PaperWorkspaceView from '@/components/papers/PaperWorkspace';
import { searchPapers } from '@/lib/api';
import { Paper } from '@/lib/types';

const LAST_SELECTED_PAPER_KEY = 'research-copilot:last-selected-paper-id';

function parsePaperId(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [requestedSummaryId, setRequestedSummaryId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [info, setInfo] = useState('');

  useEffect(() => {
    const fromQueryPaper = parsePaperId(searchParams.get('paper_id'));
    const fromQuerySummary = parsePaperId(searchParams.get('summary_id'));
    const fromStorage = parsePaperId(window.localStorage.getItem(LAST_SELECTED_PAPER_KEY));

    setSelectedPaperId((current) => fromQueryPaper ?? current ?? fromStorage);
    setRequestedSummaryId(fromQuerySummary);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedPaperId) return;

    window.localStorage.setItem(LAST_SELECTED_PAPER_KEY, String(selectedPaperId));

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('paper_id', String(selectedPaperId));
    if (requestedSummaryId) {
      nextParams.set('summary_id', String(requestedSummaryId));
    } else {
      nextParams.delete('summary_id');
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `/search?${nextQuery}` : '/search');
    }
  }, [requestedSummaryId, router, searchParams, selectedPaperId]);

  async function onSearch(query: string) {
    setError('');
    setWarnings([]);
    setInfo('');
    try {
      const result = await searchPapers(query);
      const items = (result.items ?? []) as Paper[];
      const nextWarnings = result.warnings ?? [];
      setPapers(items);
      setWarnings(nextWarnings);

      if (items.length > 0) {
        setRequestedSummaryId(null);
        setSelectedPaperId((current) => {
          if (current && items.some((item) => item.id === current)) {
            return current;
          }
          return items[0].id;
        });
      } else {
        setInfo(nextWarnings.length > 0 ? '当前没有可用搜索结果，你可以稍后重试或更换关键词。' : '未检索到结果，请尝试更换关键词。');
      }
    } catch (searchError) {
      setError((searchError as Error).message || '搜索失败，请稍后重试。');
    }
  }

  return (
    <>
      <Card>
        <h2 className="title">论文搜索与阅读工作区</h2>
        <p className="subtle">在同一页面完成搜索、下载、总结、心得与记忆沉淀。</p>
      </Card>
      <PaperSearchForm onSearch={onSearch} />
      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...warnings.map((message) => ({ variant: 'warning' as const, message })),
          ...(info ? [{ variant: 'info' as const, message: info }] : []),
        ]}
      />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <PaperList
          papers={papers}
          onSelect={(paper) => {
            setRequestedSummaryId(null);
            setSelectedPaperId(paper.id);
          }}
        />
        <PaperWorkspaceView paperId={selectedPaperId} requestedSummaryId={requestedSummaryId} />
      </div>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Loading text="加载论文工作区..." />}>
      <SearchPageContent />
    </Suspense>
  );
}
