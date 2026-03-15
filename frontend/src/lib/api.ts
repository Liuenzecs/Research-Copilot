import { API_BASE } from './constants';
import {
  BrainstormIdeaResult,
  LibraryItem,
  MemoryItem,
  Paper,
  PaperWorkspace,
  Reflection,
  ReproductionDetail,
  ReproductionListItem,
  ReproductionLog,
  ReproductionPlanResult,
  RepoFindResponse,
  Summary,
  Task,
  WeeklyReportContext,
  WeeklyReportDraft,
} from './types';

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
    const message = await response.text();
    throw new Error(`API error ${response.status}: ${message}`);
  }
  if (response.status === 204) {
    return {} as T;
  }
  return response.json() as Promise<T>;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.set(k, String(v));
  });
  const value = sp.toString();
  return value ? `?${value}` : '';
}

export async function health() {
  return request('/health');
}

export async function searchPapers(query: string, limit = 10) {
  return request<{ items: Paper[]; warnings?: string[] }>('/papers/search', {
    method: 'POST',
    body: JSON.stringify({ query, sources: ['arxiv', 'semantic_scholar'], limit }),
  });
}

export async function downloadPaper(paperId: number) {
  return request<{ paper_id: number; pdf_local_path: string; downloaded: boolean }>('/papers/download', {
    method: 'POST',
    body: JSON.stringify({ paper_id: paperId }),
  });
}

export async function quickSummary(paperId: number) {
  return request<Summary>('/summaries/quick', {
    method: 'POST',
    body: JSON.stringify({ paper_id: paperId }),
  });
}

export async function deepSummary(paperId: number, focus = '') {
  return request<Summary>('/summaries/deep', {
    method: 'POST',
    body: JSON.stringify({ paper_id: paperId, focus: focus || null }),
  });
}

export async function getPaper(paperId: number) {
  return request<Paper>(`/papers/${paperId}`);
}

export async function getPaperWorkspace(paperId: number) {
  return request<PaperWorkspace>(`/papers/${paperId}/workspace`);
}

export async function updatePaperResearchState(
  paperId: number,
  payload: {
    reading_status?: string;
    interest_level?: number;
    repro_interest?: string;
    user_rating?: number;
    topic_cluster?: string;
    is_core_paper?: boolean;
  },
) {
  return request(`/papers/${paperId}/research-state`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function createPaperReflection(
  paperId: number,
  payload: {
    summary_id?: number;
    stage?: string;
    lifecycle_status?: string;
    content_structured_json?: Record<string, string>;
    content_markdown?: string;
    is_report_worthy?: boolean;
    report_summary?: string;
    event_date?: string;
  },
) {
  return request<Reflection>(`/papers/${paperId}/reflections`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function pushPaperToMemory(paperId: number) {
  return request<{ paper_id: number; memory_id: number }>(`/papers/${paperId}/memory`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getPaperPdfUrl(paperId: number, download = true) {
  return `${API_BASE}/papers/${paperId}/pdf${download ? '?download=true' : '?download=false'}`;
}

export async function listLibrary() {
  return request<{ items: LibraryItem[]; total: number }>('/library/list');
}

export async function listReflections(params?: {
  reflection_type?: string;
  lifecycle_status?: string;
  is_report_worthy?: boolean;
  date_from?: string;
  date_to?: string;
  related_paper_id?: number;
  related_summary_id?: number;
  related_repo_id?: number;
  related_reproduction_id?: number;
  related_task_id?: number;
}) {
  return request<Reflection[]>(`/reflections${qs(params ?? {})}`);
}

export async function createReflection(payload: Record<string, unknown>) {
  return request<Reflection>('/reflections', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getReflection(reflectionId: number) {
  return request<Reflection>(`/reflections/${reflectionId}`);
}

export async function reflectionTimeline(params?: { date_from?: string; date_to?: string }) {
  return request<Array<{ reflection: Reflection; task_type?: string; task_status?: string }>>(`/reflections/timeline${qs(params ?? {})}`);
}

export async function listTasks(params?: {
  include_archived?: boolean;
  status?: string;
  task_type?: string;
  artifact_ref_type?: string;
  artifact_ref_id?: number;
  date_from?: string;
  date_to?: string;
}) {
  return request<Task[]>(`/tasks${qs(params ?? {})}`);
}

export async function providerSettings() {
  return request('/settings/providers');
}

export async function findRepos(payload: { paper_id?: number; query?: string }) {
  return request<RepoFindResponse>('/repos/find', {
    method: 'POST',
    body: JSON.stringify({
      paper_id: payload.paper_id ?? null,
      query: payload.query ?? null,
    }),
  });
}

export async function listReproductions(params?: { paper_id?: number; repo_id?: number; limit?: number }) {
  return request<ReproductionListItem[]>(`/reproduction${qs(params ?? {})}`);
}

export async function planReproduction(payload: { paper_id?: number; repo_id?: number | null }) {
  return request<ReproductionPlanResult>('/reproduction/plan', {
    method: 'POST',
    body: JSON.stringify({
      paper_id: payload.paper_id ?? null,
      repo_id: payload.repo_id ?? null,
    }),
  });
}

export async function getReproductionDetail(reproductionId: number) {
  return request<ReproductionDetail>(`/reproduction/${reproductionId}`);
}

export async function updateReproduction(
  reproductionId: number,
  payload: { status?: string; progress_summary?: string; progress_percent?: number },
) {
  return request<ReproductionDetail>(`/reproduction/${reproductionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function updateReproductionStep(
  reproductionId: number,
  stepId: number,
  payload: { step_status?: string; progress_note?: string; blocker_reason?: string },
) {
  return request(`/reproduction/${reproductionId}/steps/${stepId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function createReproductionStepLog(
  reproductionId: number,
  stepId: number,
  payload: { log_text: string; log_kind: 'note' | 'blocker' },
) {
  return request<ReproductionLog>(`/reproduction/${reproductionId}/steps/${stepId}/logs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createReproductionReflection(reproductionId: number, payload: Record<string, unknown>) {
  return request(`/reproduction/${reproductionId}/reflections`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getWeeklyReportContext(weekStart: string, weekEnd: string) {
  return request<WeeklyReportContext>(`/reports/weekly/context${qs({ week_start: weekStart, week_end: weekEnd })}`);
}

export async function createWeeklyReportDraft(payload: { week_start: string; week_end: string; title?: string }) {
  return request<WeeklyReportDraft>('/reports/weekly/drafts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listWeeklyReportDrafts(status = '') {
  return request<WeeklyReportDraft[]>(`/reports/weekly/drafts${qs({ status })}`);
}

export async function getWeeklyReportDraft(id: number) {
  return request<WeeklyReportDraft>(`/reports/weekly/drafts/${id}`);
}

export async function updateWeeklyReportDraft(id: number, payload: { draft_markdown?: string; status?: string; title?: string }) {
  return request<WeeklyReportDraft>(`/reports/weekly/drafts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function queryMemory(params: { query: string; top_k?: number; memory_types?: string[]; layers?: string[] }) {
  return request<MemoryItem[]>('/memory/query', {
    method: 'POST',
    body: JSON.stringify({
      query: params.query,
      top_k: params.top_k ?? 10,
      memory_types: params.memory_types ?? [],
      layers: params.layers ?? [],
    }),
  });
}

export async function generateBrainstormIdeas(topic: string, paperIds: number[] = []) {
  return request<BrainstormIdeaResult>('/brainstorm/ideas', {
    method: 'POST',
    body: JSON.stringify({ topic, paper_ids: paperIds }),
  });
}
