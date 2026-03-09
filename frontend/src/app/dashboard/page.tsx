"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import { listReflections, listTasks } from '@/lib/api';
import { Reflection, Task } from '@/lib/types';

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listTasks({ include_archived: false }),
      listReflections({ lifecycle_status: 'draft' }),
    ])
      .then(([taskRows, reflectionRows]) => {
        setTasks(taskRows as Task[]);
        setReflections(reflectionRows as Reflection[]);
      })
      .finally(() => setLoading(false));
  }, []);

  const blockedReproTasks = useMemo(
    () => tasks.filter((t) => t.task_type.includes('reproduction') && (t.status.includes('blocked') || t.status.includes('warning'))),
    [tasks],
  );

  const reportWorthy = useMemo(() => reflections.filter((r) => r.is_report_worthy), [reflections]);

  return (
    <>
      <Card>
        <h2 className="title">仪表盘</h2>
        <p className="subtle">继续研究、阻塞排查、周报生成在同一工作区完成。</p>
      </Card>

      <div className="grid-2">
        <Card>
          <h3 className="title" style={{ fontSize: 16 }}>继续研究</h3>
          <p className="subtle">直接进入核心流程页面：</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/search" className="button secondary">论文工作区</Link>
            <Link href="/reproduction" className="button secondary">复现跟踪</Link>
            <Link href="/reflections" className="button secondary">研究心得</Link>
          </div>
        </Card>
        <Card>
          <h3 className="title" style={{ fontSize: 16 }}>周报入口</h3>
          <p className="subtle">聚合可汇报心得、阻塞和下一步动作。</p>
          <Link href="/dashboard/weekly-report" className="button">打开周报工作区</Link>
        </Card>
      </div>

      <Card>
        <h3 className="title" style={{ fontSize: 16 }}>待汇报摘要</h3>
        {loading ? <Loading /> : null}
        {!loading && reportWorthy.length === 0 ? <EmptyState title="暂无可汇报心得" /> : null}
        {!loading && reportWorthy.length > 0 ? (
          <ul>
            {reportWorthy.slice(0, 10).map((item) => (
              <li key={item.id}>#{item.id} {item.report_summary || '无摘要'} ({item.reflection_type})</li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card>
        <h3 className="title" style={{ fontSize: 16 }}>复现阻塞与最近任务</h3>
        {loading ? <Loading /> : null}
        {!loading && tasks.length === 0 ? <EmptyState title="暂无任务" /> : null}
        {!loading && tasks.length > 0 ? (
          <>
            {blockedReproTasks.length > 0 ? (
              <>
                <strong>阻塞任务</strong>
                <ul>
                  {blockedReproTasks.slice(0, 8).map((task) => (
                    <li key={task.id}>#{task.id} {task.task_type} - {task.status}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="subtle">当前无明显阻塞任务。</p>
            )}
            <strong>最近任务</strong>
            <ul>
              {tasks.slice(0, 12).map((task) => (
                <li key={task.id}>#{task.id} {task.task_type} - {task.status}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Card>
    </>
  );
}
