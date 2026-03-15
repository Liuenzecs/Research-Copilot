import PaperReaderScreen from '@/components/papers/PaperReaderScreen';

function parseNumber(raw?: string | string[] | null): number | null {
  if (!raw || Array.isArray(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export default async function PaperReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ paperId: string }>;
  searchParams?: Promise<{ summary_id?: string | string[] }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const paperId = parseNumber(resolvedParams.paperId);
  const summaryId = parseNumber(resolvedSearchParams?.summary_id ?? null);

  if (!paperId) {
    return null;
  }

  return <PaperReaderScreen paperId={paperId} requestedSummaryId={summaryId} />;
}
