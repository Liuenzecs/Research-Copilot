from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.task_artifact_record import TaskArtifactRecord
from app.models.db.task_record import TaskRecord
from app.models.schemas.task import (
    TaskArtifactCreateRequest,
    TaskArtifactOut,
    TaskCreateRequest,
    TaskOut,
    TaskUpdateRequest,
)
from app.services.workflow.service import workflow_service

router = APIRouter(prefix='/tasks', tags=['tasks'])


def _task_out(row: TaskRecord) -> TaskOut:
    return TaskOut(
        id=row.id,
        task_type=row.task_type,
        status=row.status,
        trigger_source=row.trigger_source,
        input_json=json.loads(row.input_json or '{}'),
        output_json=json.loads(row.output_json or '{}'),
        error_log=row.error_log,
        started_at=row.started_at,
        finished_at=row.finished_at,
        archived_at=row.archived_at,
        archived_by=row.archived_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _artifact_out(row: TaskArtifactRecord) -> TaskArtifactOut:
    return TaskArtifactOut(
        id=row.id,
        task_id=row.task_id,
        artifact_type=row.artifact_type,
        artifact_ref_type=row.artifact_ref_type,
        artifact_ref_id=row.artifact_ref_id,
        role=row.role,
        snapshot_json=json.loads(row.snapshot_json or '{}'),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post('', response_model=TaskOut)
def create_task(payload: TaskCreateRequest, db: Session = Depends(get_db)) -> TaskOut:
    row = workflow_service.create_task(
        db,
        task_type=payload.task_type,
        trigger_source=payload.trigger_source,
        input_json=payload.input_json,
    )
    return _task_out(row)


@router.get('', response_model=list[TaskOut])
def list_tasks(
    include_archived: bool = Query(default=False),
    status: str | None = None,
    task_type: str | None = None,
    db: Session = Depends(get_db),
) -> list[TaskOut]:
    stmt = select(TaskRecord)
    if not include_archived:
        stmt = stmt.where(TaskRecord.archived_at.is_(None))
    if status:
        stmt = stmt.where(TaskRecord.status == status)
    if task_type:
        stmt = stmt.where(TaskRecord.task_type == task_type)
    stmt = stmt.order_by(TaskRecord.created_at.desc())
    rows = db.execute(stmt).scalars().all()
    return [_task_out(r) for r in rows]


@router.get('/{task_id}', response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)) -> TaskOut:
    row = db.get(TaskRecord, task_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Task not found')
    return _task_out(row)


@router.patch('/{task_id}', response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdateRequest, db: Session = Depends(get_db)) -> TaskOut:
    row = db.get(TaskRecord, task_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Task not found')

    row = workflow_service.update_task(
        db,
        row,
        status=payload.status,
        output_json=payload.output_json,
        error_log=payload.error_log,
        archived=payload.archived,
    )
    return _task_out(row)


@router.post('/{task_id}/artifacts', response_model=TaskArtifactOut)
def create_artifact(task_id: int, payload: TaskArtifactCreateRequest, db: Session = Depends(get_db)) -> TaskArtifactOut:
    if db.get(TaskRecord, task_id) is None:
        raise HTTPException(status_code=404, detail='Task not found')
    row = workflow_service.add_artifact(
        db,
        task_id=task_id,
        artifact_type=payload.artifact_type,
        artifact_ref_type=payload.artifact_ref_type,
        artifact_ref_id=payload.artifact_ref_id,
        role=payload.role,
        snapshot_json=payload.snapshot_json,
    )
    return _artifact_out(row)


@router.get('/{task_id}/artifacts', response_model=list[TaskArtifactOut])
def list_artifacts(task_id: int, db: Session = Depends(get_db)) -> list[TaskArtifactOut]:
    rows = (
        db.execute(select(TaskArtifactRecord).where(TaskArtifactRecord.task_id == task_id).order_by(TaskArtifactRecord.created_at.asc()))
        .scalars()
        .all()
    )
    return [_artifact_out(r) for r in rows]
