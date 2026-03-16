export function paperReaderPath(
  paperId: number | string,
  summaryId?: number | null,
  paragraphId?: number | null,
): string {
  const params = new URLSearchParams();
  if (summaryId) {
    params.set('summary_id', String(summaryId));
  }
  if (paragraphId) {
    params.set('paragraph_id', String(paragraphId));
  }
  const query = params.toString();
  return `/papers/${paperId}${query ? `?${query}` : ''}`;
}
