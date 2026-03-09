import { Summary } from '@/lib/types';

import EmptyState from '@/components/common/EmptyState';

export default function SummaryPanel({ summary }: { summary: Summary | null }) {
  if (!summary) {
    return <EmptyState title="暂无总结" hint="可在后端 API 触发 quick/deep summary。" />;
  }

  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>{summary.summary_type.toUpperCase()} Summary</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{summary.content_en}</p>
    </div>
  );
}
