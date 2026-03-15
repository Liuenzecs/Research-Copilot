from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.paper_record import PaperRecord
from app.models.db.summary_record import SummaryRecord
from app.models.schemas.translation import KeyFieldTranslationRequest, SegmentTranslationRequest, TranslationOut
from app.services.translation.service import translation_service
from app.services.workflow.service import workflow_service

router = APIRouter(prefix='/translation', tags=['translation'])


def to_translation_out(row) -> TranslationOut:
    return TranslationOut(
        id=row.id,
        target_type=row.target_type,
        target_id=row.target_id,
        unit_type=row.unit_type,
        field_name=row.field_name,
        content_en_snapshot=row.content_en_snapshot,
        content_zh=row.content_zh,
        disclaimer=row.disclaimer,
    )


@router.post('/key-fields', response_model=list[TranslationOut])
async def translate_key_fields(payload: KeyFieldTranslationRequest, db: Session = Depends(get_db)) -> list[TranslationOut]:
    task = workflow_service.create_task(db, task_type='translation_key_fields', input_json=payload.model_dump(), status='running')
    outputs = []

    if payload.target_type == 'paper':
        record = db.get(PaperRecord, payload.target_id)
        if record is None:
            raise HTTPException(status_code=404, detail='Paper not found')
        source_map = {
            'title': record.title_en,
            'abstract': record.abstract_en,
        }
    elif payload.target_type == 'summary':
        record = db.get(SummaryRecord, payload.target_id)
        if record is None:
            raise HTTPException(status_code=404, detail='Summary not found')
        source_map = {
            'problem': record.problem_en,
            'method': record.method_en,
            'contributions': record.contributions_en,
            'limitations': record.limitations_en,
            'future_work': record.future_work_en,
        }
    else:
        raise HTTPException(status_code=400, detail='Unsupported target_type')

    for field in payload.fields:
        english_text = source_map.get(field, '')
        if not english_text:
            continue
        row = await translation_service.create_translation(
            db,
            target_type=payload.target_type,
            target_id=payload.target_id,
            unit_type='key_field',
            field_name=field,
            locator_json='{}',
            english_text=english_text,
        )
        outputs.append(to_translation_out(row))

    workflow_service.update_task(db, task, status='completed', output_json={'count': len(outputs)})
    return outputs


@router.post('/segment', response_model=TranslationOut)
async def translate_segment(payload: SegmentTranslationRequest, db: Session = Depends(get_db)) -> TranslationOut:
    task = workflow_service.create_task(db, task_type='translation_segment', input_json=payload.model_dump(), status='running')
    row = await translation_service.create_translation(
        db,
        target_type='manual_segment',
        target_id=0,
        unit_type=payload.mode,
        field_name='',
        locator_json=json.dumps(payload.locator or {}, ensure_ascii=False),
        english_text=payload.text,
        prefer_public_api=payload.mode == 'selection',
    )
    workflow_service.update_task(db, task, status='completed', output_json={'translation_id': row.id})
    return to_translation_out(row)
