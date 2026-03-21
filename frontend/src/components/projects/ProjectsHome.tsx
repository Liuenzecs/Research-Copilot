"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import EmptyState from "@/components/common/EmptyState";
import Loading from "@/components/common/Loading";
import StatusStack from "@/components/common/StatusStack";
import { createProject, deleteProject, listProjects, updateProject } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { memoryPath, projectPath, reflectionsPath, reproductionPath } from "@/lib/routes";
import { usePageTitle } from "@/lib/usePageTitle";
import type { ResearchProjectListItem } from "@/lib/types";

function formatDateTime(value?: string | null) {
  if (!value) return "未打开";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function statusLabel(status: string) {
  switch (status) {
    case "active":
      return "进行中";
    case "paused":
      return "已暂停";
    case "archived":
      return "已归档";
    default:
      return status;
  }
}

export default function ProjectsHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  usePageTitle("项目");

  const [researchQuestion, setResearchQuestion] = useState("");
  const [goal, setGoal] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingQuestion, setEditingQuestion] = useState("");
  const [editingGoal, setEditingGoal] = useState("");
  const [editingStatus, setEditingStatus] = useState<ResearchProjectListItem["status"]>("active");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: ({ signal }) => listProjects({ signal }),
  });

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
      navigate(projectPath(project.id));
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({ projectId, payload }: { projectId: number; payload: Parameters<typeof updateProject>[1] }) =>
      updateProject(projectId, payload),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: deleteProject,
  });

  const projects = projectsQuery.data ?? [];
  const loading = projectsQuery.isLoading;

  async function refreshProjects() {
    setError("");
    await projectsQuery.refetch();
  }

  async function handleCreateProject() {
    if (!researchQuestion.trim()) {
      setError("请先输入你想搞清楚的研究问题。");
      return;
    }

    setError("");
    setNotice("");
    try {
      await createProjectMutation.mutateAsync({
        research_question: researchQuestion.trim(),
        goal: goal.trim(),
      });
    } catch (createError) {
      setError((createError as Error).message || "创建项目失败，请稍后重试。");
    }
  }

  function beginProjectEdit(project: ResearchProjectListItem) {
    setEditingProjectId(project.id);
    setEditingTitle(project.title);
    setEditingQuestion(project.research_question);
    setEditingGoal(project.goal);
    setEditingStatus(project.status);
    setError("");
    setNotice("");
  }

  function cancelProjectEdit() {
    setEditingProjectId(null);
    setEditingTitle("");
    setEditingQuestion("");
    setEditingGoal("");
    setEditingStatus("active");
  }

  async function handleSaveProjectEdit(projectId: number) {
    if (!editingQuestion.trim()) {
      setError("研究问题不能为空。");
      return;
    }

    setError("");
    setNotice("");
    try {
      await updateProjectMutation.mutateAsync({
        projectId,
        payload: {
          title: editingTitle.trim(),
          research_question: editingQuestion.trim(),
          goal: editingGoal.trim(),
          status: editingStatus,
        },
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
      cancelProjectEdit();
      setNotice("项目已更新。");
    } catch (saveError) {
      setError((saveError as Error).message || "更新项目失败，请稍后重试。");
    }
  }

  async function handleDeleteProject(project: ResearchProjectListItem) {
    const shouldDelete = window.confirm(`确认删除项目“${project.title}”吗？项目下的论文关联、证据板和成果物也会一起删除。`);
    if (!shouldDelete) return;

    setError("");
    setNotice("");
    try {
      await deleteProjectMutation.mutateAsync(project.id);
      if (editingProjectId === project.id) {
        cancelProjectEdit();
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
      setNotice(`项目“${project.title}”已删除。`);
    } catch (deleteError) {
      setError((deleteError as Error).message || "删除项目失败，请稍后重试。");
    }
  }

  return (
    <>
      <Card className="projects-home-hero">
        <div className="projects-home-copy">
          <span className="projects-kicker">项目制研究工作台</span>
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
            <Button
              type="button"
              data-testid="create-project-button"
              onClick={() => void handleCreateProject()}
              disabled={createProjectMutation.isPending}
            >
              {createProjectMutation.isPending ? "正在创建项目..." : "创建项目并进入工作台"}
            </Button>
            <Button className="secondary" type="button" onClick={() => void refreshProjects()} disabled={projectsQuery.isFetching}>
              刷新项目列表
            </Button>
          </div>
        </div>
      </Card>

      <StatusStack
        items={[
          ...(projectsQuery.error ? [{ variant: "error" as const, message: (projectsQuery.error as Error).message || "加载项目失败。" }] : []),
          ...(error ? [{ variant: "error" as const, message: error }] : []),
          ...(notice ? [{ variant: "success" as const, message: notice }] : []),
        ]}
      />

      <Card>
        <div className="projects-section-header">
          <div>
            <h2 className="title">最近项目</h2>
            <p className="subtle" style={{ margin: "6px 0 0" }}>
              当前主入口已经切到项目工作台。旧的阅读、复现、心得、记忆仍然保留，但不再要求你先理解内部模块名。
            </p>
          </div>
        </div>

        {loading ? <Loading text="正在加载项目..." /> : null}

        {!loading && projects.length === 0 ? (
          <>
            <EmptyState
              title="还没有项目"
              hint="这里显示的是新的项目对象。先创建一个研究问题项目，后续的论文池、证据板、对比表和综述稿都会围绕这个项目展开。"
            />
            <div className="projects-empty-explainer" data-testid="projects-empty-explainer">
              <div className="subtle">当前项目首页只读取新的项目对象。</div>
              <div className="subtle">旧的阅读、心得、复现、记忆记录不会自动迁成项目，但原入口仍然保留。</div>
              <div className="projects-empty-links">
                <Link className="button secondary" to="/library">
                  打开文库
                </Link>
                <Link className="button secondary" to={reflectionsPath()}>
                  打开心得
                </Link>
                <Link className="button secondary" to={reproductionPath()}>
                  打开复现
                </Link>
                <Link className="button secondary" to={memoryPath()}>
                  打开记忆
                </Link>
                <Link className="button secondary" to="/settings">
                  查看设置
                </Link>
              </div>
            </div>
          </>
        ) : null}

        {!loading && projects.length > 0 ? (
          <div className="projects-list">
            {projects.map((project) => {
              const isEditing = editingProjectId === project.id;
              const isSaving = updateProjectMutation.isPending && editingProjectId === project.id;
              const isDeleting = deleteProjectMutation.isPending && deleteProjectMutation.variables === project.id;

              return (
                <article key={project.id} className="project-list-card">
                  <div className="project-list-card-head">
                    <strong>{project.title}</strong>
                    <span className={`project-status-badge status-${project.status}`.trim()}>{statusLabel(project.status)}</span>
                  </div>
                  <p className="project-list-question">{project.research_question}</p>
                  <div className="subtle">目标产出：{project.goal || "未填写"}</div>
                  <div className="project-list-stats">
                    <span className="project-stat-chip">论文 {project.paper_count}</span>
                    <span className="project-stat-chip">证据 {project.evidence_count}</span>
                    <span className="project-stat-chip">成果物 {project.output_count}</span>
                  </div>
                  <div className="subtle">最近打开：{formatDateTime(project.last_opened_at || project.updated_at)}</div>
                  <div className="projects-inline-actions">
                    <Button type="button" onClick={() => navigate(projectPath(project.id))}>
                      进入工作台
                    </Button>
                    <Button
                      className="secondary"
                      type="button"
                      onClick={() => beginProjectEdit(project)}
                      disabled={isSaving || isDeleting}
                    >
                      {isEditing ? "正在编辑" : "编辑"}
                    </Button>
                    <Button
                      className="secondary"
                      type="button"
                      onClick={() => void handleDeleteProject(project)}
                      disabled={isSaving || isDeleting}
                    >
                      {isDeleting ? "删除中..." : "删除"}
                    </Button>
                  </div>

                  {isEditing ? (
                    <div className="project-inline-editor">
                      <label className="projects-field">
                        <span>项目标题</span>
                        <input className="input" value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} />
                      </label>
                      <label className="projects-field">
                        <span>研究问题</span>
                        <textarea className="textarea" value={editingQuestion} onChange={(event) => setEditingQuestion(event.target.value)} />
                      </label>
                      <label className="projects-field">
                        <span>目标产出</span>
                        <input
                          className="input"
                          value={editingGoal}
                          onChange={(event) => setEditingGoal(event.target.value)}
                          placeholder="例如：产出一版综述稿"
                        />
                      </label>
                      <label className="projects-field">
                        <span>项目状态</span>
                        <select className="select" value={editingStatus} onChange={(event) => setEditingStatus(event.target.value)}>
                          <option value="active">进行中</option>
                          <option value="paused">已暂停</option>
                          <option value="archived">已归档</option>
                        </select>
                      </label>
                      <div className="projects-inline-actions">
                        <Button type="button" onClick={() => void handleSaveProjectEdit(project.id)} disabled={isSaving}>
                          {isSaving ? "保存中..." : "保存修改"}
                        </Button>
                        <Button className="secondary" type="button" onClick={cancelProjectEdit} disabled={isSaving}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </Card>
    </>
  );
}
