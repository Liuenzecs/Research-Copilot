from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.reproduction_record import ReproductionRecord, ReproductionStepRecord
from app.models.schemas.reproduction import (
    ReproductionExecuteRequest,
    ReproductionExecuteResponse,
    ReproductionPlanRequest,
    ReproductionPlanResponse,
)
from app.services.memory.service import memory_service
from app.services.reproduction.executor import reproduction_executor
from app.services.reproduction.planner import reproduction_planner
from app.services.reproduction.safety import assess_commands
from app.services.workflow.service import workflow_service

router = APIRouter(prefix='/reproduction', tags=['reproduction'])


@router.post('/plan', response_model=ReproductionPlanResponse)
async def plan_reproduction(payload: ReproductionPlanRequest, db: Session = Depends(get_db)) -> ReproductionPlanResponse:
    task = workflow_service.create_task(db, task_type='reproduction_plan', input_json=payload.model_dump(), status='running')

    context = f'paper_id={payload.paper_id}, repo_id={payload.repo_id}'
    markdown, steps = await reproduction_planner.plan(context)

    repro = ReproductionRecord(paper_id=payload.paper_id, repo_id=payload.repo_id, plan_markdown=markdown, status='planned')
    db.add(repro)
    db.commit()
    db.refresh(repro)

    commands = [s['command'] for s in steps]
    assessments = assess_commands(commands)
    final_steps = []
    for idx, step in enumerate(steps):
        check = assessments[idx]
        row = ReproductionStepRecord(
            reproduction_id=repro.id,
            step_no=step['step_no'],
            command=step['command'],
            purpose=step['purpose'],
            risk_level=step['risk_level'],
            requires_manual_confirm=True,
            expected_output=step['expected_output'],
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        final_steps.append(
            {
                'id': row.id,
                'step_no': row.step_no,
                'command': row.command,
                'purpose': row.purpose,
                'risk_level': row.risk_level,
                'requires_manual_confirm': row.requires_manual_confirm,
                'expected_output': row.expected_output,
                'safe': check['allowed'],
                'safety_reason': check['reason'],
            }
        )

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
        steps=final_steps,
    )


@router.post('/execute', response_model=ReproductionExecuteResponse)
def execute_reproduction(payload: ReproductionExecuteRequest, db: Session = Depends(get_db)) -> ReproductionExecuteResponse:
    task = workflow_service.create_task(db, task_type='reproduction_execute', input_json=payload.model_dump(), status='running')
    output = reproduction_executor.execute(payload.reproduction_id)
    workflow_service.update_task(db, task, status='completed', output_json=output)
    return ReproductionExecuteResponse(**output)
