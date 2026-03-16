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
      .catch((loadError) => setError((loadError as Error).message || '设置页加载失败，请稍后重试。'));
  }, []);

  return (
    <>
      <Card>
        <h2 className="title">设置</h2>
        <p className="subtle">查看当前大模型、翻译能力与本地运行环境状态。</p>
      </Card>

      <StatusStack items={error ? [{ variant: 'error' as const, message: error }] : []} />

      <Card>
        {!settings ? (
          <Loading text="正在加载设置..." />
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
              <strong>辅助翻译回退</strong>
              <div className="subtle">
                {settings.libretranslate_enabled ? `公共翻译接口已配置 · ${settings.libretranslate_api_url}` : '未配置公共翻译接口'}
              </div>
            </div>
            <div className="reader-meta-card">
              <strong>代码仓辅助能力</strong>
              <div className="subtle">GitHub Token：{settings.github_token_configured ? '已配置' : '未配置'}</div>
            </div>
            <div className="reader-meta-card">
              <strong>本地运行环境</strong>
              <div className="subtle">数据库 URL：{settings.runtime_db_url}</div>
              <div className="subtle">数据库路径：{settings.runtime_db_path || '当前使用内存数据库或非 SQLite'}</div>
              <div className="subtle">数据目录：{settings.runtime_data_dir}</div>
              <div className="subtle">向量目录：{settings.runtime_vector_dir}</div>
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
