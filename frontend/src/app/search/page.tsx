"use client";

import { useState } from 'react';

import PaperDetail from '@/components/papers/PaperDetail';
import PaperList from '@/components/papers/PaperList';
import PaperSearchForm from '@/components/papers/PaperSearchForm';
import SummaryPanel from '@/components/papers/SummaryPanel';
import { searchPapers } from '@/lib/api';
import { Paper, Summary } from '@/lib/types';

export default function SearchPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selected, setSelected] = useState<Paper | null>(null);
  const [summary] = useState<Summary | null>(null);

  async function onSearch(query: string) {
    const result = await searchPapers(query);
    const items = (result.items ?? []) as Paper[];
    setPapers(items);
    setSelected(items[0] ?? null);
  }

  return (
    <>
      <PaperSearchForm onSearch={onSearch} />
      <div className="grid-2">
        <PaperList papers={papers} onSelect={setSelected} />
        <PaperDetail paper={selected} />
      </div>
      <SummaryPanel summary={summary} />
    </>
  );
}
