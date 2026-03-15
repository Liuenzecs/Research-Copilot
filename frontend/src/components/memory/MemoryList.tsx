import Link from 'next/link';

import EmptyState from '@/components/common/EmptyState';
import { MemoryItem } from '@/lib/types';

function memoryTypeLabel(memoryType: string) {
  switch (memoryType) {
    case 'PaperMemory':
      return '论文记忆';
    case 'SummaryMemory':
      return '摘要记忆';
    case 'ReflectionMemory':
      return '心得记忆';
    case 'ReproMemory':
      return '复现记忆';
    case 'RepoMemory':
      return '代码仓记忆';
    case 'IdeaMemory':
      return '灵感记忆';
    default:
      return '其他记忆';
  }
}

function memoryLayerLabel(layer: string) {
  switch (layer) {
    case 'raw':
      return '原始层';
    case 'structured':
      return '结构层';
    case 'semantic':
      return '语义层';
    case 'profile':
      return '画像层';
    default:
      return layer || '未标注层级';
  }
}

function jumpButtonLabel(kind?: string | null) {
  switch (kind) {
    case 'paper':
      return '打开论文工作区';
    case 'reproduction':
      return '打开复现工作区';
    case 'reflection':
      return '打开心得页面';
    case 'brainstorm':
      return '打开灵感页面';
    default:
      return '';
  }
}

function contextLabel(item: MemoryItem) {
  switch (item.ref_table) {
    case 'papers':
      return item.ref_id ? `关联论文 #${item.ref_id}` : '关联论文上下文';
    case 'summaries':
      return item.ref_id ? `关联摘要 #${item.ref_id}，回到所属论文工作区` : '关联摘要上下文';
    case 'reproductions':
      return item.ref_id ? `关联复现记录 #${item.ref_id}` : '关联复现上下文';
    case 'reflections':
      return item.ref_id ? `关联心得 #${item.ref_id}` : '关联心得上下文';
    case 'repos':
      return '关联代码仓研究上下文';
    case 'ideas':
      return item.ref_id ? `关联灵感记录 #${item.ref_id}` : '关联灵感上下文';
    default:
      return '当前记忆暂无可解析的关联对象';
  }
}

export default function MemoryList({ items }: { items: MemoryItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="暂无记忆结果" hint="先执行一次记忆检索。" />;
  }

  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>记忆检索结果</h3>
      <ul style={{ margin: 0 }}>
        {items.map((item) => (
          <li key={item.id} style={{ marginBottom: 12 }}>
            <div>
              <strong>{memoryTypeLabel(item.memory_type)}</strong>
              <span className="subtle"> · {memoryLayerLabel(item.layer)}</span>
              <span>{' · '}{item.text_content.slice(0, 120)}</span>
            </div>
            <div className="subtle" style={{ marginTop: 4 }}>
              {contextLabel(item)}
            </div>
            {item.jump_target ? (
              <div style={{ marginTop: 6 }}>
                <Link href={item.jump_target.path} className="button secondary">
                  {jumpButtonLabel(item.jump_target.kind)}
                </Link>
              </div>
            ) : (
              <div className="subtle" style={{ marginTop: 6 }}>当前记忆暂无可回跳上下文。</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
