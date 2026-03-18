import EmptyState from '@/components/common/EmptyState';
import { summaryTypeLabel } from '@/lib/presentation';
import { Summary } from '@/lib/types';

export default function SummaryPanel({ summary }: { summary: Summary | null }) {
  if (!summary) {
    return <EmptyState title="暂无总结" hint="可在后端 API 触发快速摘要或深度摘要。" />;
  }

  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>{summaryTypeLabel(summary.summary_type)}</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{summary.content_en}</p>
    </div>
  );
}
