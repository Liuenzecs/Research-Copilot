import { WeeklyReportContext, WeeklyReportDraft } from './types';
import { qs, request } from './apiCore';

export async function getWeeklyReportContext(weekStart: string, weekEnd: string, projectId?: number | null) {
  return request<WeeklyReportContext>(`/reports/weekly/context${qs({ week_start: weekStart, week_end: weekEnd, project_id: projectId ?? null })}`);
}

export async function createWeeklyReportDraft(payload: { week_start: string; week_end: string; title?: string; project_id?: number | null }) {
  return request<WeeklyReportDraft>('/reports/weekly/drafts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listWeeklyReportDrafts(status = '', projectId?: number | null) {
  return request<WeeklyReportDraft[]>(`/reports/weekly/drafts${qs({ status, project_id: projectId ?? null })}`);
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
