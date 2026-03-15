"use client";

import { useState } from 'react';

import StatusStack from '@/components/common/StatusStack';
import { createReflection as createReflectionRequest } from '@/lib/api';

import ReflectionTemplateForm, { ReflectionFormPayload } from './ReflectionTemplateForm';

export default function ReflectionEditor({ onCreated }: { onCreated: () => Promise<void> }) {
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  async function createReflection(payload: ReflectionFormPayload) {
    setError('');
    setNotice('');
    try {
      await createReflectionRequest(payload);
      await onCreated();
      setNotice('心得已创建。');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <ReflectionTemplateForm onSubmit={createReflection} />
      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...(notice ? [{ variant: 'success' as const, message: notice }] : []),
        ]}
      />
    </div>
  );
}
