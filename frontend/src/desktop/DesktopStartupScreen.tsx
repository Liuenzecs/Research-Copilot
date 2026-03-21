import { useState } from 'react';

import Button from '@/components/common/Button';
import StatusStack from '@/components/common/StatusStack';
import { openDataDir, openLogsDir, restartBackend, useRuntimeConfig } from '@/lib/runtime';

export default function DesktopStartupScreen() {
  const runtimeConfig = useRuntimeConfig();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function runAction(
    action: string,
    task: () => Promise<unknown>,
    successMessage: string,
  ) {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      await task();
      setNotice(successMessage);
    } catch (actionError) {
      setError((actionError as Error).message || '桌面启动操作失败。');
    } finally {
      setBusy('');
    }
  }

  const phaseLabel =
    runtimeConfig.backend_status === 'failed'
      ? '启动失败'
      : runtimeConfig.backend_status === 'ready'
        ? '已就绪'
        : runtimeConfig.backend_stage || '正在准备桌面环境';

  return (
    <div className="desktop-startup-shell">
      <div className="desktop-startup-panel">
        <div className="desktop-startup-badge">Research Copilot</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <h1 className="desktop-startup-title">桌面研究工作台正在启动</h1>
          <p className="desktop-startup-text">
            现在会先打开启动壳，再在后台拉起本地 FastAPI sidecar。这样即使后端还没完全 ready，你也能看到当前阶段和错误信息。
          </p>
        </div>

        <div className="desktop-startup-card">
          <strong>当前阶段</strong>
          <div className="subtle">{phaseLabel}</div>
          <div className="subtle">后端状态：{runtimeConfig.backend_status}</div>
          <div className="subtle">API 地址：{runtimeConfig.api_base || '尚未分配'}</div>
          <div className="subtle">数据目录：{runtimeConfig.app_data_dir || '正在准备中'}</div>
          <div className="subtle">日志目录：{runtimeConfig.logs_dir || '正在准备中'}</div>
        </div>

        <StatusStack
          items={[
            ...(runtimeConfig.backend_error
              ? [{ variant: 'error' as const, message: runtimeConfig.backend_error }]
              : []),
            ...(error ? [{ variant: 'error' as const, message: error }] : []),
            ...(notice ? [{ variant: 'success' as const, message: notice }] : []),
          ]}
        />

        <div className="desktop-startup-actions">
          <Button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void runAction(
                'restart-backend',
                () => restartBackend({ waitForReady: false }),
                '桌面后端已重新开始启动。',
              )
            }
          >
            {busy === 'restart-backend' ? '重试中...' : '重试启动后端'}
          </Button>
          <Button
            className="secondary"
            type="button"
            disabled={!runtimeConfig.app_data_dir || busy !== ''}
            onClick={() => void runAction('open-data-dir', openDataDir, '已打开数据目录。')}
          >
            {busy === 'open-data-dir' ? '打开中...' : '打开数据目录'}
          </Button>
          <Button
            className="secondary"
            type="button"
            disabled={!runtimeConfig.logs_dir || busy !== ''}
            onClick={() => void runAction('open-logs-dir', openLogsDir, '已打开日志目录。')}
          >
            {busy === 'open-logs-dir' ? '打开中...' : '打开日志目录'}
          </Button>
        </div>

        <div className="desktop-startup-meta">
          <span>版本 {runtimeConfig.app_version || '0.1.0'}</span>
          <span>构建时间 {runtimeConfig.build_timestamp || '未注入'}</span>
          <span>Commit {runtimeConfig.git_commit || '未注入'}</span>
          <span>模式 {runtimeConfig.build_mode || 'desktop'}</span>
        </div>
      </div>
    </div>
  );
}
