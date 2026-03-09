"use client";

import { useEffect, useState } from 'react';

import Card from '@/components/common/Card';
import PaperList from '@/components/papers/PaperList';
import PaperSearchForm from '@/components/papers/PaperSearchForm';
import PaperWorkspaceView from '@/components/papers/PaperWorkspace';
import { searchPapers } from '@/lib/api';
import { Paper } from '@/lib/types';

export default function SearchPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const paperIdParam = sp.get('paper_id');
    if (paperIdParam && Number.isFinite(Number(paperIdParam))) {
      setSelectedPaperId(Number(paperIdParam));
    }
  }, []);

  async function onSearch(query: string) {
    const result = await searchPapers(query);
    const items = (result.items ?? []) as Paper[];
    setPapers(items);
    setSelectedPaperId(items[0]?.id ?? null);
  }

  return (
    <>
      <Card>
        <h2 className="title">论文搜索与阅读工作区</h2>
        <p className="subtle">在同一页面完成搜索、下载、总结、心得与记忆沉淀。</p>
      </Card>
      <PaperSearchForm onSearch={onSearch} />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <PaperList papers={papers} onSelect={(paper) => setSelectedPaperId(paper.id)} />
        <PaperWorkspaceView paperId={selectedPaperId} />
      </div>
    </>
  );
}
