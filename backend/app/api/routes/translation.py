from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.paper_record import PaperRecord
from app.models.db.summary_record import SummaryRecord
from app.models.schemas.translation import KeyFieldTranslationRequest, SegmentTranslationRequest, TranslationOut
from app.services.llm.prompts.translate import TRANSLATE_SYSTEM, translation_prompt
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


def _stream_line(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False) + '\n'


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
        locator_json=json.dumps(payload.locator or {}, ensure_ascii=False, sort_keys=True),
        english_text=payload.text,
        prefer_public_api=payload.mode == 'selection',
    )
    workflow_service.update_task(db, task, status='completed', output_json={'translation_id': row.id})
    return to_translation_out(row)


@router.post('/segment/stream')
async def translate_segment_stream(payload: SegmentTranslationRequest, db: Session = Depends(get_db)) -> StreamingResponse:
    task = workflow_service.create_task(db, task_type='translation_segment_stream', input_json=payload.model_dump(), status='running')
    locator_json = json.dumps(payload.locator or {}, ensure_ascii=False, sort_keys=True)

    async def event_stream() -> AsyncIterator[str]:
        try:
            existing = translation_service.find_existing_translation(
                db,
                target_type='manual_segment',
                target_id=0,
                unit_type=payload.mode,
                field_name='',
                locator_json=locator_json,
                english_text=payload.text,
            )
            if existing is not None:
                workflow_service.update_task(db, task, status='completed', output_json={'translation_id': existing.id, 'cached': True})
                yield _stream_line({'type': 'complete', 'translation': to_translation_out(existing).model_dump(mode='json')})
                return

            if payload.mode == 'selection':
                reusable = translation_service.find_reusable_selection_translation(
                    db,
                    unit_type=payload.mode,
                    english_text=payload.text,
                )
                if reusable is not None and reusable.content_zh:
                    row = translation_service.clone_translation(
                        db,
                        source=reusable,
                        target_type='manual_segment',
                        target_id=0,
                        unit_type=payload.mode,
                        field_name='',
                        locator_json=locator_json,
                        english_text=payload.text,
                    )
                    workflow_service.update_task(db, task, status='completed', output_json={'translation_id': row.id, 'cached': True})
                    yield _stream_line({'type': 'complete', 'translation': to_translation_out(row).model_dump(mode='json')})
                    return

                provider = translation_service.selection_provider()
                if provider is None:
                    zh_text, provider_name, model_name = translation_service._local_selection_fallback(payload.text)
                else:
                    yield _stream_line({'type': 'start', 'provider': provider.name, 'model': provider.model})
                    chunks: list[str] = []
                    async for chunk in provider.stream_complete(translation_prompt(payload.text), system_prompt=TRANSLATE_SYSTEM):
                        if not chunk:
                            continue
                        chunks.append(chunk)
                        yield _stream_line({'type': 'delta', 'delta': chunk})

                    zh_text = ''.join(chunks).strip()
                    if translation_service._looks_like_invalid_chinese_translation(payload.text, zh_text):
                        zh_text, provider_name, model_name = translation_service._local_selection_fallback(payload.text)
                    else:
                        provider_name, model_name = provider.name, provider.model

                row = translation_service.save_translation(
                    db,
                    target_type='manual_segment',
                    target_id=0,
                    unit_type=payload.mode,
                    field_name='',
                    locator_json=locator_json,
                    english_text=payload.text,
                    chinese_text=zh_text,
                    provider_name=provider_name,
                    model_name=model_name,
                )
                workflow_service.update_task(db, task, status='completed', output_json={'translation_id': row.id})
                yield _stream_line({'type': 'complete', 'translation': to_translation_out(row).model_dump(mode='json')})
                return

            row = await translation_service.create_translation(
                db,
                target_type='manual_segment',
                target_id=0,
                unit_type=payload.mode,
                field_name='',
                locator_json=locator_json,
                english_text=payload.text,
                prefer_public_api=False,
            )
            workflow_service.update_task(db, task, status='completed', output_json={'translation_id': row.id})
            yield _stream_line({'type': 'complete', 'translation': to_translation_out(row).model_dump(mode='json')})
        except Exception as exc:
            workflow_service.update_task(db, task, status='failed', error_log=str(exc), output_json={'error': str(exc)})
            yield _stream_line({'type': 'error', 'message': str(exc)})

    return StreamingResponse(event_stream(), media_type='application/x-ndjson')
