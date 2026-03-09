import { Paper } from '@/lib/types';

import EmptyState from '@/components/common/EmptyState';
import PaperCard from '@/components/papers/PaperCard';

export default function PaperList({ papers, onSelect }: { papers: Paper[]; onSelect?: (paper: Paper) => void }) {
  if (papers.length === 0) {
    return <EmptyState title="暂无论文结果" hint="先执行一次搜索。" />;
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {papers.map((paper) => (
        <PaperCard key={paper.id} paper={paper} onSelect={onSelect} />
      ))}
    </div>
  );
}
