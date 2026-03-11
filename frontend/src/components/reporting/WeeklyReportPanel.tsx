import Link from 'next/link';

import { WeeklyReportContext } from '@/lib/types';

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export default function WeeklyReportPanel({ context }: { context: WeeklyReportContext | null }) {
  if (!context) {
    return (
      <div className="card">
        <h3 className="title" style={{ fontSize: 16 }}>周报上下文</h3>
        <p className="subtle">请选择周期后加载周报上下文。</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <h3 className="title" style={{ fontSize: 16 }}>周报上下文</h3>
      <p className="subtle">{context.week_start} ~ {context.week_end}</p>

      <div>
        <strong>可汇报心得 ({context.report_worthy_reflections.length})</strong>
        <ul>
          {context.report_worthy_reflections.slice(0, 8).map((item) => {
            const paperId = asNumber(item.related_paper_id);
            return (
              <li key={String(item.id)}>
                {String(item.report_summary || '无摘要')}
                {paperId ? (
                  <>
                    {' '}
                    <Link href={`/search?paper_id=${paperId}`} className="button secondary">打开论文工作区</Link>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <strong>复现阻塞 ({context.blockers.length})</strong>
        <ul>
          {context.blockers.slice(0, 8).map((item) => {
            const reproductionId = asNumber(item.reproduction_id);
            return (
              <li key={`${String(item.reproduction_id)}-${String(item.step_id)}`}>
                复现#{String(item.reproduction_id)} 步骤{String(item.step_no)}: {String(item.blocker_reason || '待补充')}
                {reproductionId ? (
                  <>
                    {' '}
                    <Link href="/reproduction" className="button secondary">打开复现跟踪</Link>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <strong>下周行动</strong>
        <ul>
          {context.next_actions.slice(0, 10).map((item, idx) => (
            <li key={`${idx}-${item}`}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
