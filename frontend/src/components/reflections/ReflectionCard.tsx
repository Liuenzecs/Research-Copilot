import Link from 'next/link';

import { reflectionLifecycleLabel, reflectionStageLabel, reflectionTypeLabel } from '@/lib/presentation';
import { Reflection } from '@/lib/types';

function chip(label: string) {
  return (
    <span style={{ border: '1px solid #d1d5db', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
      {label}
    </span>
  );
}

export default function ReflectionCard({
  reflection,
  highlighted = false,
}: {
  reflection: Reflection;
  highlighted?: boolean;
}) {
  const stageLabel = reflectionStageLabel(reflection.stage);

  return (
    <article
      className="card"
      style={{
        border: highlighted ? '1px solid #0f766e' : undefined,
        background: highlighted ? '#f0fdf4' : undefined,
      }}
    >
      <h4 style={{ margin: 0 }}>{reflectionTypeLabel(reflection.reflection_type)}</h4>
      <p className="subtle">
        {reflection.event_date} · {reflectionLifecycleLabel(reflection.lifecycle_status)} · {stageLabel}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {reflection.related_paper_id ? (
          <Link href={`/search?paper_id=${reflection.related_paper_id}`} style={{ textDecoration: 'none' }}>
            {chip(`论文#${reflection.related_paper_id}`)}
          </Link>
        ) : null}
        {reflection.related_summary_id && reflection.related_paper_id ? (
          <Link
            href={`/search?paper_id=${reflection.related_paper_id}&summary_id=${reflection.related_summary_id}`}
            style={{ textDecoration: 'none' }}
          >
            {chip(`摘要#${reflection.related_summary_id}`)}
          </Link>
        ) : reflection.related_summary_id ? (
          chip(`摘要#${reflection.related_summary_id}`)
        ) : null}
        {reflection.related_reproduction_id ? (
          <Link href={`/reproduction?reproduction_id=${reflection.related_reproduction_id}`} style={{ textDecoration: 'none' }}>
            {chip(`复现#${reflection.related_reproduction_id}`)}
          </Link>
        ) : null}
        {reflection.related_task_id ? chip(`任务#${reflection.related_task_id}`) : null}
      </div>
      <p>{reflection.report_summary || reflection.content_markdown?.slice(0, 120) || '暂无摘要'}</p>
      {reflection.is_report_worthy ? <p className="subtle">建议汇报给导师</p> : null}
    </article>
  );
}
