"use client";

import { useState } from 'react';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import MemoryGraph from '@/components/memory/MemoryGraph';
import MemoryList from '@/components/memory/MemoryList';
import ProfilePanel from '@/components/memory/ProfilePanel';
import { API_BASE } from '@/lib/constants';

export default function MemoryPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Array<{ id: number; memory_type: string; text_content: string }>>([]);

  async function searchMemory() {
    if (!query.trim()) return;
    const response = await fetch(`${API_BASE}/memory/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: 10, memory_types: [], layers: [] }),
    });
    if (!response.ok) return;
    const payload = await response.json();
    setItems(payload ?? []);
  }

  return (
    <>
      <Card>
        <h2 className="title">长期记忆</h2>
        <p className="subtle">支持检索、链接、归档、置顶与研究画像更新。</p>
      </Card>
      <div className="card">
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入记忆检索问题" />
        <div style={{ marginTop: 10 }}>
          <Button onClick={searchMemory}>检索记忆</Button>
        </div>
      </div>
      <MemoryList items={items} />
      <MemoryGraph />
      <ProfilePanel />
    </>
  );
}
