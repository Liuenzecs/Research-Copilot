"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import { createProject, listProjects } from '@/lib/api';
import { projectPath } from '@/lib/routes';
import { ResearchProject } from '@/lib/types';

function formatDateTime(value?: string | null) {
  if (!value) return '未打开';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

function statusLabel(status: string) {
  switch (status) {
    case 'active':
      return '进行中';
    case 'paused':
      return '暂停';
    case 'archived':
      return '已归档';
    default:
      return status;
  }
}

export default function ProjectsHome() {
  const router = useRouter();
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [researchQuestion, setResearchQuestion] = useState('');
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadProjects() {
    setLoading(true);
    setError('');
    try {
      setProjects(await listProjects());
    } catch (loadError) {
      setError((loadError as Error).message || '加载项目列表失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function handleCreateProject() {
    if (!researchQuestion.trim()) {
      setError('请先输入你想搞清楚的研究问题。');
      return;
    }

    setCreating(true);
    setError('');
    setNotice('');
    try {
      const project = await createProject({
        research_question: researchQuestion.trim(),
        goal: goal.trim(),
      });
      router.push(projectPath(project.id));
    } catch (createError) {
      setError((createError as Error).message || '创建项目失败，请稍后重试。');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Card className="projects-home-hero">
        <div className="projects-home-copy">
          <span className="projects-kicker">Research Notebook</span>
          <h1 className="projects-home-title">从研究问题开始，而不是从功能模块开始。</h1>
          <p className="projects-home-text">
            输入一个研究问题，创建一个项目工作台，然后在同一处完成论文收集、证据提取、对比表整理和综述起草。
          </p>
        </div>

        <div className="projects-home-form">
          <label className="projects-field">
            <span>研究问题</span>
            <textarea
              className="textarea projects-home-question"
              data-testid="project-question-input"
              placeholder="你想搞清楚什么研究问题？"
              value={researchQuestion}
              onChange={(event) => setResearchQuestion(event.target.value)}
            />
          </label>

          <label className="projects-field">
            <span>目标产出</span>
            <input
              className="input"
              data-testid="project-goal-input"
              placeholder="可选，例如：做一个方法对比表并起草综述"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
          </label>

          <div className="projects-home-actions">
            <Button type="button" data-testid="create-project-button" onClick={() => void handleCreateProject()} disabled={creating}>
              {creating ? '正在创建项目...' : '创建项目并进入工作台'}
            </Button>
            <Button className="secondary" type="button" onClick={() => void loadProjects()} disabled={loading}>
              刷新项目列表
            </Button>
          </div>
        </div>
      </Card>

      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...(notice ? [{ variant: 'success' as const, message: notice }] : []),
        ]}
      />

      <Card>
        <div className="projects-section-header">
          <div>
            <h2 className="title">最近项目</h2>
            <p className="subtle" style={{ margin: '6px 0 0' }}>
              主入口已经切换为项目工作台。旧的阅读、复现、心得、记忆仍然保留，但不再要求你先理解内部模块名。
            </p>
          </div>
        </div>

        {loading ? <Loading text="正在加载项目..." /> : null}

        {!loading && projects.length === 0 ? (
          <EmptyState
            title="还没有项目"
            hint="先创建一个研究问题项目，后续的论文池、证据板、对比表和综述稿都会围绕这个项目展开。"
          />
        ) : null}

        {!loading && projects.length > 0 ? (
          <div className="projects-list">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="project-list-card"
                onClick={() => router.push(projectPath(project.id))}
              >
                <div className="project-list-card-head">
                  <strong>{project.title}</strong>
                  <span className={`project-status-badge status-${project.status}`.trim()}>{statusLabel(project.status)}</span>
                </div>
                <p className="project-list-question">{project.research_question}</p>
                <div className="subtle">
                  目标产出：{project.goal || '未填写'}
                </div>
                <div className="subtle">
                  最近打开：{formatDateTime(project.last_opened_at || project.updated_at)}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </Card>
    </>
  );
}
