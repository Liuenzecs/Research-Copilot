from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.weekly_report_record import WeeklyReportRecord
from app.models.schemas.report import (
    WeeklyReportContextResponse,
    WeeklyReportDraftCreateRequest,
    WeeklyReportDraftUpdateRequest,
    WeeklyReportOut,
)
from app.services.reporting.service import reporting_service
from app.services.workflow.service import workflow_service

router = APIRouter(prefix='/reports', tags=['reports'])


def to_report_out(row: WeeklyReportRecord) -> WeeklyReportOut:
    return WeeklyReportOut(
        id=row.id,
        week_start=row.week_start,
        week_end=row.week_end,
        title=row.title,
        draft_markdown=row.draft_markdown,
        status=row.status,
        source_snapshot_json=json.loads(row.source_snapshot_json or '{}'),
        generated_task_id=row.generated_task_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get('/weekly/context', response_model=WeeklyReportContextResponse)
def weekly_context(
    week_start: date | None = Query(default=None),
    week_end: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> WeeklyReportContextResponse:
    if week_start is None or week_end is None:
        week_start, week_end = reporting_service.default_week_range()
    context = reporting_service.get_context(db, week_start=week_start, week_end=week_end)
    return WeeklyReportContextResponse(**context)


@router.post('/weekly/drafts', response_model=WeeklyReportOut)
def create_weekly_draft(payload: WeeklyReportDraftCreateRequest, db: Session = Depends(get_db)) -> WeeklyReportOut:
    task = workflow_service.create_task(
        db,
        task_type='weekly_report_generate',
        input_json=payload.model_dump(mode='json'),
        status='running',
    )
    row = reporting_service.create_draft(
        db,
        week_start=payload.week_start,
        week_end=payload.week_end,
        title=payload.title or f"周报草稿 {payload.week_start}~{payload.week_end}",
        generated_task_id=task.id,
    )
    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='weekly_report',
        artifact_ref_type='weekly_reports',
        artifact_ref_id=row.id,
        snapshot_json={'week_start': row.week_start.isoformat(), 'week_end': row.week_end.isoformat()},
    )
    workflow_service.update_task(db, task, status='completed', output_json={'weekly_report_id': row.id})
    return to_report_out(row)


@router.get('/weekly/drafts', response_model=list[WeeklyReportOut])
def list_weekly_drafts(status: str | None = None, db: Session = Depends(get_db)) -> list[WeeklyReportOut]:
    rows = reporting_service.list_drafts(db, status=status)
    return [to_report_out(row) for row in rows]


@router.get('/weekly/drafts/{draft_id}', response_model=WeeklyReportOut)
def get_weekly_draft(draft_id: int, db: Session = Depends(get_db)) -> WeeklyReportOut:
    row = db.get(WeeklyReportRecord, draft_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Weekly report draft not found')
    return to_report_out(row)


@router.patch('/weekly/drafts/{draft_id}', response_model=WeeklyReportOut)
def update_weekly_draft(draft_id: int, payload: WeeklyReportDraftUpdateRequest, db: Session = Depends(get_db)) -> WeeklyReportOut:
    row = db.get(WeeklyReportRecord, draft_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Weekly report draft not found')
    row = reporting_service.update_draft(
        db,
        row,
        title=payload.title,
        draft_markdown=payload.draft_markdown,
        status=payload.status,
    )
    return to_report_out(row)
