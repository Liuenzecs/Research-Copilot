import { Link } from "react-router-dom";

import { reflectionLifecycleLabel, reflectionStageLabel, reflectionTypeLabel } from "@/lib/presentation";
import { paperReaderPath, reproductionPath } from "@/lib/routes";
import { Reflection } from "@/lib/types";

function chip(label: string) {
  return (
    <span style={{ border: "1px solid #d1d5db", borderRadius: 999, padding: "2px 8px", fontSize: 12 }}>
      {label}
    </span>
  );
}

export default function ReflectionCard({
  reflection,
  highlighted = false,
  projectId = null,
}: {
  reflection: Reflection;
  highlighted?: boolean;
  projectId?: number | null;
}) {
  const stageLabel = reflectionStageLabel(reflection.stage);
  const structuredPreview = Object.values(reflection.content_structured_json || {}).find((value) => value.trim());
  const previewText = reflection.report_summary || reflection.content_markdown?.slice(0, 120) || structuredPreview || "暂无摘要";

  return (
    <article
      className="card"
      style={{
        border: highlighted ? "1px solid #0f766e" : undefined,
        background: highlighted ? "#f0fdf4" : undefined,
      }}
    >
      <h4 style={{ margin: 0 }}>{reflectionTypeLabel(reflection.reflection_type)}</h4>
      <p className="subtle">
        {reflection.event_date} · {reflectionLifecycleLabel(reflection.lifecycle_status)} · {stageLabel}
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {reflection.related_paper_id ? (
          <Link to={paperReaderPath(reflection.related_paper_id, undefined, undefined, projectId)} style={{ textDecoration: "none" }}>
            {chip("打开论文工作区")}
          </Link>
        ) : null}
        {reflection.related_summary_id && reflection.related_paper_id ? (
          <Link to={paperReaderPath(reflection.related_paper_id, reflection.related_summary_id, undefined, projectId)} style={{ textDecoration: "none" }}>
            {chip("定位到关联摘要")}
          </Link>
        ) : reflection.related_summary_id ? (
          chip("已关联摘要")
        ) : null}
        {reflection.related_reproduction_id ? (
          <Link to={reproductionPath({ reproductionId: reflection.related_reproduction_id, projectId })} style={{ textDecoration: "none" }}>
            {chip("打开复现工作区")}
          </Link>
        ) : null}
        {reflection.related_task_id ? chip("已关联任务") : null}
      </div>
      <p style={{ whiteSpace: "pre-wrap" }}>{previewText}</p>
      {reflection.is_report_worthy ? <p className="subtle">建议汇报给导师</p> : null}
    </article>
  );
}
