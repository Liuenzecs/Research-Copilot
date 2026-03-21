import { ReproductionDetail, ReproductionListItem, ReproductionLog, ReproductionPlanResult, RepoFindResponse } from './types';
import { qs, request } from './apiCore';

export async function findRepos(payload: { paper_id?: number; query?: string }) {
  return request<RepoFindResponse>('/repos/find', {
    method: 'POST',
    body: JSON.stringify({
      paper_id: payload.paper_id ?? null,
      query: payload.query ?? null,
    }),
  });
}

export async function listReproductions(params?: { paper_id?: number; repo_id?: number; project_id?: number; limit?: number }) {
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
