"use client";

import { FormEvent, useState } from 'react';

import Button from '@/components/common/Button';

export default function PaperSearchForm({ onSearch }: { onSearch: (query: string) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      await onSearch(query.trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3 className="title" style={{ fontSize: 16 }}>搜索论文</h3>
      <p className="subtle">当前搜索源固定为 arXiv，搜索结果会直接跳到论文阅读页。</p>
      <input
        className="input"
        placeholder="输入关键词，例如 diffusion model reproducibility"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ marginTop: 10 }}
      />
      <div style={{ marginTop: 10 }}>
        <Button type="submit" disabled={loading}>{loading ? '搜索中...' : '开始搜索'}</Button>
      </div>
    </form>
  );
}
