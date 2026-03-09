"use client";

import { useState } from 'react';

import BrainstormForm from '@/components/brainstorm/BrainstormForm';
import IdeaList from '@/components/brainstorm/IdeaList';
import Card from '@/components/common/Card';
import { API_BASE } from '@/lib/constants';

export default function BrainstormPage() {
  const [items, setItems] = useState<string[]>([]);

  async function onGenerate(topic: string) {
    const response = await fetch(`${API_BASE}/brainstorm/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, paper_ids: [] }),
    });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const lines = String(payload.content || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    setItems(lines);
  }

  return (
    <>
      <Card>
        <h2 className="title">灵感构思</h2>
        <p className="subtle">生成想法、研究空白、综述提纲与proposal草稿。</p>
      </Card>
      <BrainstormForm onGenerate={onGenerate} />
      <IdeaList items={items} />
    </>
  );
}
