import { Reflection } from '@/lib/types';

import EmptyState from '@/components/common/EmptyState';
import ReflectionCard from '@/components/reflections/ReflectionCard';

export default function ReflectionTimeline({ reflections }: { reflections: Reflection[] }) {
  if (reflections.length === 0) {
    return <EmptyState title="暂无心得时间线" hint="创建第一条研究心得后会在这里显示。" />;
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {reflections.map((item) => (
        <ReflectionCard key={item.id} reflection={item} />
      ))}
    </div>
  );
}
