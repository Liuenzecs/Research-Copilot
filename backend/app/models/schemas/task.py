from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TaskCreateRequest(BaseModel):
    task_type: str
    trigger_source: str = 'api'
    input_json: dict[str, Any] = Field(default_factory=dict)


class TaskUpdateRequest(BaseModel):
    status: str | None = None
    output_json: dict[str, Any] | None = None
    error_log: str | None = None
    archived: bool | None = None


class TaskOut(BaseModel):
    id: int
    task_type: str
    status: str
    trigger_source: str
    input_json: dict[str, Any]
    output_json: dict[str, Any]
    error_log: str
    started_at: datetime | None
    finished_at: datetime | None
    archived_at: datetime | None
    archived_by: str
    created_at: datetime
    updated_at: datetime


class TaskArtifactCreateRequest(BaseModel):
    artifact_type: str
    artifact_ref_type: str = ''
    artifact_ref_id: int | None = None
    role: str = 'output'
    snapshot_json: dict[str, Any] = Field(default_factory=dict)


class TaskArtifactOut(BaseModel):
    id: int
    task_id: int
    artifact_type: str
    artifact_ref_type: str
    artifact_ref_id: int | None
    role: str
    snapshot_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime
