"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import { listReflections, listTasks } from '@/lib/api';
import { formatDateTime, reflectionTypeLabel, taskStatusLabel, taskTypeLabel } from '@/lib/presentation';
import { Reflection, Task } from '@/lib/types';

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      listTasks({ include_archived: false }),
      listReflections({ lifecycle_status: 'draft' }),
    ])
      .then(([taskRows, reflectionRows]) => {
        setTasks(taskRows as Task[]);
        setReflections(reflectionRows as Reflection[]);
      })
      .catch((loadError) => {
        setError((loadError as Error).message || '仪表盘加载失败，请稍后重试。');
      })
      .finally(() => setLoading(false));
  }, []);

  const blockedReproTasks = useMemo(
    () => tasks.filter((task) => task.task_type.includes('reproduction') && (task.status.includes('blocked') || task.status.includes('warning'))),
    [tasks],
  );

  const reportWorthy = useMemo(() => reflections.filter((item) => item.is_report_worthy), [reflections]);

  return (
    <>
      <Card>
        <h2 className="title">仪表盘</h2>
        <p className="subtle">继续研究、阻塞排查和周报整理都从这里进入。</p>
      </Card>

      <StatusStack items={error ? [{ variant: 'error' as const, message: error }] : []} />

      <div className="grid-2">
        <Card>
          <h3 className="title" style={{ fontSize: 16 }}>
            继续研究
          </h3>
          <p className="subtle">直接进入论文搜索、复现和心得主工作面。</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/search" className="button secondary">论文搜索</Link>
            <Link href="/reproduction" className="button secondary">复现跟踪</Link>
            <Link href="/reflections" className="button secondary">研究心得</Link>
          </div>
        </Card>
        <Card>
          <h3 className="title" style={{ fontSize: 16 }}>
            周报入口
          </h3>
          <p className="subtle">聚合可汇报心得、阻塞和下周行动。</p>
          <Link href="/dashboard/weekly-report" className="button">打开周报工作区</Link>
        </Card>
      </div>

      <Card>
        <h3 className="title" style={{ fontSize: 16 }}>
          待汇报心得
        </h3>
        {loading ? <Loading /> : null}
        {!loading && reportWorthy.length === 0 ? <EmptyState title="暂无可汇报心得" /> : null}
        {!loading && reportWorthy.length > 0 ? (
          <ul>
            {reportWorthy.slice(0, 10).map((item) => (
              <li key={item.id}>
                {item.report_summary || '暂无摘要'} · {reflectionTypeLabel(item.reflection_type)}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card>
        <h3 className="title" style={{ fontSize: 16 }}>
          复现阻塞与最近任务
        </h3>
        {loading ? <Loading /> : null}
        {!loading && tasks.length === 0 ? <EmptyState title="暂无任务" /> : null}
        {!loading && tasks.length > 0 ? (
          <>
            {blockedReproTasks.length > 0 ? (
              <>
                <strong>阻塞任务</strong>
                <ul>
                  {blockedReproTasks.slice(0, 8).map((task) => (
                    <li key={task.id}>
                      {taskTypeLabel(task.task_type)} · {taskStatusLabel(task.status)} · {formatDateTime(task.updated_at || task.created_at)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="subtle">当前无明显阻塞任务。</p>
            )}
            <strong>最近任务</strong>
            <ul>
              {tasks.slice(0, 12).map((task) => (
                <li key={task.id}>
                  {taskTypeLabel(task.task_type)} · {taskStatusLabel(task.status)} · {formatDateTime(task.updated_at || task.created_at)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Card>
    </>
  );
}
