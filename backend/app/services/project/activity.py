from __future__ import annotations

import json
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.db.project_activity_record import ProjectActivityEventRecord
from app.models.schemas.project import ProjectActivityEventOut


class ProjectActivityService:
    def record(
        self,
        db: Session,
        *,
        project_id: int,
        event_type: str,
        title: str,
        message: str,
        ref_type: str = '',
        ref_id: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProjectActivityEventRecord:
        row = ProjectActivityEventRecord(
            project_id=project_id,
            event_type=event_type,
            title=title,
            message=message,
            ref_type=ref_type,
            ref_id=ref_id,
            metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def to_out(self, row: ProjectActivityEventRecord) -> ProjectActivityEventOut:
        try:
            metadata = json.loads(row.metadata_json or '{}')
        except json.JSONDecodeError:
            metadata = {}
        if not isinstance(metadata, dict):
            metadata = {}
        return ProjectActivityEventOut(
            id=row.id,
            project_id=row.project_id,
            event_type=row.event_type,
            title=row.title,
            message=row.message,
            ref_type=row.ref_type,
            ref_id=row.ref_id,
            metadata=metadata,
            created_at=row.created_at,
        )

    def list_preview(self, db: Session, project_id: int, limit: int = 12) -> list[ProjectActivityEventOut]:
        rows = db.execute(
            select(ProjectActivityEventRecord)
            .where(ProjectActivityEventRecord.project_id == project_id)
            .order_by(desc(ProjectActivityEventRecord.created_at), desc(ProjectActivityEventRecord.id))
            .limit(limit)
        ).scalars().all()
        return [self.to_out(row) for row in rows]


project_activity_service = ProjectActivityService()
