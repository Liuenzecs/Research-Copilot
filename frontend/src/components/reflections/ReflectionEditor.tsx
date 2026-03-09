"use client";

import { useState } from 'react';

import { API_BASE } from '@/lib/constants';

import ReflectionTemplateForm, { ReflectionFormPayload } from './ReflectionTemplateForm';

export default function ReflectionEditor({ onCreated }: { onCreated: () => Promise<void> }) {
  const [error, setError] = useState<string>('');

  async function createReflection(payload: ReflectionFormPayload) {
    setError('');
    const response = await fetch(`${API_BASE}/reflections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setError(`创建失败: ${response.status}`);
      return;
    }
    await onCreated();
  }

  return (
    <div>
      <ReflectionTemplateForm onSubmit={createReflection} />
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
    </div>
  );
}
