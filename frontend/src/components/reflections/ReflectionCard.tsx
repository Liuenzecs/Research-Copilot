import { Reflection } from '@/lib/types';

function chip(label: string) {
  return (
    <span style={{ border: '1px solid #d1d5db', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
      {label}
    </span>
  );
}

export default function ReflectionCard({ reflection }: { reflection: Reflection }) {
  return (
    <article className="card">
      <h4 style={{ margin: 0 }}>{reflection.template_type === 'paper' ? '论文心得' : '复现心得'}</h4>
      <p className="subtle">{reflection.event_date} · {reflection.lifecycle_status} · {reflection.stage}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {reflection.related_paper_id ? chip(`paper#${reflection.related_paper_id}`) : null}
        {reflection.related_summary_id ? chip(`summary#${reflection.related_summary_id}`) : null}
        {reflection.related_reproduction_id ? chip(`repro#${reflection.related_reproduction_id}`) : null}
        {reflection.related_task_id ? chip(`task#${reflection.related_task_id}`) : null}
      </div>
      <p>{reflection.report_summary || reflection.content_markdown?.slice(0, 120) || '无摘要'}</p>
      {reflection.is_report_worthy ? <p className="subtle">建议汇报给导师</p> : null}
    </article>
  );
}
