from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.db.task_artifact_record import TaskArtifactRecord
from app.models.db.task_record import TaskRecord


class WorkflowService:
    def create_task(
        self,
        db: Session,
        task_type: str,
        trigger_source: str = 'api',
        input_json: dict[str, Any] | None = None,
        status: str = 'created',
    ) -> TaskRecord:
        task = TaskRecord(
            task_type=task_type,
            trigger_source=trigger_source,
            status=status,
            input_json=json.dumps(input_json or {}, ensure_ascii=False),
            started_at=datetime.now(timezone.utc),
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def update_task(
        self,
        db: Session,
        task: TaskRecord,
        status: str | None = None,
        output_json: dict[str, Any] | None = None,
        error_log: str | None = None,
        archived: bool | None = None,
    ) -> TaskRecord:
        if status is not None:
            task.status = status
            if status in {'completed', 'failed', 'archived'}:
                task.finished_at = datetime.now(timezone.utc)
        if output_json is not None:
            task.output_json = json.dumps(output_json, ensure_ascii=False)
        if error_log is not None:
            task.error_log = error_log
        if archived:
            task.archived_at = datetime.now(timezone.utc)
            task.archived_by = 'user'
            if task.status not in {'archived'}:
                task.status = 'archived'
        if archived is False:
            task.archived_at = None
            task.archived_by = ''
            if task.status == 'archived':
                task.status = 'completed'
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def add_artifact(
        self,
        db: Session,
        task_id: int,
        artifact_type: str,
        snapshot_json: dict[str, Any],
        artifact_ref_type: str = '',
        artifact_ref_id: int | None = None,
        role: str = 'output',
    ) -> TaskArtifactRecord:
        artifact = TaskArtifactRecord(
            task_id=task_id,
            artifact_type=artifact_type,
            artifact_ref_type=artifact_ref_type,
            artifact_ref_id=artifact_ref_id,
            role=role,
            snapshot_json=json.dumps(snapshot_json, ensure_ascii=False),
        )
        db.add(artifact)
        db.commit()
        db.refresh(artifact)
        return artifact


workflow_service = WorkflowService()
