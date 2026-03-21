import { ProviderSettings } from './types';
import { request } from './apiCore';

export async function providerSettings(options?: { signal?: AbortSignal }) {
  return request<ProviderSettings>('/settings/providers', { signal: options?.signal });
}
