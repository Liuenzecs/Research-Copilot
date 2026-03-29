import { Paper } from '@/lib/types';
import { paperPrimaryTitle, paperSecondaryTitle } from '@/lib/presentation';
import { truncate } from '@/lib/utils';

export default function PaperCard({ paper, onSelect }: { paper: Paper; onSelect?: (paper: Paper) => void }) {
  return (
    <button
      type="button"
      className="card"
      style={{ textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 8 }}
      onClick={() => onSelect?.(paper)}
    >
      <div className="paper-title-stack">
        <h4 className="paper-title-primary" style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
          {paperPrimaryTitle(paper)}
        </h4>
        {paperSecondaryTitle(paper) ? <div className="paper-title-secondary">{paperSecondaryTitle(paper)}</div> : null}
      </div>
      <p className="subtle" style={{ margin: 0 }}>
        {paper.source} · {paper.year ?? '年份未知'}
      </p>
      <p style={{ margin: 0 }}>{truncate(paper.abstract_en || '暂无摘要', 240)}</p>
      <div className="subtle" style={{ fontSize: 12 }}>
        点击后进入独立论文阅读页
      </div>
    </button>
  );
}
