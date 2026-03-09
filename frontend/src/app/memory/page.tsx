"use client";

import { useState } from 'react';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import MemoryGraph from '@/components/memory/MemoryGraph';
import MemoryList from '@/components/memory/MemoryList';
import ProfilePanel from '@/components/memory/ProfilePanel';
import { queryMemory } from '@/lib/api';
import { MemoryItem } from '@/lib/types';

export default function MemoryPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [memoryType, setMemoryType] = useState('');
  const [layer, setLayer] = useState('');
  const [error, setError] = useState('');

  async function searchMemory() {
    if (!query.trim()) return;
    setError('');
    try {
      const payload = await queryMemory({
        query,
        top_k: 10,
        memory_types: memoryType ? [memoryType] : [],
        layers: layer ? [layer] : [],
      });
      setItems(payload);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Card>
        <h2 className="title">长期记忆</h2>
        <p className="subtle">支持按类型/层过滤，并可跳转回论文/复现/心得上下文。</p>
      </Card>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入记忆检索问题" />
        <div className="grid-2">
          <select className="select" value={memoryType} onChange={(e) => setMemoryType(e.target.value)}>
            <option value="">全部类型</option>
            <option value="PaperMemory">PaperMemory</option>
            <option value="SummaryMemory">SummaryMemory</option>
            <option value="ReflectionMemory">ReflectionMemory</option>
            <option value="ReproMemory">ReproMemory</option>
            <option value="IdeaMemory">IdeaMemory</option>
            <option value="RepoMemory">RepoMemory</option>
          </select>
          <select className="select" value={layer} onChange={(e) => setLayer(e.target.value)}>
            <option value="">全部层</option>
            <option value="raw">raw</option>
            <option value="structured">structured</option>
            <option value="semantic">semantic</option>
            <option value="profile">profile</option>
          </select>
        </div>
        <div style={{ marginTop: 10 }}>
          <Button onClick={searchMemory}>检索记忆</Button>
        </div>
      </div>
      <MemoryList items={items} />
      <MemoryGraph />
      <ProfilePanel />
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
    </>
  );
}
