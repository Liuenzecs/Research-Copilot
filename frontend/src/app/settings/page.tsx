"use client";

import { useEffect, useState } from 'react';

import Card from '@/components/common/Card';
import Loading from '@/components/common/Loading';
import { providerSettings } from '@/lib/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    providerSettings().then((res) => setSettings(res as Record<string, unknown>));
  }, []);

  return (
    <>
      <Card>
        <h2 className="title">设置</h2>
        <p className="subtle">模型供应商、存储路径、GitHub token 与限流状态。</p>
      </Card>
      <Card>
        {!settings ? <Loading /> : <pre style={{ margin: 0 }}>{JSON.stringify(settings, null, 2)}</pre>}
      </Card>
    </>
  );
}
