import { API_BASE } from './constants';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function health() {
  return request('/health');
}

export async function searchPapers(query: string) {
  return request<{ items: unknown[] }>('/papers/search', {
    method: 'POST',
    body: JSON.stringify({ query, sources: ['arxiv', 'semantic_scholar'], limit: 10 }),
  });
}

export async function listLibrary() {
  return request<{ items: unknown[]; total: number }>('/library/list');
}

export async function listReflections() {
  return request<unknown[]>('/reflections');
}

export async function reflectionTimeline() {
  return request<unknown[]>('/reflections/timeline');
}

export async function listTasks() {
  return request<unknown[]>('/tasks');
}

export async function providerSettings() {
  return request('/settings/providers');
}
