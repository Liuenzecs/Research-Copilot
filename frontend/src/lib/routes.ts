export function paperReaderPath(paperId: number | string, summaryId?: number | null): string {
  const params = new URLSearchParams();
  if (summaryId) {
    params.set('summary_id', String(summaryId));
  }
  const query = params.toString();
  return `/papers/${paperId}${query ? `?${query}` : ''}`;
}
