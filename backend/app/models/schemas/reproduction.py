from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.schemas.repo import RepoOut


class ReproductionPlanRequest(BaseModel):
    paper_id: int | None = None
    repo_id: int | None = None


class ReproductionExecuteRequest(BaseModel):
    reproduction_id: int


class ReproductionStepOut(BaseModel):
    id: int
    step_no: int
    command: str
    purpose: str
    risk_level: str
    step_status: str
    progress_note: str
    blocker_reason: str
    blocked_at: datetime | None = None
    resolved_at: datetime | None = None
    requires_manual_confirm: bool
    expected_output: str
    safe: bool = True
    safety_reason: str = ''


class ReproductionPlanResponse(BaseModel):
    reproduction_id: int
    status: str
    plan_markdown: str
    progress_summary: str
    progress_percent: float | None = None
    steps: list[ReproductionStepOut]


class ReproductionLogOut(BaseModel):
    id: int
    reproduction_id: int
    step_id: int | None = None
    log_text: str
    error_type: str
    next_step_suggestion: str
    created_at: datetime


class ReproductionDetailResponse(ReproductionPlanResponse):
    paper_id: int | None = None
    repo_id: int | None = None
    repo: RepoOut | None = None
    logs: list[ReproductionLogOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ReproductionListItemOut(BaseModel):
    reproduction_id: int
    paper_id: int | None = None
    repo_id: int | None = None
    status: str
    progress_summary: str
    progress_percent: float | None = None
    updated_at: datetime


class ReproductionUpdateRequest(BaseModel):
    status: str | None = None
    progress_summary: str | None = None
    progress_percent: float | None = Field(default=None, ge=0, le=100)


class ReproductionStepUpdateRequest(BaseModel):
    step_status: str | None = None
    progress_note: str | None = None
    blocker_reason: str | None = None


class ReproductionStepLogCreateRequest(BaseModel):
    log_text: str = Field(min_length=1)
    log_kind: Literal['note', 'blocker'] = 'note'


class ReproductionExecuteResponse(BaseModel):
    reproduction_id: int
    executed: bool
    message: str
