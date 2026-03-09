from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.idea_record import IdeaRecord
from app.models.schemas.idea import BrainstormRequest
from app.services.brainstorm.service import brainstorm_service
from app.services.memory.service import memory_service
from app.services.workflow.service import workflow_service

router = APIRouter(prefix='/brainstorm', tags=['brainstorm'])


async def _run_and_store(db: Session, task_type: str, idea_type: str, topic: str, generator):
    task = workflow_service.create_task(db, task_type=task_type, input_json={'topic': topic}, status='running')
    text = await generator(topic)
    row = IdeaRecord(idea_type=idea_type, content=text, paper_id=None)
    db.add(row)
    db.commit()
    db.refresh(row)

    memory_service.create_memory(
        db,
        memory_type='IdeaMemory',
        layer='structured',
        text_content=text,
        ref_table='ideas',
        ref_id=row.id,
        importance=0.6,
    )
    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='idea',
        artifact_ref_type='ideas',
        artifact_ref_id=row.id,
        snapshot_json={'idea_type': idea_type},
    )
    workflow_service.update_task(db, task, status='completed', output_json={'idea_id': row.id})
    return {'id': row.id, 'idea_type': row.idea_type, 'content': row.content}


@router.post('/ideas')
async def ideas(payload: BrainstormRequest, db: Session = Depends(get_db)) -> dict:
    return await _run_and_store(db, 'brainstorm_ideas', 'idea', payload.topic, brainstorm_service.ideas)


@router.post('/gap-analysis')
async def gap_analysis(payload: BrainstormRequest, db: Session = Depends(get_db)) -> dict:
    return await _run_and_store(db, 'brainstorm_gap', 'gap_analysis', payload.topic, brainstorm_service.gaps)


@router.post('/survey-outline')
async def survey_outline(payload: BrainstormRequest, db: Session = Depends(get_db)) -> dict:
    return await _run_and_store(db, 'brainstorm_outline', 'survey_outline', payload.topic, brainstorm_service.outline)


@router.post('/proposal')
async def proposal(payload: BrainstormRequest, db: Session = Depends(get_db)) -> dict:
    return await _run_and_store(db, 'brainstorm_proposal', 'proposal', payload.topic, brainstorm_service.proposal)
