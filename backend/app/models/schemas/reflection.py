from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class ReflectionCreateRequest(BaseModel):
    reflection_type: str
    related_paper_id: int | None = None
    related_summary_id: int | None = None
    related_repo_id: int | None = None
    related_reproduction_id: int | None = None
    related_task_id: int | None = None
    template_type: str
    stage: str
    lifecycle_status: str = 'draft'
    content_structured_json: dict[str, Any] = Field(default_factory=dict)
    content_markdown: str = ''
    is_report_worthy: bool = False
    report_summary: str = ''
    event_date: date


class ReflectionUpdateRequest(BaseModel):
    stage: str | None = None
    lifecycle_status: str | None = None
    content_structured_json: dict[str, Any] | None = None
    content_markdown: str | None = None
    is_report_worthy: bool | None = None
    report_summary: str | None = None
    related_task_id: int | None = None


class ReflectionOut(BaseModel):
    id: int
    reflection_type: str
    related_paper_id: int | None
    related_summary_id: int | None
    related_repo_id: int | None
    related_reproduction_id: int | None
    related_task_id: int | None
    template_type: str
    stage: str
    lifecycle_status: str
    content_structured_json: dict[str, Any]
    content_markdown: str
    is_report_worthy: bool
    report_summary: str
    event_date: date
    created_at: datetime
    updated_at: datetime


class ReflectionTimelineItem(BaseModel):
    reflection: ReflectionOut
    task_type: str | None = None
    task_status: str | None = None
