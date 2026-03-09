import EmptyState from '@/components/common/EmptyState';

export default function MemoryList({ items }: { items: Array<{ id: number; memory_type: string; text_content: string }> }) {
  if (items.length === 0) {
    return <EmptyState title="暂无记忆结果" hint="先执行一次 memory/query。" />;
  }
  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>记忆检索结果</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.memory_type}</strong> - {item.text_content.slice(0, 120)}
          </li>
        ))}
      </ul>
    </div>
  );
}
