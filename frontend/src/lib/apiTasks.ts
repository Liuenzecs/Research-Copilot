import { Task } from './types';
import { qs, request } from './apiCore';

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
