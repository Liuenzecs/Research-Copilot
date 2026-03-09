from __future__ import annotations

import json
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.db.reflection_record import ReflectionRecord
from app.models.db.task_record import TaskRecord
from app.services.memory.service import memory_service
from app.services.reflection.templates import get_template
from app.services.reflection.timeline import build_timeline_item


class ReflectionService:
    def create(
        self,
        db: Session,
        *,
        reflection_type: str,
        template_type: str,
        stage: str,
        event_date: date,
        content_structured_json: dict[str, Any],
        content_markdown: str,
        lifecycle_status: str = 'draft',
        is_report_worthy: bool = False,
        report_summary: str = '',
        related_paper_id: int | None = None,
        related_summary_id: int | None = None,
        related_repo_id: int | None = None,
        related_reproduction_id: int | None = None,
        related_task_id: int | None = None,
    ) -> ReflectionRecord:
        payload = content_structured_json or get_template(template_type)
        reflection = ReflectionRecord(
            reflection_type=reflection_type,
            related_paper_id=related_paper_id,
            related_summary_id=related_summary_id,
            related_repo_id=related_repo_id,
            related_reproduction_id=related_reproduction_id,
            related_task_id=related_task_id,
            template_type=template_type,
            stage=stage,
            lifecycle_status=lifecycle_status,
            content_structured_json=json.dumps(payload, ensure_ascii=False),
            content_markdown=content_markdown,
            is_report_worthy=is_report_worthy,
            report_summary=report_summary,
            event_date=event_date,
        )
        db.add(reflection)
        db.commit()
        db.refresh(reflection)

        memory_text = report_summary or content_markdown or json.dumps(payload, ensure_ascii=False)
        memory_service.create_memory(
            db,
            memory_type='ReflectionMemory',
            layer='structured',
            text_content=memory_text,
            ref_table='reflections',
            ref_id=reflection.id,
            importance=0.7 if is_report_worthy else 0.5,
        )
        return reflection

    def update(self, db: Session, reflection: ReflectionRecord, **kwargs) -> ReflectionRecord:
        if kwargs.get('stage') is not None:
            reflection.stage = kwargs['stage']
        if kwargs.get('lifecycle_status') is not None:
            reflection.lifecycle_status = kwargs['lifecycle_status']
        if kwargs.get('content_structured_json') is not None:
            reflection.content_structured_json = json.dumps(kwargs['content_structured_json'], ensure_ascii=False)
        if kwargs.get('content_markdown') is not None:
            reflection.content_markdown = kwargs['content_markdown']
        if kwargs.get('is_report_worthy') is not None:
            reflection.is_report_worthy = kwargs['is_report_worthy']
        if kwargs.get('report_summary') is not None:
            reflection.report_summary = kwargs['report_summary']
        if kwargs.get('related_task_id') is not None:
            reflection.related_task_id = kwargs['related_task_id']

        db.add(reflection)
        db.commit()
        db.refresh(reflection)
        return reflection

    def list(
        self,
        db: Session,
        *,
        reflection_type: str | None = None,
        lifecycle_status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        related_paper_id: int | None = None,
        related_summary_id: int | None = None,
        related_repo_id: int | None = None,
        related_reproduction_id: int | None = None,
        related_task_id: int | None = None,
    ) -> list[ReflectionRecord]:
        stmt = select(ReflectionRecord)
        if reflection_type:
            stmt = stmt.where(ReflectionRecord.reflection_type == reflection_type)
        if lifecycle_status:
            stmt = stmt.where(ReflectionRecord.lifecycle_status == lifecycle_status)
        if date_from:
            stmt = stmt.where(ReflectionRecord.event_date >= date_from)
        if date_to:
            stmt = stmt.where(ReflectionRecord.event_date <= date_to)
        if related_paper_id:
            stmt = stmt.where(ReflectionRecord.related_paper_id == related_paper_id)
        if related_summary_id:
            stmt = stmt.where(ReflectionRecord.related_summary_id == related_summary_id)
        if related_repo_id:
            stmt = stmt.where(ReflectionRecord.related_repo_id == related_repo_id)
        if related_reproduction_id:
            stmt = stmt.where(ReflectionRecord.related_reproduction_id == related_reproduction_id)
        if related_task_id:
            stmt = stmt.where(ReflectionRecord.related_task_id == related_task_id)
        stmt = stmt.order_by(ReflectionRecord.event_date.desc(), ReflectionRecord.created_at.desc())
        return db.execute(stmt).scalars().all()

    def timeline(self, db: Session, *, date_from: date | None = None, date_to: date | None = None) -> list[dict]:
        rows = self.list(db, date_from=date_from, date_to=date_to)
        timeline = []
        for row in rows:
            task = db.get(TaskRecord, row.related_task_id) if row.related_task_id else None
            timeline.append(build_timeline_item(row, task))
        return timeline


reflection_service = ReflectionService()
