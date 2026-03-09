from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class WeeklyReportContextResponse(BaseModel):
    week_start: date
    week_end: date
    report_worthy_reflections: list[dict[str, Any]]
    recent_papers: list[dict[str, Any]]
    reproduction_progress: list[dict[str, Any]]
    blockers: list[dict[str, Any]]
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
    source_snapshot_json: dict[str, Any]
    generated_task_id: int | None
    created_at: datetime
    updated_at: datetime
