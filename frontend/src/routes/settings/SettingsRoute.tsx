"use client";

import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import { providerSettings } from '@/lib/api';
import { openDataDir, openLogsDir, restartBackend, useRuntimeConfig } from '@/lib/runtime';
import { ProviderSettings } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';

type NoticeVariant = 'success' | 'info' | 'warning' | 'error';

export default function SettingsRoute() {
  usePageTitle('设置');

  const runtimeConfig = useRuntimeConfig();
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeVariant, setNoticeVariant] = useState<NoticeVariant>('success');
  const [busy, setBusy] = useState('');

  async function loadSettings() {
    setError('');
    try {
      setSettings(await providerSettings());
    } catch (loadError) {
      setError((loadError as Error).message || '设置页加载失败，请稍后重试。');
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function runDesktopAction(
    action: string,
    task: () => Promise<unknown>,
    successMessage: string,
    options?: { reloadSettings?: boolean },
  ) {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      await task();
      setNotice(successMessage);
      setNoticeVariant('success');
      if (options?.reloadSettings) {
        await loadSettings();
      }
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <Card>
        <h2 className="title">设置</h2>
        <p className="subtle">查看模型提供方、本地运行路径和桌面版运行状态。桌面版默认把数据写入用户目录，不再回写仓库内的开发数据库。</p>
      </Card>

      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...(notice ? [{ variant: noticeVariant, message: notice }] : []),
        ]}
      />

      <Card>
        {!settings ? (
          <Loading text="正在加载设置..." />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="reader-meta-card">
              <strong>桌面运行时</strong>
              <div className="subtle">运行形态：{runtimeConfig.is_desktop ? 'Tauri 桌面应用' : '浏览器开发态'}</div>
              <div className="subtle">平台：{runtimeConfig.platform || 'unknown'}</div>
              <div className="subtle">API 地址：{runtimeConfig.api_base}</div>
              <div className="subtle">后端状态：{runtimeConfig.backend_status}</div>
              <div className="subtle">当前阶段：{runtimeConfig.backend_stage || '未提供'}</div>
              {runtimeConfig.backend_error ? <div className="subtle">最近错误：{runtimeConfig.backend_error}</div> : null}
              <div className="subtle">桌面数据目录：{runtimeConfig.app_data_dir || '当前不是桌面正式运行态'}</div>
              <div className="subtle">日志目录：{runtimeConfig.logs_dir || '当前不是桌面正式运行态'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <Button
                  className="secondary"
                  type="button"
                  disabled={!runtimeConfig.is_desktop || busy !== ''}
                  onClick={() => void runDesktopAction('open-data-dir', openDataDir, '已打开桌面数据目录。')}
                >
                  {busy === 'open-data-dir' ? '打开中...' : '打开数据目录'}
                </Button>
                <Button
                  className="secondary"
                  type="button"
                  disabled={!runtimeConfig.is_desktop || busy !== ''}
                  onClick={() => void runDesktopAction('open-logs-dir', openLogsDir, '已打开日志目录。')}
                >
                  {busy === 'open-logs-dir' ? '打开中...' : '打开日志目录'}
                </Button>
                <Button
                  type="button"
                  disabled={!runtimeConfig.is_desktop || busy !== ''}
                  onClick={() =>
                    void runDesktopAction(
                      'restart-backend',
                      () => restartBackend({ waitForReady: true, timeoutMs: 30_000 }),
                      '桌面后端已重启并恢复就绪。',
                      { reloadSettings: true },
                    )
                  }
                >
                  {busy === 'restart-backend' ? '重启中...' : '重启后端'}
                </Button>
              </div>
            </div>

            <div className="reader-meta-card" data-testid="desktop-build-card">
              <strong>构建信息</strong>
              <div className="subtle">应用版本：{runtimeConfig.app_version || '0.1.0'}</div>
              <div className="subtle">构建时间：{runtimeConfig.build_timestamp || '未注入'}</div>
              <div className="subtle">Git Commit：{runtimeConfig.git_commit || '未注入'}</div>
              <div className="subtle">构建模式：{runtimeConfig.build_mode || 'desktop'}</div>
              <div className="subtle">当前可执行文件：{runtimeConfig.executable_path || '当前不是桌面正式运行态'}</div>
            </div>

            <div className="reader-meta-card">
              <strong>模型提供方</strong>
              <div className="subtle">OpenAI：{settings.openai_enabled ? `已启用 · ${settings.openai_model}` : '未启用'}</div>
              <div className="subtle">DeepSeek：{settings.deepseek_enabled ? `已启用 · ${settings.deepseek_model}` : '未启用'}</div>
              <div className="subtle">
                翻译回退：{settings.libretranslate_enabled ? `已配置 · ${settings.libretranslate_api_url}` : '未配置公共翻译接口'}
              </div>
              <div className="subtle">GitHub Token：{settings.github_token_configured ? '已配置' : '未配置'}</div>
            </div>

            <div className="reader-meta-card" data-testid="runtime-settings-card">
              <strong>后端运行路径</strong>
              <div className="subtle">数据库 URL：{settings.runtime_db_url}</div>
              <div className="subtle">数据库路径：{settings.runtime_db_path || '当前使用内存数据库或非 SQLite'}</div>
              <div className="subtle">后端数据目录：{settings.runtime_data_dir}</div>
              <div className="subtle">向量目录：{settings.runtime_vector_dir}</div>
            </div>

            <div className="reader-meta-card" data-testid="test-db-note">
              <strong>数据与测试说明</strong>
              <div className="subtle">桌面版正式数据写入用户目录，与仓库开发数据隔离。</div>
              <div className="subtle">本期不导入仓库里的旧 `backend/data`，也不自动迁移历史项目。</div>
              <div className="subtle">pytest 和 Playwright E2E 默认使用临时数据库，不会污染你当前开发中的数据。</div>
              <div className="subtle">如果发现 exe 时间不对、行为像旧包、或 MSI 遇到文件锁，优先执行 `npm run desktop:build:fresh`。</div>
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
