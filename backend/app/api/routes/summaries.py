from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.paper_record import PaperRecord
from app.models.db.summary_record import SummaryRecord
from app.models.schemas.summary import SummaryCompareRequest, SummaryCompareResponse, SummaryGenerateRequest, SummaryOut
from app.services.memory.service import memory_service
from app.services.pdf.parser import pdf_parser
from app.services.summarize.compare import compare_summaries
from app.services.summarize.deep import fallback_deep
from app.services.summarize.quick import fallback_quick
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


def _save_summary(db: Session, *, task_id: int, paper: PaperRecord, summary_type: str, provider_name: str, model_name: str, content: str) -> SummaryRecord:
    record = SummaryRecord(
        paper_id=paper.id,
        summary_type=summary_type,
        provider=provider_name,
        model=model_name,
        content_en=content,
        problem_en='',
        method_en='',
        contributions_en='',
        limitations_en='',
        future_work_en='',
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
        importance=0.8 if summary_type == 'deep' else 0.6,
    )

    workflow_service.add_artifact(
        db,
        task_id,
        artifact_type='summary',
        artifact_ref_type='summaries',
        artifact_ref_id=record.id,
        snapshot_json={'summary_type': summary_type},
    )
    return record


def _stream_line(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False) + '\n'


async def _stream_summary_response(
    *,
    db: Session,
    payload: SummaryGenerateRequest,
    task_type: str,
    summary_type: str,
) -> StreamingResponse:
    task = workflow_service.create_task(db, task_type=task_type, input_json=payload.model_dump(), status='running')
    paper = _paper_or_404(db, payload.paper_id)
    body = pdf_parser.extract_text(paper.pdf_local_path) if paper.pdf_local_path else ''

    async def event_stream() -> AsyncIterator[str]:
        try:
            if summary_type == 'quick':
                chunk_stream, provider_name, model_name = summarize_service.stream_quick(paper.title_en, paper.abstract_en, body)
                fallback_result = fallback_quick(paper.title_en, paper.abstract_en)
            else:
                chunk_stream, provider_name, model_name = summarize_service.stream_deep(
                    paper.title_en,
                    paper.abstract_en,
                    body,
                    payload.focus,
                )
                fallback_result = fallback_deep(paper.title_en, paper.abstract_en, body, payload.focus)

            yield _stream_line({'type': 'start', 'summary_type': summary_type, 'provider': provider_name, 'model': model_name})

            chunks: list[str] = []
            async for chunk in chunk_stream:
                if not chunk:
                    continue
                chunks.append(chunk)
                yield _stream_line({'type': 'delta', 'delta': chunk})

            content = ''.join(chunks).strip() or fallback_result['content_en']
            record = _save_summary(
                db,
                task_id=task.id,
                paper=paper,
                summary_type=summary_type,
                provider_name=provider_name,
                model_name=model_name,
                content=content,
            )
            workflow_service.update_task(db, task, status='completed', output_json={'summary_id': record.id})
            yield _stream_line({'type': 'complete', 'summary': to_summary_out(record).model_dump(mode='json')})
        except Exception as exc:
            workflow_service.update_task(db, task, status='failed', error_log=str(exc), output_json={'error': str(exc)})
            yield _stream_line({'type': 'error', 'message': str(exc)})

    return StreamingResponse(event_stream(), media_type='application/x-ndjson')


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


@router.post('/quick/stream')
async def quick_summary_stream(payload: SummaryGenerateRequest, db: Session = Depends(get_db)) -> StreamingResponse:
    return await _stream_summary_response(db=db, payload=payload, task_type='summary_quick_stream', summary_type='quick')


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


@router.post('/deep/stream')
async def deep_summary_stream(payload: SummaryGenerateRequest, db: Session = Depends(get_db)) -> StreamingResponse:
    return await _stream_summary_response(db=db, payload=payload, task_type='summary_deep_stream', summary_type='deep')


@router.post('/compare', response_model=SummaryCompareResponse)
def compare(payload: SummaryCompareRequest, db: Session = Depends(get_db)) -> SummaryCompareResponse:
    rows = (
        db.execute(select(SummaryRecord).where(SummaryRecord.paper_id.in_(payload.paper_ids)).order_by(SummaryRecord.created_at.desc()))
        .scalars()
        .all()
    )
    return SummaryCompareResponse(comparison_markdown=compare_summaries(rows))
