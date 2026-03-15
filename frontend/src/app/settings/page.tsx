"use client";

import { useEffect, useState } from 'react';

import Card from '@/components/common/Card';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import { providerSettings } from '@/lib/api';
import { ProviderSettings } from '@/lib/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    providerSettings()
      .then((res) => setSettings(res))
      .catch((loadError) => setError((loadError as Error).message || '设置加载失败，请稍后重试。'));
  }, []);

  return (
    <>
      <Card>
        <h2 className="title">设置</h2>
        <p className="subtle">查看当前模型、搜索和公共翻译接口的配置状态。</p>
      </Card>

      <StatusStack items={error ? [{ variant: 'error' as const, message: error }] : []} />

      <Card>
        {!settings ? (
          <Loading />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="reader-meta-card">
              <strong>OpenAI</strong>
              <div className="subtle">{settings.openai_enabled ? `已启用 · ${settings.openai_model}` : '未启用'}</div>
            </div>
            <div className="reader-meta-card">
              <strong>DeepSeek</strong>
              <div className="subtle">{settings.deepseek_enabled ? `已启用 · ${settings.deepseek_model}` : '未启用'}</div>
            </div>
            <div className="reader-meta-card">
              <strong>LibreTranslate 兼容接口</strong>
              <div className="subtle">
                {settings.libretranslate_enabled ? `已配置 · ${settings.libretranslate_api_url}` : '未配置，将直接回退到本地辅助翻译'}
              </div>
            </div>
            <div className="reader-meta-card">
              <strong>其他配置</strong>
              <div className="subtle">
                Semantic Scholar API：{settings.semantic_scholar_api_key_configured ? '已配置' : '未配置'} · GitHub Token：
                {settings.github_token_configured ? '已配置' : '未配置'}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <strong>当前说明</strong>
              {settings.notes.map((note) => (
                <div key={note} className="reader-meta-card">
                  <div className="subtle">{note}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
