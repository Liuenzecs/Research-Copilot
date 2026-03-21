import type { PaperSearchFilters, PaperSearchSortMode } from './types';

export const queryKeys = {
  projects: {
    list: () => ['projects', 'list'] as const,
    detail: (projectId: number) => ['projects', 'detail', projectId] as const,
    workspace: (projectId: number) => ['projects', 'workspace', projectId] as const,
    savedSearches: (projectId: number) => ['projects', projectId, 'saved-searches'] as const,
    savedSearchDetail: (projectId: number, searchId: number) => ['projects', projectId, 'saved-searches', searchId] as const,
    searchRuns: (projectId: number) => ['projects', projectId, 'search-runs'] as const,
    duplicates: (projectId: number) => ['projects', projectId, 'duplicates'] as const,
  },
  papers: {
    detail: (paperId: number) => ['papers', 'detail', paperId] as const,
    workspace: (paperId: number) => ['papers', 'workspace', paperId] as const,
    reader: (paperId: number) => ['papers', 'reader', paperId] as const,
    citationTrail: (paperId: number) => ['papers', 'citation-trail', paperId] as const,
  },
  settings: {
    provider: () => ['settings', 'provider'] as const,
  },
  search: {
    root: () => ['search', 'results'] as const,
    standalone: (payload: {
      query: string;
      filters: PaperSearchFilters;
      sortMode: PaperSearchSortMode | string;
      limit: number;
    }) => ['search', 'results', payload] as const,
  },
} as const;
