"use client";

import { useState } from 'react';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import StatusStack from '@/components/common/StatusStack';
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
  const [info, setInfo] = useState('');
  const [notice, setNotice] = useState('');

  async function searchMemory() {
    if (!query.trim()) {
      setError('');
      setNotice('');
      setInfo('请输入记忆检索问题。');
      return;
    }

    setError('');
    setInfo('');
    setNotice('');
    try {
      const payload = await queryMemory({
        query,
        top_k: 10,
        memory_types: memoryType ? [memoryType] : [],
        layers: layer ? [layer] : [],
      });
      setItems(payload);
      if (payload.length > 0) {
        setNotice(`已返回 ${payload.length} 条记忆结果。`);
      } else {
        setInfo('当前没有命中记忆结果，可以换个问题再试。');
      }
    } catch (searchError) {
      setError((searchError as Error).message);
    }
  }

  return (
    <>
      <Card>
        <h2 className="title">长期记忆</h2>
        <p className="subtle">按类型和层级检索历史研究内容，并精确回跳到论文、复现和心得上下文。</p>
      </Card>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入你要检索的研究问题"
        />
        <div className="grid-2">
          <select className="select" value={memoryType} onChange={(event) => setMemoryType(event.target.value)}>
            <option value="">全部记忆类型</option>
            <option value="PaperMemory">论文记忆</option>
            <option value="SummaryMemory">摘要记忆</option>
            <option value="ReflectionMemory">心得记忆</option>
            <option value="ReproMemory">复现记忆</option>
            <option value="IdeaMemory">灵感记忆</option>
            <option value="RepoMemory">代码仓记忆</option>
          </select>
          <select className="select" value={layer} onChange={(event) => setLayer(event.target.value)}>
            <option value="">全部层级</option>
            <option value="raw">原始层</option>
            <option value="structured">结构层</option>
            <option value="semantic">语义层</option>
            <option value="profile">画像层</option>
          </select>
        </div>
        <div style={{ marginTop: 10 }}>
          <Button onClick={searchMemory}>检索记忆</Button>
        </div>
      </div>
      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...(info ? [{ variant: 'info' as const, message: info }] : []),
          ...(notice ? [{ variant: 'success' as const, message: notice }] : []),
        ]}
      />
      <MemoryList items={items} />
      <MemoryGraph />
      <ProfilePanel />
    </>
  );
}
