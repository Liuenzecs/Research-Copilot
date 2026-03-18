from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.schemas.paper import PaperOut


class ResearchProjectCreateRequest(BaseModel):
    research_question: str
    goal: str = ''
    title: str = ''
    seed_query: str = ''


class ResearchProjectUpdateRequest(BaseModel):
    title: str | None = None
    research_question: str | None = None
    goal: str | None = None
    status: str | None = None
    seed_query: str | None = None


class ResearchProjectOut(BaseModel):
    id: int
    title: str
    research_question: str
    goal: str
    status: str
    seed_query: str
    last_opened_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ResearchProjectListItemOut(ResearchProjectOut):
    paper_count: int = 0
    evidence_count: int = 0
    output_count: int = 0


class ResearchProjectPaperAddRequest(BaseModel):
    paper_id: int
    selection_reason: str = ''


class ResearchProjectPaperOut(BaseModel):
    id: int
    project_id: int
    paper: PaperOut
    sort_order: int
    pinned: bool
    selection_reason: str
    is_downloaded: bool
    summary_count: int = 0
    reflection_count: int = 0
    reproduction_count: int = 0
    latest_summary_id: int | None = None
    latest_reflection_id: int | None = None
    latest_reproduction_id: int | None = None
    latest_reproduction_status: str = ''
    created_at: datetime
    updated_at: datetime


class ResearchProjectEvidenceCreateRequest(BaseModel):
    paper_id: int | None = None
    summary_id: int | None = None
    paragraph_id: int | None = None
    kind: str = 'claim'
    excerpt: str
    note_text: str = ''
    source_label: str = ''
    sort_order: int | None = None


class ResearchProjectEvidenceUpdateRequest(BaseModel):
    kind: str | None = None
    excerpt: str | None = None
    note_text: str | None = None
    source_label: str | None = None
    sort_order: int | None = None


class ResearchProjectEvidenceReorderRequest(BaseModel):
    evidence_ids: list[int] = Field(default_factory=list)


class ResearchProjectEvidenceOut(BaseModel):
    id: int
    project_id: int
    paper_id: int | None
    paper_title: str | None = None
    summary_id: int | None
    paragraph_id: int | None
    kind: str
    excerpt: str
    note_text: str
    source_label: str
    sort_order: int
    created_at: datetime
    updated_at: datetime


class ResearchProjectOutputOut(BaseModel):
    id: int
    project_id: int
    output_type: str
    title: str
    content_json: dict[str, Any] = Field(default_factory=dict)
    content_markdown: str = ''
    status: str
    created_at: datetime
    updated_at: datetime


class ResearchProjectOutputUpdateRequest(BaseModel):
    title: str | None = None
    content_json: dict[str, Any] | None = None
    content_markdown: str | None = None
    status: str | None = None


class ResearchProjectActionRequest(BaseModel):
    paper_ids: list[int] = Field(default_factory=list)
    instruction: str = ''


class ResearchProjectTaskProgressStepOut(BaseModel):
    step_key: str
    label: str
    status: str
    message: str
    related_paper_ids: list[int] = Field(default_factory=list)
    created_at: datetime | None = None


class ResearchProjectTaskOut(BaseModel):
    id: int
    task_type: str
    status: str
    created_at: datetime
    updated_at: datetime
    progress_steps: list[ResearchProjectTaskProgressStepOut] = Field(default_factory=list)


class ResearchProjectTaskDetailOut(ResearchProjectTaskOut):
    input_json: dict[str, Any] = Field(default_factory=dict)
    output_json: dict[str, Any] = Field(default_factory=dict)
    error_log: str = ''


class ProjectActionLaunchResponse(BaseModel):
    task: ResearchProjectTaskDetailOut
    detail_url: str
    stream_url: str


class LinkedSummaryArtifactOut(BaseModel):
    id: int
    summary_type: str
    provider: str = ''
    model: str = ''
    created_at: datetime


class LinkedReflectionArtifactOut(BaseModel):
    id: int
    stage: str
    lifecycle_status: str
    report_summary: str = ''
    event_date: date | None = None
    created_at: datetime


class LinkedReproductionArtifactOut(BaseModel):
    id: int
    status: str
    progress_summary: str = ''
    progress_percent: float | None = None
    updated_at: datetime


class ResearchProjectLinkedArtifactsOut(BaseModel):
    paper_id: int
    paper_title: str
    summaries: list[LinkedSummaryArtifactOut] = Field(default_factory=list)
    reflections: list[LinkedReflectionArtifactOut] = Field(default_factory=list)
    reproductions: list[LinkedReproductionArtifactOut] = Field(default_factory=list)


class ResearchProjectWorkspaceResponse(BaseModel):
    project: ResearchProjectOut
    papers: list[ResearchProjectPaperOut] = Field(default_factory=list)
    evidence_items: list[ResearchProjectEvidenceOut] = Field(default_factory=list)
    outputs: list[ResearchProjectOutputOut] = Field(default_factory=list)
    recent_tasks: list[ResearchProjectTaskOut] = Field(default_factory=list)
    linked_existing_artifacts: list[ResearchProjectLinkedArtifactsOut] = Field(default_factory=list)


class ResearchProjectEvidenceReorderResponse(BaseModel):
    items: list[ResearchProjectEvidenceOut] = Field(default_factory=list)
