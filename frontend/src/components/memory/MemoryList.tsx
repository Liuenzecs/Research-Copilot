import Link from 'next/link';

import EmptyState from '@/components/common/EmptyState';
import {
  formatDateTime,
  memoryJumpButtonLabel,
  memoryLayerLabel,
  memoryRetrievalModeLabel,
  memoryTypeLabel,
} from '@/lib/presentation';
import { MemoryItem } from '@/lib/types';
import { truncate } from '@/lib/utils';

export default function MemoryList({
  items,
  title = '记忆结果',
  emptyTitle = '暂无记忆结果',
  emptyHint = '先执行一次记忆检索，这里会展示可回跳的上下文线索。',
}: {
  items: MemoryItem[];
  title?: string;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>
        {title}
      </h3>
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {items.map((item) => (
          <article
            key={item.id}
            style={{
              border: '1px solid rgba(15, 23, 42, 0.08)',
              borderRadius: 12,
              padding: 12,
              display: 'grid',
              gap: 6,
            }}
          >
            <div>
              <strong>{memoryTypeLabel(item.memory_type)}</strong>
              <span className="subtle"> · {memoryLayerLabel(item.layer)}</span>
              <span> · {truncate(item.text_content, 120)}</span>
            </div>
            <div className="subtle">{item.context_hint || '当前记忆暂无可回跳上下文。'}</div>
            <div className="subtle">
              {memoryRetrievalModeLabel(item.retrieval_mode)} · {item.match_reason}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="subtle">记录时间：{formatDateTime(item.created_at)}</span>
              {item.jump_target ? (
                <Link href={item.jump_target.path} className="button secondary">
                  {memoryJumpButtonLabel(item.jump_target.kind)}
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
