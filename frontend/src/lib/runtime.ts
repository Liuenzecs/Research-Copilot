import { invoke } from '@tauri-apps/api/core';

export type RuntimeConfig = {
  api_base: string;
  app_data_dir: string;
  logs_dir: string;
  platform: string;
  is_desktop: boolean;
};

const defaultRuntimeConfig: RuntimeConfig = {
  api_base: import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000',
  app_data_dir: '',
  logs_dir: '',
  platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
  is_desktop: false,
};

let runtimeConfig: RuntimeConfig = defaultRuntimeConfig;

function mergeRuntimeConfig(partial?: Partial<RuntimeConfig> | null) {
  runtimeConfig = {
    ...runtimeConfig,
    ...(partial ?? {}),
  };
  return runtimeConfig;
}

export function getRuntimeConfig() {
  return runtimeConfig;
}

export function getApiBase() {
  return runtimeConfig.api_base;
}

export async function initializeRuntimeConfig() {
  try {
    const config = await invoke<RuntimeConfig>('get_runtime_config');
    return mergeRuntimeConfig(config);
  } catch {
    return mergeRuntimeConfig(defaultRuntimeConfig);
  }
}

export async function openDataDir() {
  if (!runtimeConfig.is_desktop) return;
  await invoke('open_data_dir');
}

export async function openLogsDir() {
  if (!runtimeConfig.is_desktop) return;
  await invoke('open_logs_dir');
}

export async function restartBackend() {
  if (!runtimeConfig.is_desktop) return;
  await invoke('restart_backend');
}
