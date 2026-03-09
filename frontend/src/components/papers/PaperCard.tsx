import { Paper } from '@/lib/types';
import { truncate } from '@/lib/utils';

export default function PaperCard({ paper, onSelect }: { paper: Paper; onSelect?: (paper: Paper) => void }) {
  return (
    <button
      type="button"
      className="card"
      style={{ textAlign: 'left', cursor: 'pointer' }}
      onClick={() => onSelect?.(paper)}
    >
      <h4 style={{ margin: 0, fontSize: 15 }}>{paper.title_en}</h4>
      <p className="subtle" style={{ marginTop: 6 }}>{paper.source} · {paper.year ?? 'N/A'}</p>
      <p style={{ marginTop: 8 }}>{truncate(paper.abstract_en || 'No abstract', 240)}</p>
    </button>
  );
}
