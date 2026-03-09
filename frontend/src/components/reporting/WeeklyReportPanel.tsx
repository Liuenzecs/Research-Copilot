import { WeeklyReportContext } from '@/lib/types';

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
          {context.report_worthy_reflections.slice(0, 8).map((item) => (
            <li key={String(item.id)}>{String(item.report_summary || '无摘要')}</li>
          ))}
        </ul>
      </div>

      <div>
        <strong>复现阻塞 ({context.blockers.length})</strong>
        <ul>
          {context.blockers.slice(0, 8).map((item) => (
            <li key={`${String(item.reproduction_id)}-${String(item.step_id)}`}>
              复现#{String(item.reproduction_id)} 步骤{String(item.step_no)}: {String(item.blocker_reason || '待补充')}
            </li>
          ))}
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
