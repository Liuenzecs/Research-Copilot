import Link from 'next/link';

import EmptyState from '@/components/common/EmptyState';
import { MemoryItem } from '@/lib/types';

function contextLink(item: MemoryItem) {
  if (!item.ref_table || !item.ref_id) return null;
  if (item.ref_table === 'papers') return `/search?paper_id=${item.ref_id}`;
  if (item.ref_table === 'reproductions') return '/reproduction';
  if (item.ref_table === 'reflections') return '/reflections';
  if (item.ref_table === 'summaries') return `/search?paper_id=${item.ref_id}`;
  return null;
}

export default function MemoryList({ items }: { items: MemoryItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="暂无记忆结果" hint="先执行一次 memory/query。" />;
  }
  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>记忆检索结果</h3>
      <ul>
        {items.map((item) => {
          const link = contextLink(item);
          return (
            <li key={item.id} style={{ marginBottom: 8 }}>
              <strong>{item.memory_type}</strong> [{item.layer}] - {item.text_content.slice(0, 120)}
              <span className="subtle"> (ref: {item.ref_table || '-'}#{item.ref_id ?? '-'})</span>
              {link ? (
                <div>
                  <Link href={link} className="button secondary">打开关联上下文</Link>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
