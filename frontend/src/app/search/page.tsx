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
  const [searchMessage, setSearchMessage] = useState('');

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const paperIdParam = sp.get('paper_id');
    if (paperIdParam && Number.isFinite(Number(paperIdParam))) {
      setSelectedPaperId(Number(paperIdParam));
    }
  }, []);

  async function onSearch(query: string) {
    setSearchMessage('');
    try {
      const result = await searchPapers(query);
      const items = (result.items ?? []) as Paper[];
      const warnings = result.warnings ?? [];
      setPapers(items);
      setSelectedPaperId(items[0]?.id ?? null);

      if (items.length === 0 && warnings.length > 0) {
        setSearchMessage(`当前搜索源暂时不可用：${warnings.join(' | ')}`);
      } else if (items.length === 0) {
        setSearchMessage('未检索到结果，请尝试更换关键词。');
      } else if (warnings.length > 0) {
        setSearchMessage(`已返回部分结果，但有数据源异常：${warnings.join(' | ')}`);
      }
    } catch (error) {
      setSearchMessage((error as Error).message || '搜索失败，请稍后重试。');
    }
  }

  return (
    <>
      <Card>
        <h2 className="title">论文搜索与阅读工作区</h2>
        <p className="subtle">在同一页面完成搜索、下载、总结、心得与记忆沉淀。</p>
      </Card>
      <PaperSearchForm onSearch={onSearch} />
      {searchMessage ? (
        <Card>
          <p style={{ color: '#b45309', margin: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{searchMessage}</p>
        </Card>
      ) : null}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <PaperList papers={papers} onSelect={(paper) => setSelectedPaperId(paper.id)} />
        <PaperWorkspaceView paperId={selectedPaperId} />
      </div>
    </>
  );
}
