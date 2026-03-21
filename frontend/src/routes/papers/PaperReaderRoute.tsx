import { Navigate, useParams, useSearchParams } from 'react-router-dom';

import PaperReaderScreen from '@/components/papers/PaperReaderScreen';

function parseRouteNumber(raw?: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export default function PaperReaderRoute() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const paperId = parseRouteNumber(params.paperId);
  const requestedSummaryId = parseRouteNumber(searchParams.get('summary_id'));
  const requestedParagraphId = parseRouteNumber(searchParams.get('paragraph_id'));
  const projectId = parseRouteNumber(searchParams.get('project_id'));

  if (!paperId) {
    return <Navigate replace to="/library" />;
  }

  return (
    <PaperReaderScreen
      paperId={paperId}
      projectId={projectId}
      requestedParagraphId={requestedParagraphId}
      requestedSummaryId={requestedSummaryId}
    />
  );
}
