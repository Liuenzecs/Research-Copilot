"use client";

import { FormEvent, useState } from 'react';

import Button from '@/components/common/Button';

export default function BrainstormForm({ onGenerate }: { onGenerate: (topic: string) => Promise<void> }) {
  const [topic, setTopic] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!topic.trim()) return;
    await onGenerate(topic.trim());
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3 className="title" style={{ fontSize: 16 }}>灵感输入</h3>
      <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="输入研究主题" />
      <div style={{ marginTop: 10 }}>
        <Button type="submit">生成灵感</Button>
      </div>
    </form>
  );
}
