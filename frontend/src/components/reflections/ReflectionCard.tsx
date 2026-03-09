import { Reflection } from '@/lib/types';

export default function ReflectionCard({ reflection }: { reflection: Reflection }) {
  return (
    <article className="card">
      <h4 style={{ margin: 0 }}>{reflection.template_type === 'paper' ? '论文心得' : '复现心得'}</h4>
      <p className="subtle">{reflection.event_date} · {reflection.lifecycle_status} · {reflection.stage}</p>
      <p>{reflection.report_summary || reflection.content_markdown?.slice(0, 120) || '无摘要'}</p>
      {reflection.is_report_worthy ? <p className="subtle">建议汇报给导师</p> : null}
    </article>
  );
}
