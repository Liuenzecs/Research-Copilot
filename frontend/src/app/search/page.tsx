"use client";

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import Card from '@/components/common/Card';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import PaperList from '@/components/papers/PaperList';
import PaperSearchForm from '@/components/papers/PaperSearchForm';
import { searchPapers } from '@/lib/api';
import { paperReaderPath } from '@/lib/routes';
import { Paper } from '@/lib/types';

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
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [info, setInfo] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const paperId = parsePaperId(searchParams.get('paper_id'));
    const summaryId = parsePaperId(searchParams.get('summary_id'));

    if (!paperId) {
      setRedirecting(false);
      return;
    }

    setRedirecting(true);
    router.replace(paperReaderPath(paperId, summaryId));
  }, [router, searchParams]);

  async function onSearch(query: string) {
    setError('');
    setWarnings([]);
    setInfo('');

    try {
      const result = await searchPapers(query);
      const items = result.items ?? [];
      const nextWarnings = result.warnings ?? [];

      setPapers(items);
      setWarnings(nextWarnings);

      if (items.length === 0) {
        setInfo(nextWarnings.length > 0 ? '当前没有可用搜索结果，你可以稍后重试或更换关键词。' : '没有找到匹配论文，请尝试更换关键词。');
      }
    } catch (searchError) {
      setError((searchError as Error).message || '搜索失败，请稍后重试。');
    }
  }

  if (redirecting) {
    return <Loading text="正在跳转到论文阅读页..." />;
  }

  return (
    <>
      <Card>
        <h2 className="title">搜索论文</h2>
        <p className="subtle">这里是纯搜索页，当前搜索源固定为 arXiv。点击结果后会进入独立论文阅读页。</p>
      </Card>
      <PaperSearchForm onSearch={onSearch} />
      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...warnings.map((message) => ({ variant: 'warning' as const, message })),
          ...(info ? [{ variant: 'info' as const, message: info }] : []),
        ]}
      />
      <PaperList papers={papers} onSelect={(paper) => router.push(paperReaderPath(paper.id))} />
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Loading text="正在加载搜索页..." />}>
      <SearchPageContent />
    </Suspense>
  );
}
