from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.paper_record import PaperRecord
from app.models.db.summary_record import SummaryRecord
from app.models.schemas.summary import SummaryCompareRequest, SummaryCompareResponse, SummaryGenerateRequest, SummaryOut
from app.services.memory.service import memory_service
from app.services.pdf.parser import pdf_parser
from app.services.summarize.compare import compare_summaries
from app.services.summarize.service import summarize_service
from app.services.workflow.service import workflow_service

router = APIRouter(prefix='/summaries', tags=['summaries'])


def to_summary_out(item: SummaryRecord) -> SummaryOut:
    return SummaryOut(
        id=item.id,
        paper_id=item.paper_id,
        summary_type=item.summary_type,
        content_en=item.content_en,
        problem_en=item.problem_en,
        method_en=item.method_en,
        contributions_en=item.contributions_en,
        limitations_en=item.limitations_en,
        future_work_en=item.future_work_en,
        provider=item.provider,
        model=item.model,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _paper_or_404(db: Session, paper_id: int) -> PaperRecord:
    paper = db.get(PaperRecord, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')
    return paper


@router.post('/quick', response_model=SummaryOut)
async def quick_summary(payload: SummaryGenerateRequest, db: Session = Depends(get_db)) -> SummaryOut:
    task = workflow_service.create_task(db, task_type='summary_quick', input_json=payload.model_dump(), status='running')
    paper = _paper_or_404(db, payload.paper_id)
    body = pdf_parser.extract_text(paper.pdf_local_path) if paper.pdf_local_path else ''

    result, provider_name, model_name = await summarize_service.quick(paper.title_en, paper.abstract_en, body)
    record = SummaryRecord(
        paper_id=paper.id,
        summary_type='quick',
        provider=provider_name,
        model=model_name,
        **result,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    memory_service.create_memory(
        db,
        memory_type='SummaryMemory',
        layer='structured',
        text_content=record.content_en,
        ref_table='summaries',
        ref_id=record.id,
        importance=0.6,
    )

    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='summary',
        artifact_ref_type='summaries',
        artifact_ref_id=record.id,
        snapshot_json={'summary_type': 'quick'},
    )
    workflow_service.update_task(db, task, status='completed', output_json={'summary_id': record.id})
    return to_summary_out(record)


@router.post('/deep', response_model=SummaryOut)
async def deep_summary(payload: SummaryGenerateRequest, db: Session = Depends(get_db)) -> SummaryOut:
    task = workflow_service.create_task(db, task_type='summary_deep', input_json=payload.model_dump(), status='running')
    paper = _paper_or_404(db, payload.paper_id)
    body = pdf_parser.extract_text(paper.pdf_local_path) if paper.pdf_local_path else ''

    result, provider_name, model_name = await summarize_service.deep(
        paper.title_en,
        paper.abstract_en,
        body,
        payload.focus,
    )
    record = SummaryRecord(
        paper_id=paper.id,
        summary_type='deep',
        provider=provider_name,
        model=model_name,
        **result,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    memory_service.create_memory(
        db,
        memory_type='SummaryMemory',
        layer='structured',
        text_content=record.content_en,
        ref_table='summaries',
        ref_id=record.id,
        importance=0.8,
    )

    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='summary',
        artifact_ref_type='summaries',
        artifact_ref_id=record.id,
        snapshot_json={'summary_type': 'deep'},
    )
    workflow_service.update_task(db, task, status='completed', output_json={'summary_id': record.id})
    return to_summary_out(record)


@router.post('/compare', response_model=SummaryCompareResponse)
def compare(payload: SummaryCompareRequest, db: Session = Depends(get_db)) -> SummaryCompareResponse:
    rows = (
        db.execute(select(SummaryRecord).where(SummaryRecord.paper_id.in_(payload.paper_ids)).order_by(SummaryRecord.created_at.desc()))
        .scalars()
        .all()
    )
    return SummaryCompareResponse(comparison_markdown=compare_summaries(rows))
