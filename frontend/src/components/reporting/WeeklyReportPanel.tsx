import Link from 'next/link';

import { formatDateTime, reproductionStatusLabel } from '@/lib/presentation';
import { WeeklyReportContext } from '@/lib/types';

function activityTypeLabel(activityType: string) {
  if (activityType === 'read') return '计入阅读';
  switch (activityType) {
    case 'added':
      return '新入库';
    case 'summary':
      return '生成摘要';
    case 'reflection':
      return '记录心得';
    case 'read':
      return '更新阅读状态';
    case 'reproduction':
      return '推进复现';
    default:
      return activityType;
  }
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <strong>
      {title} ({count})
    </strong>
  );
}

export default function WeeklyReportPanel({
  context,
  contextSource,
}: {
  context: WeeklyReportContext | null;
  contextSource: 'live' | 'snapshot';
}) {
  if (!context) {
    return (
      <div className="card">
        <h3 className="title" style={{ fontSize: 16 }}>
          周报上下文
        </h3>
        <p className="subtle">请选择周期后加载周报上下文。</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 className="title" style={{ fontSize: 16, marginBottom: 4 }}>
          周报上下文
        </h3>
        <p className="subtle" style={{ margin: 0 }}>
          {context.week_start} ~ {context.week_end}
        </p>
        {contextSource === 'snapshot' ? (
          <p className="subtle" style={{ color: '#0f766e', margin: '6px 0 0 0' }}>
            当前显示的是该草稿生成时保存的历史快照。
          </p>
        ) : (
          <p className="subtle" style={{ margin: '6px 0 0 0' }}>
            当前显示的是实时周报上下文。
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <SectionTitle title="可汇报心得" count={context.report_worthy_reflections.length} />
        {context.report_worthy_reflections.length === 0 ? (
          <p className="subtle" style={{ margin: 0 }}>本周暂无标记为可汇报的心得。</p>
        ) : (
          <ul style={{ margin: 0 }}>
            {context.report_worthy_reflections.slice(0, 8).map((item) => (
              <li key={item.id} style={{ marginBottom: 6 }}>
                <span>{item.event_date} · {item.report_summary || '暂无摘要'}</span>
                {item.related_paper_id ? (
                  <>
                    {' '}
                    <Link href={`/papers/${item.related_paper_id}`} className="button secondary">
                      打开论文工作区
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <SectionTitle title="最近论文" count={context.recent_papers.length} />
        {context.recent_papers.length === 0 ? (
          <p className="subtle" style={{ margin: 0 }}>本周暂无论文活动记录。</p>
        ) : (
          <ul style={{ margin: 0 }}>
            {context.recent_papers.slice(0, 8).map((item) => (
              <li key={item.paper_id} style={{ marginBottom: 8 }}>
                <div>
                  <strong>{item.title_en}</strong>
                  <span className="subtle"> ({item.source}{item.year ? `, ${item.year}` : ''})</span>
                </div>
                <div className="subtle">最近活动：{formatDateTime(item.last_activity_at)} · {activityTypeLabel(item.activity_type)}</div>
                <div className="subtle">{item.activity_summary}</div>
                <div style={{ marginTop: 4 }}>
                  <Link href={`/papers/${item.paper_id}`} className="button secondary">
                    打开论文工作区
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <SectionTitle title="复现进展" count={context.reproduction_progress.length} />
        {context.reproduction_progress.length === 0 ? (
          <p className="subtle" style={{ margin: 0 }}>本周暂无复现进展记录。</p>
        ) : (
          <ul style={{ margin: 0 }}>
            {context.reproduction_progress.slice(0, 8).map((item) => (
              <li key={item.reproduction_id} style={{ marginBottom: 8 }}>
                <div>
                  <strong>{item.paper_title || '未命名复现记录'}</strong>
                  <span className="subtle"> · {item.repo_label || '仅论文上下文'}</span>
                </div>
                <div className="subtle">
                  状态：{reproductionStatusLabel(item.status)} · 进度：
                  {item.progress_percent ?? '未设置'}
                  {item.progress_percent !== null && item.progress_percent !== undefined ? '%' : ''}
                </div>
                <div className="subtle">摘要：{item.progress_summary || '暂无进展摘要。'}</div>
                <div className="subtle">更新于：{formatDateTime(item.updated_at)}</div>
                <div style={{ marginTop: 4 }}>
                  <Link href={`/reproduction?reproduction_id=${item.reproduction_id}`} className="button secondary">
                    打开复现工作区
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <SectionTitle title="当前阻塞" count={context.blockers.length} />
        {context.blockers.length === 0 ? (
          <p className="subtle" style={{ margin: 0 }}>本周暂无仍处于阻塞状态的步骤。</p>
        ) : (
          <ul style={{ margin: 0 }}>
            {context.blockers.slice(0, 8).map((item) => (
              <li key={`${item.reproduction_id}-${item.step_id}`} style={{ marginBottom: 8 }}>
                <div>
                  <strong>{item.paper_title || '未命名复现记录'}</strong>
                  <span className="subtle"> · 步骤 {item.step_no}</span>
                </div>
                <div className="subtle">{item.blocker_reason || '待补充阻塞说明。'}</div>
                <div className="subtle">阻塞时间：{formatDateTime(item.blocked_at)}</div>
                <div style={{ marginTop: 4 }}>
                  <Link href={`/reproduction?reproduction_id=${item.reproduction_id}`} className="button secondary">
                    打开复现工作区
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <SectionTitle title="下周行动" count={context.next_actions.length} />
        {context.next_actions.length === 0 ? (
          <p className="subtle" style={{ margin: 0 }}>请补充本周复盘与下一步计划。</p>
        ) : (
          <ul style={{ margin: 0 }}>
            {context.next_actions.slice(0, 10).map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
