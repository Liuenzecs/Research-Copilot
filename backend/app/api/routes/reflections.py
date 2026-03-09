from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.reflection_record import ReflectionRecord
from app.models.schemas.reflection import (
    ReflectionCreateRequest,
    ReflectionOut,
    ReflectionTimelineItem,
    ReflectionUpdateRequest,
)
from app.services.reflection.service import reflection_service
from app.services.workflow.service import workflow_service

router = APIRouter(prefix='/reflections', tags=['reflections'])


def to_out(row: ReflectionRecord) -> ReflectionOut:
    return ReflectionOut(
        id=row.id,
        reflection_type=row.reflection_type,
        related_paper_id=row.related_paper_id,
        related_repo_id=row.related_repo_id,
        related_reproduction_id=row.related_reproduction_id,
        related_task_id=row.related_task_id,
        template_type=row.template_type,
        stage=row.stage,
        lifecycle_status=row.lifecycle_status,
        content_structured_json=json.loads(row.content_structured_json or '{}'),
        content_markdown=row.content_markdown,
        is_report_worthy=row.is_report_worthy,
        report_summary=row.report_summary,
        event_date=row.event_date,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post('', response_model=ReflectionOut)
def create_reflection(payload: ReflectionCreateRequest, db: Session = Depends(get_db)) -> ReflectionOut:
    task = workflow_service.create_task(db, task_type='reflection_create', input_json=payload.model_dump(mode='json'), status='running')
    row = reflection_service.create(
        db,
        reflection_type=payload.reflection_type,
        related_paper_id=payload.related_paper_id,
        related_repo_id=payload.related_repo_id,
        related_reproduction_id=payload.related_reproduction_id,
        related_task_id=payload.related_task_id,
        template_type=payload.template_type,
        stage=payload.stage,
        lifecycle_status=payload.lifecycle_status,
        content_structured_json=payload.content_structured_json,
        content_markdown=payload.content_markdown,
        is_report_worthy=payload.is_report_worthy,
        report_summary=payload.report_summary,
        event_date=payload.event_date,
    )
    workflow_service.update_task(db, task, status='completed', output_json={'reflection_id': row.id})
    return to_out(row)


@router.patch('/{reflection_id}', response_model=ReflectionOut)
def update_reflection(reflection_id: int, payload: ReflectionUpdateRequest, db: Session = Depends(get_db)) -> ReflectionOut:
    row = db.get(ReflectionRecord, reflection_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Reflection not found')
    updated = reflection_service.update(db, row, **payload.model_dump(exclude_none=True))
    return to_out(updated)


@router.get('/timeline', response_model=list[ReflectionTimelineItem])
def timeline(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[ReflectionTimelineItem]:
    items = reflection_service.timeline(db, date_from=date_from, date_to=date_to)
    output: list[ReflectionTimelineItem] = []
    for item in items:
        reflection = db.get(ReflectionRecord, item['id'])
        if reflection is None:
            continue
        task_data = item.get('task')
        output.append(
            ReflectionTimelineItem(
                reflection=to_out(reflection),
                task_type=(task_data or {}).get('task_type'),
                task_status=(task_data or {}).get('status'),
            )
        )
    return output


@router.get('', response_model=list[ReflectionOut])
def list_reflections(
    reflection_type: str | None = None,
    lifecycle_status: str | None = None,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    related_paper_id: int | None = None,
    related_repo_id: int | None = None,
    related_reproduction_id: int | None = None,
    related_task_id: int | None = None,
    db: Session = Depends(get_db),
) -> list[ReflectionOut]:
    rows = reflection_service.list(
        db,
        reflection_type=reflection_type,
        lifecycle_status=lifecycle_status,
        date_from=date_from,
        date_to=date_to,
        related_paper_id=related_paper_id,
        related_repo_id=related_repo_id,
        related_reproduction_id=related_reproduction_id,
        related_task_id=related_task_id,
    )
    return [to_out(r) for r in rows]


@router.get('/{reflection_id}', response_model=ReflectionOut)
def get_reflection(reflection_id: int, db: Session = Depends(get_db)) -> ReflectionOut:
    row = db.get(ReflectionRecord, reflection_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Reflection not found')
    return to_out(row)
