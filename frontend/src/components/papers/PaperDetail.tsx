import EmptyState from '@/components/common/EmptyState';
import { paperPrimaryTitle, paperSecondaryTitle } from '@/lib/presentation';
import { Paper } from '@/lib/types';

export default function PaperDetail({ paper }: { paper: Paper | null }) {
  if (!paper) {
    return <EmptyState title="未选择论文" hint="从左侧结果列表选择一篇论文查看详情。" />;
  }

  return (
    <div className="card">
      <div className="paper-title-stack">
        <h3 className="title paper-title-primary" style={{ fontSize: 18 }}>
          {paperPrimaryTitle(paper)}
        </h3>
        {paperSecondaryTitle(paper) ? <div className="paper-title-secondary">{paperSecondaryTitle(paper)}</div> : null}
      </div>
      <p className="subtle">{paper.authors || '作者未知'}</p>
      <p className="subtle">
        {paper.source} · {paper.year ?? '年份未知'}
      </p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{paper.abstract_en || '暂无摘要。'}</p>
      <div className="subtle">PDF：{paper.pdf_local_path || paper.pdf_url || '未下载'}</div>
    </div>
  );
}
