"use client";

import { useState } from 'react';

import BrainstormForm from '@/components/brainstorm/BrainstormForm';
import IdeaList from '@/components/brainstorm/IdeaList';
import Card from '@/components/common/Card';
import StatusStack from '@/components/common/StatusStack';
import { generateBrainstormIdeas } from '@/lib/api';

export default function BrainstormPage() {
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function onGenerate(topic: string) {
    setError('');
    setNotice('');

    try {
      const payload = await generateBrainstormIdeas(topic, []);
      const lines = String(payload.content || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      setItems(lines);
      setNotice(lines.length > 0 ? '灵感结果已生成。' : '已生成结果，但当前没有可展示内容。');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Card>
        <h2 className="title">灵感构思</h2>
        <p className="subtle">生成想法、研究空白、综述提纲与 proposal 草稿。</p>
      </Card>
      <BrainstormForm onGenerate={onGenerate} />
      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...(notice ? [{ variant: 'success' as const, message: notice }] : []),
        ]}
      />
      <IdeaList items={items} />
    </>
  );
}
