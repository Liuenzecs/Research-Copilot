import { MemoryItem } from './types';
import { request } from './apiCore';

export async function queryMemory(params: { query: string; top_k?: number; memory_types?: string[]; layers?: string[]; project_id?: number }) {
  return request<MemoryItem[]>('/memory/query', {
    method: 'POST',
    body: JSON.stringify({
      query: params.query,
      top_k: params.top_k ?? 10,
      memory_types: params.memory_types ?? [],
      layers: params.layers ?? [],
      project_id: params.project_id ?? null,
    }),
  });
}

export async function listMemories(params?: { limit?: number; memory_types?: string[]; layers?: string[]; project_id?: number }) {
  const search = new URLSearchParams();
  if (params?.limit) {
    search.set('limit', String(params.limit));
  }
  if (params?.project_id) {
    search.set('project_id', String(params.project_id));
  }
  for (const memoryType of params?.memory_types ?? []) {
    search.append('memory_types', memoryType);
  }
  for (const layer of params?.layers ?? []) {
    search.append('layers', layer);
  }
  const query = search.toString();
  return request<MemoryItem[]>(`/memory${query ? `?${query}` : ''}`);
}
