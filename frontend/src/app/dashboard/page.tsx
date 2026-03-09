"use client";

import { useEffect, useState } from 'react';

import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import { listTasks } from '@/lib/api';
import { Task } from '@/lib/types';

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTasks()
      .then((rows) => setTasks(rows as Task[]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Card>
        <h2 className="title">仪表盘</h2>
        <p className="subtle">研究状态总览、最近任务、可汇报心得。</p>
      </Card>

      <div className="grid-2">
        <Card>
          <h3 className="title" style={{ fontSize: 16 }}>今日重点</h3>
          <ul>
            <li>优先阅读核心论文并更新阅读状态</li>
            <li>完成一条结构化研究心得</li>
            <li>复现计划仅手动确认执行</li>
          </ul>
        </Card>
        <Card>
          <h3 className="title" style={{ fontSize: 16 }}>快速入口</h3>
          <p className="subtle">论文搜索 / 文献库 / 研究心得 / 长期记忆</p>
        </Card>
      </div>

      <Card>
        <h3 className="title" style={{ fontSize: 16 }}>最近工作流任务</h3>
        {loading ? <Loading /> : null}
        {!loading && tasks.length === 0 ? <EmptyState title="暂无任务" /> : null}
        {!loading && tasks.length > 0 ? (
          <ul>
            {tasks.slice(0, 12).map((task) => (
              <li key={task.id}>
                #{task.id} {task.task_type} - {task.status}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
