from __future__ import annotations

import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.paper_record import PaperRecord
from app.models.db.repo_record import RepoRecord
from app.models.db.reproduction_record import ReproductionRecord, ReproductionStepRecord
from app.models.db.task_artifact_record import TaskArtifactRecord
from app.models.schemas.reproduction import (
    ReproductionDetailResponse,
    ReproductionExecuteRequest,
    ReproductionExecuteResponse,
    ReproductionListItemOut,
    ReproductionPlanRequest,
    ReproductionPlanResponse,
    ReproductionStepOut,
    ReproductionStepUpdateRequest,
    ReproductionUpdateRequest,
)
from app.services.memory.service import memory_service
from app.services.reflection.service import reflection_service
from app.services.reproduction.executor import reproduction_executor
from app.services.reproduction.planner import reproduction_planner
from app.services.reproduction.safety import assess_commands
from app.services.workflow.service import workflow_service

router = APIRouter(prefix='/reproduction', tags=['reproduction'])


def _step_out(step: ReproductionStepRecord, safe: bool = True, safety_reason: str = '') -> ReproductionStepOut:
    return ReproductionStepOut(
        id=step.id,
        step_no=step.step_no,
        command=step.command,
        purpose=step.purpose,
        risk_level=step.risk_level,
        step_status=step.step_status,
        progress_note=step.progress_note,
        blocker_reason=step.blocker_reason,
        blocked_at=step.blocked_at,
        resolved_at=step.resolved_at,
        requires_manual_confirm=step.requires_manual_confirm,
        expected_output=step.expected_output,
        safe=safe,
        safety_reason=safety_reason,
    )


def _repro_or_404(db: Session, reproduction_id: int) -> ReproductionRecord:
    row = db.get(ReproductionRecord, reproduction_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Reproduction not found')
    return row


def _load_steps(db: Session, reproduction_id: int) -> list[ReproductionStepRecord]:
    return (
        db.execute(
            select(ReproductionStepRecord)
            .where(ReproductionStepRecord.reproduction_id == reproduction_id)
            .order_by(ReproductionStepRecord.step_no.asc())
        )
        .scalars()
        .all()
    )


def _reproduction_list_item(repro: ReproductionRecord) -> ReproductionListItemOut:
    return ReproductionListItemOut(
        reproduction_id=repro.id,
        paper_id=repro.paper_id,
        repo_id=repro.repo_id,
        status=repro.status,
        progress_summary=repro.progress_summary,
        progress_percent=repro.progress_percent,
        updated_at=repro.updated_at,
    )


def _reproduction_detail(db: Session, repro: ReproductionRecord) -> ReproductionDetailResponse:
    steps = _load_steps(db, repro.id)
    assessments = assess_commands([step.command for step in steps])
    out_steps = [_step_out(step, safe=assessments[idx]['allowed'], safety_reason=assessments[idx]['reason']) for idx, step in enumerate(steps)]

    return ReproductionDetailResponse(
        reproduction_id=repro.id,
        paper_id=repro.paper_id,
        repo_id=repro.repo_id,
        status=repro.status,
        plan_markdown=repro.plan_markdown,
        progress_summary=repro.progress_summary,
        progress_percent=repro.progress_percent,
        steps=out_steps,
        created_at=repro.created_at,
        updated_at=repro.updated_at,
    )


def _resolve_reproduction_context(
    db: Session,
    payload: ReproductionPlanRequest,
) -> tuple[int | None, PaperRecord | None, RepoRecord | None]:
    if payload.paper_id is None and payload.repo_id is None:
        raise HTTPException(status_code=400, detail='paper_id or repo_id is required')

    paper = db.get(PaperRecord, payload.paper_id) if payload.paper_id is not None else None
    if payload.paper_id is not None and paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')

    repo = db.get(RepoRecord, payload.repo_id) if payload.repo_id is not None else None
    if payload.repo_id is not None and repo is None:
        raise HTTPException(status_code=404, detail='Repo not found')

    if repo is not None and paper is not None and repo.paper_id is not None and repo.paper_id != paper.id:
        raise HTTPException(status_code=400, detail='repo_id does not belong to paper_id')

    effective_paper_id = payload.paper_id
    if effective_paper_id is None and repo is not None and repo.paper_id is not None:
        effective_paper_id = repo.paper_id
        paper = db.get(PaperRecord, repo.paper_id)

    return effective_paper_id, paper, repo


def _build_plan_context(paper: PaperRecord | None, repo: RepoRecord | None) -> str:
    parts = [
        f'paper_id={paper.id if paper is not None else "null"}',
        f'paper_title={paper.title_en if paper is not None else ""}',
        f'repo_id={repo.id if repo is not None else "null"}',
        f'repo_url={repo.repo_url if repo is not None else ""}',
    ]
    if repo is not None:
        repo_name = '/'.join(part for part in [repo.owner, repo.name] if part)
        if repo_name:
            parts.append(f'repo_name={repo_name}')
    return ', '.join(parts)


@router.get('', response_model=list[ReproductionListItemOut])
def list_reproductions(
    paper_id: int | None = None,
    repo_id: int | None = None,
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> list[ReproductionListItemOut]:
    stmt = select(ReproductionRecord)
    if paper_id is not None:
        stmt = stmt.where(ReproductionRecord.paper_id == paper_id)
    if repo_id is not None:
        stmt = stmt.where(ReproductionRecord.repo_id == repo_id)

    rows = (
        db.execute(stmt.order_by(ReproductionRecord.updated_at.desc(), ReproductionRecord.id.desc()).limit(limit))
        .scalars()
        .all()
    )
    return [_reproduction_list_item(row) for row in rows]


@router.post('/plan', response_model=ReproductionPlanResponse)
async def plan_reproduction(payload: ReproductionPlanRequest, db: Session = Depends(get_db)) -> ReproductionPlanResponse:
    effective_paper_id, paper, repo = _resolve_reproduction_context(db, payload)
    task = workflow_service.create_task(db, task_type='reproduction_plan', input_json=payload.model_dump(), status='running')

    context = _build_plan_context(paper, repo)
    markdown, steps = await reproduction_planner.plan(context)

    repro = ReproductionRecord(
        paper_id=effective_paper_id,
        repo_id=repo.id if repo is not None else payload.repo_id,
        plan_markdown=markdown,
        progress_summary='已生成初始复现计划。',
        progress_percent=0,
        status='planned',
    )
    db.add(repro)
    db.commit()
    db.refresh(repro)

    commands = [step['command'] for step in steps]
    assessments = assess_commands(commands)
    final_steps: list[ReproductionStepOut] = []
    for idx, step in enumerate(steps):
        check = assessments[idx]
        row = ReproductionStepRecord(
            reproduction_id=repro.id,
            step_no=step['step_no'],
            command=step['command'],
            purpose=step['purpose'],
            risk_level=step['risk_level'],
            step_status='pending',
            progress_note='',
            blocker_reason='',
            requires_manual_confirm=True,
            expected_output=step['expected_output'],
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        final_steps.append(_step_out(row, safe=check['allowed'], safety_reason=check['reason']))

    memory_service.create_memory(
        db,
        memory_type='ReproMemory',
        layer='structured',
        text_content=markdown,
        ref_table='reproductions',
        ref_id=repro.id,
        importance=0.7,
    )

    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='reproduction_plan',
        artifact_ref_type='reproductions',
        artifact_ref_id=repro.id,
        snapshot_json={'steps': len(final_steps)},
    )
    workflow_service.update_task(db, task, status='completed', output_json={'reproduction_id': repro.id})

    return ReproductionPlanResponse(
        reproduction_id=repro.id,
        status=repro.status,
        plan_markdown=markdown,
        progress_summary=repro.progress_summary,
        progress_percent=repro.progress_percent,
        steps=final_steps,
    )


@router.get('/{reproduction_id}', response_model=ReproductionDetailResponse)
def get_reproduction_detail(reproduction_id: int, db: Session = Depends(get_db)) -> ReproductionDetailResponse:
    repro = _repro_or_404(db, reproduction_id)
    return _reproduction_detail(db, repro)


@router.patch('/{reproduction_id}', response_model=ReproductionDetailResponse)
def update_reproduction(
    reproduction_id: int,
    payload: ReproductionUpdateRequest,
    db: Session = Depends(get_db),
) -> ReproductionDetailResponse:
    repro = _repro_or_404(db, reproduction_id)
    if payload.status is not None:
        repro.status = payload.status
    if payload.progress_summary is not None:
        repro.progress_summary = payload.progress_summary
    if payload.progress_percent is not None:
        repro.progress_percent = payload.progress_percent

    db.add(repro)
    db.commit()
    db.refresh(repro)

    task = workflow_service.create_task(
        db,
        task_type='reproduction_update',
        input_json={'reproduction_id': reproduction_id, **payload.model_dump(exclude_none=True)},
        status='completed',
    )
    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='reproduction_status',
        artifact_ref_type='reproductions',
        artifact_ref_id=repro.id,
        snapshot_json=payload.model_dump(exclude_none=True),
    )

    return _reproduction_detail(db, repro)


@router.patch('/{reproduction_id}/steps/{step_id}', response_model=ReproductionStepOut)
def update_reproduction_step(
    reproduction_id: int,
    step_id: int,
    payload: ReproductionStepUpdateRequest,
    db: Session = Depends(get_db),
) -> ReproductionStepOut:
    repro = _repro_or_404(db, reproduction_id)
    step = db.get(ReproductionStepRecord, step_id)
    if step is None or step.reproduction_id != reproduction_id:
        raise HTTPException(status_code=404, detail='Reproduction step not found')

    now = datetime.now(timezone.utc)
    if payload.step_status is not None:
        previous = step.step_status
        step.step_status = payload.step_status
        if payload.step_status == 'blocked' and previous != 'blocked':
            step.blocked_at = now
        if previous == 'blocked' and payload.step_status != 'blocked':
            step.resolved_at = now

    if payload.progress_note is not None:
        step.progress_note = payload.progress_note
    if payload.blocker_reason is not None:
        step.blocker_reason = payload.blocker_reason

    repro.updated_at = now
    db.add(step)
    db.add(repro)
    db.commit()
    db.refresh(step)

    update_payload = payload.model_dump(exclude_none=True)
    task = workflow_service.create_task(
        db,
        task_type='reproduction_step_update',
        input_json={'reproduction_id': reproduction_id, 'step_id': step_id, **update_payload},
        status='completed',
    )
    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='reproduction_step',
        artifact_ref_type='reproduction_steps',
        artifact_ref_id=step.id,
        snapshot_json=update_payload,
    )

    check = assess_commands([step.command])[0]
    return _step_out(step, safe=check['allowed'], safety_reason=check['reason'])


@router.post('/{reproduction_id}/reflections')
def create_reproduction_reflection(
    reproduction_id: int,
    payload: dict,
    db: Session = Depends(get_db),
) -> dict:
    repro = _repro_or_404(db, reproduction_id)

    structured = payload.get('content_structured_json') or {
        'what_i_did_today': '',
        'current_result': '',
        'issues_encountered': '',
        'suspected_causes': '',
        'next_step': '',
        'worth_reporting_to_professor': '',
        'one_sentence_report_summary': '',
        'free_notes': '',
    }

    stage = payload.get('stage') or 'progress'
    lifecycle_status = payload.get('lifecycle_status') or 'draft'
    report_summary = payload.get('report_summary') or ''
    is_report_worthy = bool(payload.get('is_report_worthy', False))

    related_task_id = payload.get('related_task_id')
    if related_task_id is None:
        latest_task = (
            db.execute(
                select(TaskArtifactRecord)
                .where(TaskArtifactRecord.artifact_ref_type == 'reproductions')
                .where(TaskArtifactRecord.artifact_ref_id == reproduction_id)
                .order_by(TaskArtifactRecord.created_at.desc())
            )
            .scalars()
            .first()
        )
        related_task_id = latest_task.task_id if latest_task else None

    task = workflow_service.create_task(
        db,
        task_type='reproduction_reflection_create',
        input_json={'reproduction_id': reproduction_id, **payload},
        status='running',
    )

    reflection = reflection_service.create(
        db,
        reflection_type='reproduction',
        related_paper_id=repro.paper_id,
        related_repo_id=repro.repo_id,
        related_reproduction_id=reproduction_id,
        related_task_id=related_task_id,
        template_type='reproduction',
        stage=stage,
        lifecycle_status=lifecycle_status,
        content_structured_json=structured,
        content_markdown=payload.get('content_markdown') or '',
        is_report_worthy=is_report_worthy,
        report_summary=report_summary,
        event_date=date.fromisoformat(payload.get('event_date')) if payload.get('event_date') else date.today(),
    )

    repro.updated_at = datetime.now(timezone.utc)
    db.add(repro)
    db.commit()
    db.refresh(repro)

    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='reflection',
        artifact_ref_type='reflections',
        artifact_ref_id=reflection.id,
        snapshot_json={'related_reproduction_id': reproduction_id},
    )
    workflow_service.update_task(db, task, status='completed', output_json={'reflection_id': reflection.id})

    return {
        'id': reflection.id,
        'reflection_type': reflection.reflection_type,
        'related_reproduction_id': reflection.related_reproduction_id,
        'related_task_id': reflection.related_task_id,
        'stage': reflection.stage,
        'lifecycle_status': reflection.lifecycle_status,
        'report_summary': reflection.report_summary,
        'event_date': reflection.event_date,
    }


@router.post('/execute', response_model=ReproductionExecuteResponse)
def execute_reproduction(payload: ReproductionExecuteRequest, db: Session = Depends(get_db)) -> ReproductionExecuteResponse:
    task = workflow_service.create_task(db, task_type='reproduction_execute', input_json=payload.model_dump(), status='running')
    output = reproduction_executor.execute(payload.reproduction_id)
    workflow_service.update_task(db, task, status='completed', output_json=output)
    return ReproductionExecuteResponse(**output)
