import { formatDateTime, taskStatusLabel, taskTypeLabel } from "@/lib/presentation";
import type { ResearchProjectTaskDetail, ResearchProjectTaskProgressStep } from "@/lib/types";

const CURATION_STAGE_ORDER = [
  "planning_queries",
  "collecting_candidates",
  "deduping_and_filtering",
  "reranking_candidates",
  "building_preview",
  "saving_preview",
] as const;

const CURATION_STAGE_LABELS: Record<(typeof CURATION_STAGE_ORDER)[number], string> = {
  planning_queries: "规划检索",
  collecting_candidates: "收集候选",
  deduping_and_filtering: "去重过滤",
  reranking_candidates: "重排入选",
  building_preview: "构建预览",
  saving_preview: "保存预览",
};

function stepTime(step?: ResearchProjectTaskProgressStep | null) {
  if (!step?.created_at) return 0;
  const parsed = new Date(step.created_at);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function progressText(step: ResearchProjectTaskProgressStep) {
  const current = step.progress_current ?? null;
  const total = step.progress_total ?? null;
  if (current === null || total === null) return null;
  switch (step.step_key) {
    case "planning_queries":
      return `已规划查询 ${current}/${total}`;
    case "collecting_candidates":
      return `已收集候选 ${current}/${total}`;
    case "deduping_and_filtering":
      return `保留候选 ${current}/${total}`;
    case "reranking_candidates":
      return `已锁定入选 ${current}/${total}`;
    case "building_preview":
      return `已写入预览 ${current}/${total}`;
    case "saving_preview":
      return `已保存预览 ${current}/${total}`;
    default:
      return `${current}/${total}`;
  }
}

function progressSecondary(step: ResearchProjectTaskProgressStep) {
  const meta = (step.progress_meta ?? {}) as Record<string, unknown>;
  if (step.step_key === "collecting_candidates") {
    const completedQueries = typeof meta.completed_queries === "number" ? meta.completed_queries : null;
    const totalQueries = typeof meta.total_queries === "number" ? meta.total_queries : null;
    if (completedQueries !== null && totalQueries !== null) {
      return `已完成检索式 ${completedQueries}/${totalQueries}`;
    }
  }
  if (step.step_key === "saving_preview") {
    const missingSeeds = Array.isArray(meta.missing_seed_titles) ? meta.missing_seed_titles.length : 0;
    if (missingSeeds > 0) {
      return `缺失经典种子 ${missingSeeds}`;
    }
  }
  return null;
}

function normalizePercent(step: ResearchProjectTaskProgressStep) {
  if (typeof step.progress_percent === "number") {
    return Math.max(0, Math.min(100, step.progress_percent));
  }
  if (typeof step.progress_current === "number" && typeof step.progress_total === "number" && step.progress_total > 0) {
    return Math.max(0, Math.min(100, (step.progress_current / step.progress_total) * 100));
  }
  return null;
}

function activeCurationStep(task: ResearchProjectTaskDetail, stepsByKey: Map<string, ResearchProjectTaskProgressStep>) {
  const ordered = CURATION_STAGE_ORDER.map((key) => stepsByKey.get(key)).filter(Boolean) as ResearchProjectTaskProgressStep[];
  const failed = ordered.find((step) => step.status === "failed");
  if (failed) return failed;
  const running = ordered.find((step) => step.status === "running");
  if (running) return running;
  const latest = [...ordered].sort((left, right) => stepTime(right) - stepTime(left))[0];
  if (latest) return latest;
  return null;
}

function activeGenericStep(task: ResearchProjectTaskDetail) {
  if (!task.progress_steps.length) return null;
  return [...task.progress_steps].sort((left, right) => stepTime(right) - stepTime(left))[0];
}

export function mergeProjectTaskStep(task: ResearchProjectTaskDetail, step: ResearchProjectTaskProgressStep) {
  const nextSteps = [...task.progress_steps];
  const existingIndex = nextSteps.findIndex((item) => item.step_key === step.step_key);
  if (existingIndex >= 0) nextSteps[existingIndex] = step;
  else nextSteps.push(step);
  nextSteps.sort((left, right) => stepTime(left) - stepTime(right));
  return { ...task, progress_steps: nextSteps };
}

export default function ProjectTaskProgressPanel({
  task,
  emptyTitle = "暂无任务进度",
  emptyHint = "任务启动后，这里会显示当前阶段与实时进度。",
}: {
  task: ResearchProjectTaskDetail | null;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (!task) {
    return (
      <div className="project-progress-panel is-empty">
        <strong>{emptyTitle}</strong>
        <div className="subtle">{emptyHint}</div>
      </div>
    );
  }

  const stepsByKey = new Map(task.progress_steps.map((step) => [step.step_key, step]));
  const isCurationTask = task.task_type === "project_curate_reading_list";
  const currentStep = isCurationTask ? activeCurationStep(task, stepsByKey) : activeGenericStep(task);
  const percent = currentStep ? normalizePercent(currentStep) : null;
  const progressLabel = currentStep ? progressText(currentStep) : null;
  const secondaryLabel = currentStep ? progressSecondary(currentStep) : null;

  return (
    <div className="project-progress-panel" data-testid="task-progress-panel">
      <div className="project-progress-summary">
        <strong>{taskTypeLabel(task.task_type)}</strong>
        <span className="subtle">{taskStatusLabel(task.status)}</span>
        <span className="subtle">{formatDateTime(task.updated_at, "刚刚")}</span>
      </div>

      {isCurationTask ? (
        <div className="project-progress-stage-strip">
          {CURATION_STAGE_ORDER.map((key) => {
            const step = stepsByKey.get(key);
            const status = step?.status ?? "pending";
            const isActive = currentStep?.step_key === key;
            return (
              <div
                key={key}
                className={`project-progress-stage-pill status-${status}${isActive ? " is-active" : ""}`.trim()}
              >
                <span>{step?.label || CURATION_STAGE_LABELS[key]}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {currentStep ? (
        <div className="project-progress-current">
          <div className="project-progress-step-head">
            <strong>{currentStep.label}</strong>
            <span className={`project-step-status status-${currentStep.status}`.trim()}>
              {taskStatusLabel(currentStep.status)}
            </span>
          </div>
          {percent !== null ? (
            <>
              <div className="project-progress-meter" aria-hidden="true">
                <div className="project-progress-meter-fill" style={{ width: `${percent}%` }} />
              </div>
              <div className="project-progress-metrics">
                {progressLabel ? <strong>{progressLabel}</strong> : null}
                {secondaryLabel ? <span className="subtle">{secondaryLabel}</span> : null}
              </div>
            </>
          ) : null}
          {currentStep.message ? <div className="subtle">{currentStep.message}</div> : null}
          {currentStep.related_paper_ids.length > 0 ? (
            <div className="subtle">相关论文：{currentStep.related_paper_ids.join(", ")}</div>
          ) : null}
        </div>
      ) : null}

      {!isCurationTask && task.progress_steps.length > 0 ? (
        <div className="project-progress-step-list">
          {task.progress_steps.map((step) => (
            <div key={`${task.id}-${step.step_key}`} className="project-progress-step">
              <div className="project-progress-step-head">
                <strong>{step.label}</strong>
                <span className={`project-step-status status-${step.status}`.trim()}>
                  {taskStatusLabel(step.status)}
                </span>
              </div>
              {step.message ? <div className="subtle">{step.message}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {task.error_log ? <div className="subtle">错误：{task.error_log}</div> : null}
    </div>
  );
}
