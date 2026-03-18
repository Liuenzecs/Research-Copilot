from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.session import SessionLocal
from app.models.db.research_project_record import ResearchProjectEvidenceItemRecord, ResearchProjectOutputRecord
from app.models.schemas.project import (
    ProjectActionLaunchResponse,
    ResearchProjectActionRequest,
    ResearchProjectCreateRequest,
    ResearchProjectEvidenceCreateRequest,
    ResearchProjectEvidenceOut,
    ResearchProjectEvidenceReorderRequest,
    ResearchProjectEvidenceReorderResponse,
    ResearchProjectEvidenceUpdateRequest,
    ResearchProjectListItemOut,
    ResearchProjectOut,
    ResearchProjectOutputOut,
    ResearchProjectOutputUpdateRequest,
    ResearchProjectPaperAddRequest,
    ResearchProjectPaperOut,
    ResearchProjectTaskDetailOut,
    ResearchProjectUpdateRequest,
    ResearchProjectWorkspaceResponse,
)
from app.services.project.runtime import project_task_runtime
from app.services.project.service import PROJECT_TERMINAL_TASK_STATUSES
from app.services.project.service import project_service

router = APIRouter(prefix='/projects', tags=['projects'])


def _project_or_404(db: Session, project_id: int):
    try:
        return project_service.get_or_404(db, project_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _project_task_or_404(db: Session, project_id: int, task_id: int) -> ResearchProjectTaskDetailOut:
    try:
        row = project_service.get_task_or_404(db, project_id, task_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return project_service.to_task_detail_out(db, row)


def _stream_line(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False) + '\n'


@router.post('', response_model=ResearchProjectOut)
def create_project(payload: ResearchProjectCreateRequest, db: Session = Depends(get_db)) -> ResearchProjectOut:
    try:
        row = project_service.create_project(
            db,
            research_question=payload.research_question,
            goal=payload.goal,
            title=payload.title,
            seed_query=payload.seed_query,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return project_service.to_project_out(row)


@router.get('', response_model=list[ResearchProjectListItemOut])
def list_projects(db: Session = Depends(get_db)) -> list[ResearchProjectListItemOut]:
    return project_service.list_project_list_items(db)


@router.get('/{project_id}', response_model=ResearchProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)) -> ResearchProjectOut:
    row = project_service.touch_project(db, _project_or_404(db, project_id))
    return project_service.to_project_out(row)


@router.patch('/{project_id}', response_model=ResearchProjectOut)
def update_project(project_id: int, payload: ResearchProjectUpdateRequest, db: Session = Depends(get_db)) -> ResearchProjectOut:
    row = project_service.update_project(db, _project_or_404(db, project_id), **payload.model_dump(exclude_none=True))
    return project_service.to_project_out(row)


@router.delete('/{project_id}', status_code=204, response_class=Response)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> Response:
    project = _project_or_404(db, project_id)
    try:
        project_service.delete_project(db, project)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get('/{project_id}/workspace', response_model=ResearchProjectWorkspaceResponse)
def get_project_workspace(project_id: int, db: Session = Depends(get_db)) -> ResearchProjectWorkspaceResponse:
    project = project_service.touch_project(db, _project_or_404(db, project_id))
    return project_service.build_workspace(db, project)


@router.post('/{project_id}/papers', response_model=ResearchProjectPaperOut)
def add_project_paper(
    project_id: int,
    payload: ResearchProjectPaperAddRequest,
    db: Session = Depends(get_db),
) -> ResearchProjectPaperOut:
    project = _project_or_404(db, project_id)
    try:
        row = project_service.add_paper(db, project=project, paper_id=payload.paper_id, selection_reason=payload.selection_reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return project_service._to_project_paper_out(db, row)


@router.delete('/{project_id}/papers/{project_paper_id}', status_code=204, response_class=Response)
def delete_project_paper(project_id: int, project_paper_id: int, db: Session = Depends(get_db)) -> Response:
    project = _project_or_404(db, project_id)
    try:
        project_service.remove_paper(db, project=project, project_paper_id=project_paper_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post('/{project_id}/evidence', response_model=ResearchProjectEvidenceOut)
def create_project_evidence(
    project_id: int,
    payload: ResearchProjectEvidenceCreateRequest,
    db: Session = Depends(get_db),
) -> ResearchProjectEvidenceOut:
    project = _project_or_404(db, project_id)
    try:
        row = project_service.create_evidence(
            db,
            project=project,
            paper_id=payload.paper_id,
            summary_id=payload.summary_id,
            paragraph_id=payload.paragraph_id,
            kind=payload.kind,
            excerpt=payload.excerpt,
            note_text=payload.note_text,
            source_label=payload.source_label,
            sort_order=payload.sort_order,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return project_service._to_evidence_out(row)


@router.patch('/{project_id}/evidence/reorder', response_model=ResearchProjectEvidenceReorderResponse)
def reorder_project_evidence(
    project_id: int,
    payload: ResearchProjectEvidenceReorderRequest,
    db: Session = Depends(get_db),
) -> ResearchProjectEvidenceReorderResponse:
    project = _project_or_404(db, project_id)
    try:
        rows = project_service.reorder_evidence(db, project=project, evidence_ids=payload.evidence_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ResearchProjectEvidenceReorderResponse(items=[project_service._to_evidence_out(row) for row in rows])


@router.patch('/{project_id}/evidence/{evidence_id}', response_model=ResearchProjectEvidenceOut)
def update_project_evidence(
    project_id: int,
    evidence_id: int,
    payload: ResearchProjectEvidenceUpdateRequest,
    db: Session = Depends(get_db),
) -> ResearchProjectEvidenceOut:
    _project_or_404(db, project_id)
    row = db.get(ResearchProjectEvidenceItemRecord, evidence_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(status_code=404, detail='Project evidence not found')
    try:
        row = project_service.update_evidence(db, row, **payload.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return project_service._to_evidence_out(row)


@router.delete('/{project_id}/evidence/{evidence_id}', status_code=204, response_class=Response)
def delete_project_evidence(project_id: int, evidence_id: int, db: Session = Depends(get_db)) -> Response:
    _project_or_404(db, project_id)
    row = db.get(ResearchProjectEvidenceItemRecord, evidence_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(status_code=404, detail='Project evidence not found')
    project_service.delete_evidence(db, row)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch('/{project_id}/outputs/{output_id}', response_model=ResearchProjectOutputOut)
def update_project_output(
    project_id: int,
    output_id: int,
    payload: ResearchProjectOutputUpdateRequest,
    db: Session = Depends(get_db),
) -> ResearchProjectOutputOut:
    _project_or_404(db, project_id)
    row = db.get(ResearchProjectOutputRecord, output_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(status_code=404, detail='Project output not found')
    row = project_service.update_output(db, row, **payload.model_dump(exclude_none=True))
    return project_service._to_output_out(row)


@router.get('/{project_id}/tasks/{task_id}', response_model=ResearchProjectTaskDetailOut)
def get_project_task(project_id: int, task_id: int, db: Session = Depends(get_db)) -> ResearchProjectTaskDetailOut:
    _project_or_404(db, project_id)
    return _project_task_or_404(db, project_id, task_id)


@router.get('/{project_id}/tasks/{task_id}/stream')
async def stream_project_task(project_id: int, task_id: int, db: Session = Depends(get_db)) -> StreamingResponse:
    _project_or_404(db, project_id)
    _project_task_or_404(db, project_id, task_id)

    async def event_stream() -> AsyncIterator[str]:
        started = False
        last_progress_artifact_id = 0
        last_heartbeat = monotonic()

        while True:
            with SessionLocal() as stream_db:
                try:
                    task_row = project_service.get_task_or_404(stream_db, project_id, task_id)
                except ValueError as exc:
                    yield _stream_line({'type': 'task_failed', 'message': str(exc)})
                    break

                task_detail = project_service.to_task_detail_out(stream_db, task_row)
                if not started:
                    yield _stream_line({'type': 'task_started', 'task': task_detail.model_dump(mode='json')})
                    started = True

                progress_rows = project_service.list_progress_artifacts(
                    stream_db,
                    task_id,
                    after_artifact_id=last_progress_artifact_id,
                )
                for progress_row in progress_rows:
                    snapshot = json.loads(progress_row.snapshot_json or '{}')
                    last_progress_artifact_id = progress_row.id
                    yield _stream_line(
                        {
                            'type': 'progress',
                            'task_id': task_id,
                            'event_id': progress_row.id,
                            'step': {
                                'step_key': str(snapshot.get('step_key') or ''),
                                'label': str(snapshot.get('label') or ''),
                                'status': str(snapshot.get('status') or ''),
                                'message': str(snapshot.get('message') or ''),
                                'related_paper_ids': [int(item) for item in snapshot.get('related_paper_ids', [])],
                                'created_at': progress_row.created_at.isoformat() if progress_row.created_at else None,
                            },
                        }
                    )

                if task_row.status in PROJECT_TERMINAL_TASK_STATUSES:
                    final_type = 'task_completed' if task_row.status == 'completed' else 'task_failed'
                    yield _stream_line({'type': final_type, 'task': task_detail.model_dump(mode='json')})
                    project = project_service.get_or_404(stream_db, project_id)
                    workspace = project_service.build_workspace(stream_db, project)
                    yield _stream_line({'type': 'workspace_refreshed', 'workspace': workspace.model_dump(mode='json')})
                    break

            if monotonic() - last_heartbeat >= 2.0:
                yield _stream_line({'type': 'heartbeat', 'task_id': task_id})
                last_heartbeat = monotonic()

            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type='application/x-ndjson')


@router.post('/{project_id}/actions/extract-evidence', response_model=ProjectActionLaunchResponse, status_code=status.HTTP_202_ACCEPTED)
async def extract_project_evidence(
    project_id: int,
    payload: ResearchProjectActionRequest,
    db: Session = Depends(get_db),
) -> ProjectActionLaunchResponse:
    project = _project_or_404(db, project_id)
    try:
        task = project_service.launch_action(
            db,
            project=project,
            action='extract_evidence',
            paper_ids=payload.paper_ids,
            instruction=payload.instruction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    project_task_runtime.launch(task.id, lambda: project_service.execute_task(task.id))
    return ProjectActionLaunchResponse(
        task=project_service.to_task_detail_out(db, task),
        detail_url=f'/projects/{project_id}/tasks/{task.id}',
        stream_url=f'/projects/{project_id}/tasks/{task.id}/stream',
    )


@router.post('/{project_id}/actions/generate-compare-table', response_model=ProjectActionLaunchResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_project_compare_table(
    project_id: int,
    payload: ResearchProjectActionRequest,
    db: Session = Depends(get_db),
) -> ProjectActionLaunchResponse:
    project = _project_or_404(db, project_id)
    try:
        task = project_service.launch_action(
            db,
            project=project,
            action='generate_compare_table',
            paper_ids=payload.paper_ids,
            instruction=payload.instruction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    project_task_runtime.launch(task.id, lambda: project_service.execute_task(task.id))
    return ProjectActionLaunchResponse(
        task=project_service.to_task_detail_out(db, task),
        detail_url=f'/projects/{project_id}/tasks/{task.id}',
        stream_url=f'/projects/{project_id}/tasks/{task.id}/stream',
    )


@router.post('/{project_id}/actions/draft-literature-review', response_model=ProjectActionLaunchResponse, status_code=status.HTTP_202_ACCEPTED)
async def draft_project_literature_review(
    project_id: int,
    payload: ResearchProjectActionRequest,
    db: Session = Depends(get_db),
) -> ProjectActionLaunchResponse:
    project = _project_or_404(db, project_id)
    try:
        task = project_service.launch_action(
            db,
            project=project,
            action='draft_literature_review',
            paper_ids=payload.paper_ids,
            instruction=payload.instruction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    project_task_runtime.launch(task.id, lambda: project_service.execute_task(task.id))
    return ProjectActionLaunchResponse(
        task=project_service.to_task_detail_out(db, task),
        detail_url=f'/projects/{project_id}/tasks/{task.id}',
        stream_url=f'/projects/{project_id}/tasks/{task.id}/stream',
    )
