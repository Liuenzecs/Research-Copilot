import {
  AiReflectionMode,
  Paper,
  PaperAssistantReply,
  PaperCitationTrail,
  PaperReader,
  PaperSearchResponse,
  PaperSearchSortMode,
  PaperWorkspace,
  Reflection,
  Summary,
} from './types';
import { request, requestStream } from './apiCore';
import { getApiBase } from './runtime';

export async function health(options?: { signal?: AbortSignal }) {
  return request('/health', { signal: options?.signal });
}

export async function searchPapers(
  payloadOrQuery:
    | string
    | {
        query: string;
        sources?: string[];
        limit?: number;
        year_from?: number | null;
        year_to?: number | null;
        venue_query?: string;
        require_pdf?: boolean | null;
        project_id?: number | null;
        project_membership?: string;
        has_summary?: boolean | null;
        has_reflection?: boolean | null;
        has_reproduction?: boolean | null;
        reading_status?: string;
        repro_interest?: string;
        sort_mode?: PaperSearchSortMode | string;
      },
  limit = 10,
  options?: { signal?: AbortSignal },
) {
  const payload =
    typeof payloadOrQuery === 'string'
      ? { query: payloadOrQuery, sources: ['arxiv'], limit }
      : {
          query: payloadOrQuery.query,
          sources: payloadOrQuery.sources ?? ['arxiv'],
          limit: payloadOrQuery.limit ?? limit,
          year_from: payloadOrQuery.year_from ?? null,
          year_to: payloadOrQuery.year_to ?? null,
          venue_query: payloadOrQuery.venue_query ?? '',
          require_pdf: payloadOrQuery.require_pdf ?? null,
          project_id: payloadOrQuery.project_id ?? null,
          project_membership: payloadOrQuery.project_membership ?? 'all',
          has_summary: payloadOrQuery.has_summary ?? null,
          has_reflection: payloadOrQuery.has_reflection ?? null,
          has_reproduction: payloadOrQuery.has_reproduction ?? null,
          reading_status: payloadOrQuery.reading_status ?? '',
          repro_interest: payloadOrQuery.repro_interest ?? '',
          sort_mode: payloadOrQuery.sort_mode ?? 'relevance',
        };
  return request<PaperSearchResponse>('/papers/search', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: options?.signal,
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

export async function quickSummaryStream(
  paperId: number,
  options?: {
    onDelta?: (delta: string) => void;
  },
) {
  return requestStream<Summary>(
    '/summaries/quick/stream',
    {
      method: 'POST',
      body: JSON.stringify({ paper_id: paperId }),
    },
    {
      onDelta: options?.onDelta,
      pickComplete: (event) => (event.type === 'complete' ? (event.summary as Summary) : undefined),
    },
  );
}

export async function deepSummary(paperId: number, focus = '') {
  return request<Summary>('/summaries/deep', {
    method: 'POST',
    body: JSON.stringify({ paper_id: paperId, focus: focus || null }),
  });
}

export async function deepSummaryStream(
  paperId: number,
  focus = '',
  options?: {
    onDelta?: (delta: string) => void;
  },
) {
  return requestStream<Summary>(
    '/summaries/deep/stream',
    {
      method: 'POST',
      body: JSON.stringify({ paper_id: paperId, focus: focus || null }),
    },
    {
      onDelta: options?.onDelta,
      pickComplete: (event) => (event.type === 'complete' ? (event.summary as Summary) : undefined),
    },
  );
}

export async function getPaper(paperId: number, options?: { signal?: AbortSignal }) {
  return request<Paper>(`/papers/${paperId}`, { signal: options?.signal });
}

export async function getPaperCitationTrail(paperId: number, options?: { signal?: AbortSignal }) {
  return request<PaperCitationTrail>(`/papers/${paperId}/citation-trail`, { signal: options?.signal });
}

export async function getPaperWorkspace(paperId: number, options?: { signal?: AbortSignal }) {
  return request<PaperWorkspace>(`/papers/${paperId}/workspace`, { signal: options?.signal });
}

export async function getPaperReader(paperId: number, options?: { signal?: AbortSignal }) {
  return request<PaperReader>(`/papers/${paperId}/reader`, { signal: options?.signal });
}

export async function createPaperAnnotation(
  paperId: number,
  payload: {
    paragraph_id: number;
    selected_text?: string;
    note_text: string;
  },
) {
  return request(`/papers/${paperId}/annotations`, {
    method: 'POST',
    body: JSON.stringify({
      paragraph_id: payload.paragraph_id,
      selected_text: payload.selected_text ?? '',
      note_text: payload.note_text,
    }),
  });
}

export async function askPaperAssistantForSelection(
  paperId: number,
  payload: {
    action: string;
    selected_text?: string;
    paragraph_id?: number | null;
    project_id?: number | null;
    evidence_ids?: number[];
  },
) {
  return request<PaperAssistantReply>(`/papers/${paperId}/assistant/selection`, {
    method: 'POST',
    body: JSON.stringify({
      action: payload.action,
      selected_text: payload.selected_text ?? '',
      paragraph_id: payload.paragraph_id ?? null,
      project_id: payload.project_id ?? null,
      evidence_ids: payload.evidence_ids ?? [],
    }),
  });
}

export async function askPaperAssistantForSection(
  paperId: number,
  payload: {
    action: string;
    paragraph_id?: number | null;
    project_id?: number | null;
    evidence_ids?: number[];
  },
) {
  return request<PaperAssistantReply>(`/papers/${paperId}/assistant/section`, {
    method: 'POST',
    body: JSON.stringify({
      action: payload.action,
      paragraph_id: payload.paragraph_id ?? null,
      project_id: payload.project_id ?? null,
      evidence_ids: payload.evidence_ids ?? [],
    }),
  });
}

export async function updatePaperResearchState(
  paperId: number,
  payload: {
    reading_status?: string;
    interest_level?: number;
    repro_interest?: string;
    user_rating?: number;
    read_at?: string | null;
    clear_read_at?: boolean;
    topic_cluster?: string;
    is_core_paper?: boolean;
  },
) {
  return request(`/papers/${paperId}/research-state`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function markPaperOpened(paperId: number) {
  return request<{ paper_id: number; last_opened_at?: string | null }>(`/papers/${paperId}/opened`, {
    method: 'POST',
    body: JSON.stringify({}),
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

export async function createAiPaperReflection(
  paperId: number,
  payload: {
    mode: AiReflectionMode;
    project_id?: number | null;
    summary_id?: number | null;
    event_date?: string | null;
  },
) {
  return request<Reflection>(`/papers/${paperId}/reflections/ai-create`, {
    method: 'POST',
    body: JSON.stringify({
      mode: payload.mode,
      project_id: payload.project_id ?? null,
      summary_id: payload.summary_id ?? null,
      event_date: payload.event_date ?? null,
    }),
  });
}

export async function pushPaperToMemory(paperId: number) {
  return request<{ paper_id: number; memory_id: number }>(`/papers/${paperId}/memory`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getPaperPdfUrl(paperId: number, download = true) {
  return `${getApiBase()}/papers/${paperId}/pdf${download ? '?download=true' : '?download=false'}`;
}
