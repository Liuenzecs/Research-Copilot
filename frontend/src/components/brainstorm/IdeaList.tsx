import EmptyState from '@/components/common/EmptyState';

export default function IdeaList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <EmptyState title="暂无灵感结果" hint="先输入主题并生成。" />;
  }

  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>生成结果</h3>
      <ul>
        {items.map((item, idx) => (
          <li key={`${idx}-${item.slice(0, 20)}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
