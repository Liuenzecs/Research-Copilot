import type {
  PaperSearchFilters,
  PaperSearchSortMode,
  ProjectActionLaunchResponse,
  ProjectDuplicateGroup,
  ProjectSavedSearch,
  ProjectSavedSearchDetail,
  ProjectSearchRun,
  ProjectSearchRunDetail,
  ResearchProject,
  ResearchProjectEvidenceItem,
  ResearchProjectListItem,
  ResearchProjectOutput,
  ResearchProjectPaper,
  ResearchProjectTaskDetail,
  ResearchProjectTaskEvent,
  ResearchProjectWorkspace,
  SearchCandidate,
} from './types';
import { request, streamNdjson } from './apiCore';

export async function createProject(payload: {
  research_question: string;
  goal?: string;
  title?: string;
  seed_query?: string;
}) {
  return request<ResearchProject>('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listProjects(options?: { signal?: AbortSignal }) {
  return request<ResearchProjectListItem[]>('/projects', { signal: options?.signal });
}

export async function getProject(projectId: number, options?: { signal?: AbortSignal }) {
  return request<ResearchProject>(`/projects/${projectId}`, { signal: options?.signal });
}

export async function updateProject(
  projectId: number,
  payload: {
    title?: string;
    research_question?: string;
    goal?: string;
    status?: string;
    seed_query?: string;
  },
) {
  return request<ResearchProject>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteProject(projectId: number) {
  return request<void>(`/projects/${projectId}`, {
    method: 'DELETE',
  });
}

export async function getProjectWorkspace(projectId: number, options?: { signal?: AbortSignal }) {
  return request<ResearchProjectWorkspace>(`/projects/${projectId}/workspace`, { signal: options?.signal });
}

export async function createProjectSearchRun(
  projectId: number,
  payload: {
    query: string;
    filters: PaperSearchFilters;
    sort_mode: PaperSearchSortMode | string;
  },
  options?: { signal?: AbortSignal },
) {
  return request<ProjectSearchRunDetail>(`/projects/${projectId}/search-runs`, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: options?.signal,
  });
}

export async function listProjectSearchRuns(projectId: number, options?: { signal?: AbortSignal }) {
  return request<ProjectSearchRun[]>(`/projects/${projectId}/search-runs`, { signal: options?.signal });
}

export async function createProjectSavedSearch(
  projectId: number,
  payload: {
    title?: string;
    query: string;
    filters: PaperSearchFilters;
    sort_mode: PaperSearchSortMode | string;
    source_run_id?: number | null;
  },
) {
  return request<ProjectSavedSearchDetail>(`/projects/${projectId}/saved-searches`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listProjectSavedSearches(projectId: number, options?: { signal?: AbortSignal }) {
  return request<ProjectSavedSearch[]>(`/projects/${projectId}/saved-searches`, { signal: options?.signal });
}

export async function getProjectSavedSearch(projectId: number, searchId: number, options?: { signal?: AbortSignal }) {
  return request<ProjectSavedSearchDetail>(`/projects/${projectId}/saved-searches/${searchId}`, { signal: options?.signal });
}

export async function updateProjectSavedSearch(
  projectId: number,
  searchId: number,
  payload: {
    title?: string;
    query?: string;
    filters?: PaperSearchFilters;
    sort_mode?: PaperSearchSortMode | string;
  },
) {
  return request<ProjectSavedSearch>(`/projects/${projectId}/saved-searches/${searchId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteProjectSavedSearch(projectId: number, searchId: number) {
  return request<void>(`/projects/${projectId}/saved-searches/${searchId}`, {
    method: 'DELETE',
  });
}

export async function rerunProjectSavedSearch(projectId: number, searchId: number) {
  return request<ProjectSavedSearchDetail>(`/projects/${projectId}/saved-searches/${searchId}/run`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function updateProjectSavedSearchCandidate(
  projectId: number,
  searchId: number,
  candidateId: number,
  payload: {
    triage_status?: string;
  },
) {
  return request<SearchCandidate>(`/projects/${projectId}/saved-searches/${searchId}/candidates/${candidateId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function generateProjectSavedSearchCandidateAiReason(projectId: number, searchId: number, candidateId: number) {
  return request<{ item: SearchCandidate }>(`/projects/${projectId}/saved-searches/${searchId}/candidates/${candidateId}/ai-reason`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function addProjectPaper(
  projectId: number,
  payload: {
    paper_id: number;
    selection_reason?: string;
    saved_search_candidate_id?: number;
  },
) {
  return request<ResearchProjectPaper>(`/projects/${projectId}/papers`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function batchAddProjectPapers(
  projectId: number,
  payload: {
    items: Array<{
      paper_id: number;
      selection_reason?: string;
      saved_search_candidate_id?: number | null;
    }>;
  },
) {
  return request<{ items: ResearchProjectPaper[] }>(`/projects/${projectId}/papers/batch-add`, {
    method: 'POST',
    body: JSON.stringify({
      items: payload.items.map((item) => ({
        paper_id: item.paper_id,
        selection_reason: item.selection_reason ?? '',
        saved_search_candidate_id: item.saved_search_candidate_id ?? null,
      })),
    }),
  });
}

export async function removeProjectPaper(projectId: number, projectPaperId: number) {
  return request<void>(`/projects/${projectId}/papers/${projectPaperId}`, {
    method: 'DELETE',
  });
}

export async function batchUpdateProjectPaperState(
  projectId: number,
  payload: {
    paper_ids: number[];
    reading_status?: string;
    repro_interest?: string;
    read_at?: string | null;
    clear_read_at?: boolean;
    is_core_paper?: boolean;
  },
) {
  return request<{ updated_paper_ids: number[] }>(`/projects/${projectId}/papers/batch-state`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function createProjectEvidence(
  projectId: number,
  payload: {
    paper_id?: number | null;
    summary_id?: number | null;
    paragraph_id?: number | null;
    kind?: string;
    excerpt: string;
    note_text?: string;
    source_label?: string;
    sort_order?: number | null;
  },
) {
  return request<ResearchProjectEvidenceItem>(`/projects/${projectId}/evidence`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProjectEvidence(
  projectId: number,
  evidenceId: number,
  payload: {
    kind?: string;
    excerpt?: string;
    note_text?: string;
    source_label?: string;
    sort_order?: number;
  },
) {
  return request<ResearchProjectEvidenceItem>(`/projects/${projectId}/evidence/${evidenceId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteProjectEvidence(projectId: number, evidenceId: number) {
  return request<void>(`/projects/${projectId}/evidence/${evidenceId}`, {
    method: 'DELETE',
  });
}

export async function reorderProjectEvidence(projectId: number, evidenceIds: number[]) {
  return request<{ items: ResearchProjectEvidenceItem[] }>(`/projects/${projectId}/evidence/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ evidence_ids: evidenceIds }),
  });
}

export async function updateProjectOutput(
  projectId: number,
  outputId: number,
  payload: {
    title?: string;
    content_json?: Record<string, unknown>;
    content_markdown?: string;
    status?: string;
  },
) {
  return request<ResearchProjectOutput>(`/projects/${projectId}/outputs/${outputId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function insertProjectReviewEvidence(
  projectId: number,
  payload: {
    evidence_ids: number[];
    placement?: 'append' | 'cursor' | string;
    cursor_index?: number | null;
    target_heading?: string;
  },
) {
  return request<ResearchProjectOutput>(`/projects/${projectId}/outputs/literature-review/insert-evidence`, {
    method: 'POST',
    body: JSON.stringify({
      evidence_ids: payload.evidence_ids,
      placement: payload.placement ?? 'append',
      cursor_index: payload.cursor_index ?? null,
      target_heading: payload.target_heading ?? '',
    }),
  });
}

export async function extractProjectEvidence(
  projectId: number,
  payload: {
    paper_ids?: number[];
    instruction?: string;
  },
) {
  return request<ProjectActionLaunchResponse>(`/projects/${projectId}/actions/extract-evidence`, {
    method: 'POST',
    body: JSON.stringify({
      paper_ids: payload.paper_ids ?? [],
      instruction: payload.instruction ?? '',
    }),
  });
}

export async function generateProjectCompareTable(
  projectId: number,
  payload: {
    paper_ids?: number[];
    instruction?: string;
  },
) {
  return request<ProjectActionLaunchResponse>(`/projects/${projectId}/actions/generate-compare-table`, {
    method: 'POST',
    body: JSON.stringify({
      paper_ids: payload.paper_ids ?? [],
      instruction: payload.instruction ?? '',
    }),
  });
}

export async function draftProjectLiteratureReview(
  projectId: number,
  payload: {
    paper_ids?: number[];
    instruction?: string;
  },
) {
  return request<ProjectActionLaunchResponse>(`/projects/${projectId}/actions/draft-literature-review`, {
    method: 'POST',
    body: JSON.stringify({
      paper_ids: payload.paper_ids ?? [],
      instruction: payload.instruction ?? '',
    }),
  });
}

export async function fetchProjectPdfs(
  projectId: number,
  payload: {
    paper_ids?: number[];
    instruction?: string;
  },
) {
  return request<ProjectActionLaunchResponse>(`/projects/${projectId}/actions/fetch-pdfs`, {
    method: 'POST',
    body: JSON.stringify({
      paper_ids: payload.paper_ids ?? [],
      instruction: payload.instruction ?? '',
    }),
  });
}

export async function refreshProjectMetadata(
  projectId: number,
  payload: {
    paper_ids?: number[];
    instruction?: string;
  },
) {
  return request<ProjectActionLaunchResponse>(`/projects/${projectId}/actions/refresh-metadata`, {
    method: 'POST',
    body: JSON.stringify({
      paper_ids: payload.paper_ids ?? [],
      instruction: payload.instruction ?? '',
    }),
  });
}

export async function ensureProjectSummaries(
  projectId: number,
  payload: {
    paper_ids?: number[];
    instruction?: string;
  },
) {
  return request<ProjectActionLaunchResponse>(`/projects/${projectId}/actions/ensure-summaries`, {
    method: 'POST',
    body: JSON.stringify({
      paper_ids: payload.paper_ids ?? [],
      instruction: payload.instruction ?? '',
    }),
  });
}

export async function curateProjectReadingList(
  projectId: number,
  payload: {
    user_need: string;
    target_count?: number;
    selection_profile?: 'balanced' | 'repro_first' | 'frontier_first' | string;
    saved_search_id?: number | null;
    sources?: string[];
  },
) {
  return request<ProjectActionLaunchResponse>(`/projects/${projectId}/actions/curate-reading-list`, {
    method: 'POST',
    body: JSON.stringify({
      user_need: payload.user_need,
      target_count: payload.target_count ?? 100,
      selection_profile: payload.selection_profile ?? 'balanced',
      saved_search_id: payload.saved_search_id ?? null,
      sources: payload.sources ?? ['arxiv', 'openalex', 'semantic_scholar'],
    }),
  });
}

export async function listProjectDuplicates(projectId: number, options?: { signal?: AbortSignal }) {
  return request<{ groups: ProjectDuplicateGroup[] }>(`/projects/${projectId}/duplicates`, { signal: options?.signal });
}

export async function mergeProjectDuplicates(
  projectId: number,
  payload: {
    canonical_paper_id: number;
    merged_paper_ids: number[];
  },
) {
  return request<{ groups: ProjectDuplicateGroup[] }>(`/projects/${projectId}/duplicates/merge`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getProjectTask(projectId: number, taskId: number) {
  return request<ResearchProjectTaskDetail>(`/projects/${projectId}/tasks/${taskId}`);
}

export async function streamProjectTask(
  projectId: number,
  taskId: number,
  options: {
    signal?: AbortSignal;
    onEvent: (event: ResearchProjectTaskEvent) => void;
  },
) {
  return streamNdjson(`/projects/${projectId}/tasks/${taskId}/stream`, {
    signal: options.signal,
    onEvent: (event) => options.onEvent(event as ResearchProjectTaskEvent),
  });
}
