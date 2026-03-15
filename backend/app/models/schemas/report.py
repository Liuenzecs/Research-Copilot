from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class WeeklyReportReflectionItem(BaseModel):
    id: int
    event_date: date
    reflection_type: str
    report_summary: str
    related_paper_id: int | None = None
    related_paper_title: str | None = None
    related_reproduction_id: int | None = None
    related_task_id: int | None = None


class WeeklyReportPaperActivityItem(BaseModel):
    paper_id: int
    title_en: str
    source: str
    year: int | None = None
    last_activity_at: datetime
    activity_type: str
    activity_summary: str


class WeeklyReportReproductionItem(BaseModel):
    reproduction_id: int
    paper_id: int | None = None
    paper_title: str | None = None
    repo_id: int | None = None
    repo_label: str
    status: str
    progress_percent: float | None = None
    progress_summary: str
    updated_at: datetime


class WeeklyReportBlockerItem(BaseModel):
    reproduction_id: int
    paper_id: int | None = None
    paper_title: str | None = None
    step_id: int
    step_no: int
    command: str
    blocker_reason: str
    blocked_at: datetime | None = None


class WeeklyReportContextResponse(BaseModel):
    week_start: date
    week_end: date
    report_worthy_reflections: list[WeeklyReportReflectionItem]
    recent_papers: list[WeeklyReportPaperActivityItem]
    reproduction_progress: list[WeeklyReportReproductionItem]
    blockers: list[WeeklyReportBlockerItem]
    next_actions: list[str]


class WeeklyReportDraftCreateRequest(BaseModel):
    week_start: date
    week_end: date
    title: str | None = None


class WeeklyReportDraftUpdateRequest(BaseModel):
    draft_markdown: str | None = None
    status: str | None = None
    title: str | None = None


class WeeklyReportOut(BaseModel):
    id: int
    week_start: date
    week_end: date
    title: str
    draft_markdown: str
    status: str
    source_snapshot_json: dict[str, Any] = Field(default_factory=dict)
    generated_task_id: int | None
    created_at: datetime
    updated_at: datetime
