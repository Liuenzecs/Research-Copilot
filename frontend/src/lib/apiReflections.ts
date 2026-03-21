import { Reflection } from './types';
import { qs, request } from './apiCore';

export async function listReflections(params?: {
  reflection_type?: string;
  lifecycle_status?: string;
  is_report_worthy?: boolean;
  date_from?: string;
  date_to?: string;
  project_id?: number;
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
