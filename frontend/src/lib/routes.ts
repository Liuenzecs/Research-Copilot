export function paperReaderPath(
  paperId: number | string,
  summaryId?: number | null,
  paragraphId?: number | null,
  projectId?: number | string | null,
): string {
  const params = new URLSearchParams();
  if (summaryId) {
    params.set('summary_id', String(summaryId));
  }
  if (paragraphId) {
    params.set('paragraph_id', String(paragraphId));
  }
  if (projectId) {
    params.set('project_id', String(projectId));
  }
  const query = params.toString();
  return `/papers/${paperId}${query ? `?${query}` : ''}`;
}

export function projectPath(projectId?: number | string | null): string {
  return projectId ? `/projects/${projectId}` : '/projects';
}

export function reflectionsPath(options?: {
  reflectionId?: number | string | null;
  paperId?: number | string | null;
  projectId?: number | string | null;
}): string {
  const params = new URLSearchParams();
  if (options?.reflectionId) {
    params.set('reflection_id', String(options.reflectionId));
  }
  if (options?.paperId) {
    params.set('paper_id', String(options.paperId));
  }
  if (options?.projectId) {
    params.set('project_id', String(options.projectId));
  }
  const query = params.toString();
  return `/reflections${query ? `?${query}` : ''}`;
}

export function reproductionPath(options?: {
  paperId?: number | string | null;
  reproductionId?: number | string | null;
  projectId?: number | string | null;
}): string {
  const params = new URLSearchParams();
  if (options?.paperId) {
    params.set('paper_id', String(options.paperId));
  }
  if (options?.reproductionId) {
    params.set('reproduction_id', String(options.reproductionId));
  }
  if (options?.projectId) {
    params.set('project_id', String(options.projectId));
  }
  const query = params.toString();
  return `/reproduction${query ? `?${query}` : ''}`;
}

export function memoryPath(projectId?: number | string | null): string {
  const params = new URLSearchParams();
  if (projectId) {
    params.set('project_id', String(projectId));
  }
  const query = params.toString();
  return `/memory${query ? `?${query}` : ''}`;
}
