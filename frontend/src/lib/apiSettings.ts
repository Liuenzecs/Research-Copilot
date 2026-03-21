import { ProviderSettings, ProviderSettingsUpdate } from './types';
import { request } from './apiCore';

export async function providerSettings(options?: { signal?: AbortSignal }) {
  return request<ProviderSettings>('/settings/providers', { signal: options?.signal });
}

export async function updateProviderSettings(payload: ProviderSettingsUpdate) {
  return request<ProviderSettings>('/settings/providers', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
