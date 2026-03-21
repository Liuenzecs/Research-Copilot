import { invoke } from '@tauri-apps/api/core';
import { useSyncExternalStore } from 'react';

export type DesktopBackendStatus = 'idle' | 'starting' | 'ready' | 'failed';

export type RuntimeConfig = {
  api_base: string;
  app_data_dir: string;
  logs_dir: string;
  platform: string;
  is_desktop: boolean;
  backend_status: DesktopBackendStatus;
  backend_stage: string;
  backend_error: string;
  app_version: string;
  build_timestamp: string;
  git_commit: string;
  build_mode: string;
  executable_path: string;
};

const browserFallbackMode = Boolean(import.meta.env.VITE_API_BASE);

const defaultRuntimeConfig: RuntimeConfig = {
  api_base: import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000',
  app_data_dir: '',
  logs_dir: '',
  platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
  is_desktop: !browserFallbackMode,
  backend_status: browserFallbackMode ? 'ready' : 'starting',
  backend_stage: browserFallbackMode ? '浏览器开发态' : '等待桌面宿主响应',
  backend_error: '',
  app_version: '0.1.0',
  build_timestamp: '',
  git_commit: '',
  build_mode: browserFallbackMode ? 'browser-dev' : 'desktop',
  executable_path: '',
};

let runtimeConfig: RuntimeConfig = defaultRuntimeConfig;
let pollTimer: number | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function shouldKeepPolling(config: RuntimeConfig) {
  return config.is_desktop && (config.backend_status === 'idle' || config.backend_status === 'starting');
}

function mergeRuntimeConfig(partial?: Partial<RuntimeConfig> | null) {
  runtimeConfig = {
    ...runtimeConfig,
    ...(partial ?? {}),
  };
  emitChange();
  return runtimeConfig;
}

export function subscribeRuntimeConfig(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRuntimeConfig() {
  return useSyncExternalStore(subscribeRuntimeConfig, getRuntimeConfig, getRuntimeConfig);
}

export function getRuntimeConfig() {
  return runtimeConfig;
}

export function getApiBase() {
  return runtimeConfig.api_base;
}

export async function refreshRuntimeConfig() {
  try {
    const config = await invoke<RuntimeConfig>('get_runtime_config');
    return mergeRuntimeConfig(config);
  } catch {
    return mergeRuntimeConfig(defaultRuntimeConfig);
  }
}

function stopRuntimePolling() {
  if (pollTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(pollTimer);
  }
  pollTimer = null;
}

function scheduleRuntimePolling(delayMs = 500) {
  if (typeof window === 'undefined' || pollTimer !== null) {
    return;
  }

  pollTimer = window.setTimeout(async () => {
    pollTimer = null;
    const config = await refreshRuntimeConfig();
    if (shouldKeepPolling(config)) {
      scheduleRuntimePolling();
    }
  }, delayMs);
}

export async function initializeRuntimeConfig() {
  const config = await refreshRuntimeConfig();
  if (shouldKeepPolling(config)) {
    scheduleRuntimePolling(0);
  } else {
    stopRuntimePolling();
  }
  return config;
}

export async function waitForRuntimeReady(timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const config = await refreshRuntimeConfig();
    if (!config.is_desktop || config.backend_status === 'ready') {
      stopRuntimePolling();
      return config;
    }
    if (config.backend_status === 'failed') {
      throw new Error(config.backend_error || '桌面后端启动失败。');
    }
    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }

  throw new Error('等待桌面后端启动超时。');
}

export async function openDataDir() {
  if (!runtimeConfig.is_desktop) return;
  await invoke('open_data_dir');
}

export async function openLogsDir() {
  if (!runtimeConfig.is_desktop) return;
  await invoke('open_logs_dir');
}

export async function restartBackend(options?: { waitForReady?: boolean; timeoutMs?: number }) {
  if (!runtimeConfig.is_desktop) {
    return runtimeConfig;
  }

  await invoke('restart_backend');
  const config = await refreshRuntimeConfig();

  if (shouldKeepPolling(config)) {
    scheduleRuntimePolling(0);
  }

  if (options?.waitForReady) {
    return waitForRuntimeReady(options.timeoutMs);
  }

  return config;
}
