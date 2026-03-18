from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.db.paper_record import PaperRecord, PaperResearchStateRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.reproduction_record import ReproductionRecord
from app.models.db.research_project_record import (
    ResearchProjectEvidenceItemRecord,
    ResearchProjectOutputRecord,
    ResearchProjectPaperRecord,
    ResearchProjectRecord,
)
from app.models.db.summary_record import SummaryRecord
from app.models.db.task_artifact_record import TaskArtifactRecord
from app.models.db.task_record import TaskRecord
from app.models.schemas.paper import PaperOut
from app.models.schemas.project import (
    LinkedReflectionArtifactOut,
    LinkedReproductionArtifactOut,
    LinkedSummaryArtifactOut,
    ResearchProjectEvidenceOut,
    ResearchProjectLinkedArtifactsOut,
    ResearchProjectOut,
    ResearchProjectOutputOut,
    ResearchProjectPaperOut,
    ResearchProjectTaskDetailOut,
    ResearchProjectTaskOut,
    ResearchProjectTaskProgressStepOut,
    ResearchProjectWorkspaceResponse,
)
from app.services.memory.service import memory_service
from app.services.pdf.parser import pdf_parser
from app.services.summarize.service import summarize_service
from app.services.workflow.service import workflow_service


COMPARE_COLUMNS = [
    'Paper',
    'Research Question',
    'Method',
    'Dataset / Setting',
    'Metrics',
    'Main Result',
    'Limitations',
    'Reproduction Value',
    'User Note',
]

PROJECT_ACTION_TASK_TYPES = {
    'extract_evidence': 'project_extract_evidence',
    'generate_compare_table': 'project_generate_compare_table',
    'draft_literature_review': 'project_draft_literature_review',
}

PROJECT_TERMINAL_TASK_STATUSES = {'completed', 'failed', 'archived'}


def _first_sentence(text: str, limit: int = 180) -> str:
    normalized = ' '.join((text or '').split()).strip()
    if not normalized:
        return ''
    for delimiter in ['. ', '; ', '\n', '。', '；']:
        if delimiter in normalized:
            candidate = normalized.split(delimiter, maxsplit=1)[0].strip()
            if candidate:
                return candidate[:limit]
    return normalized[:limit]


def _compact(text: str, limit: int = 180) -> str:
    normalized = ' '.join((text or '').split()).strip()
    if not normalized:
        return ''
    return normalized[:limit]


def _extract_line(text: str, keywords: list[str], fallback: str = '') -> str:
    lowered = text.lower()
    for keyword in keywords:
        index = lowered.find(keyword.lower())
        if index >= 0:
            snippet = text[index:index + 180].strip()
            if snippet:
                return _compact(snippet, 180)
    return fallback


def _repro_value_label(state: PaperResearchStateRecord | None, latest_reproduction: ReproductionRecord | None) -> str:
    if latest_reproduction is not None:
        return latest_reproduction.status
    if state is None:
        return 'none'
    return state.repro_interest or 'none'


def _default_project_title(research_question: str) -> str:
    normalized = ' '.join(research_question.split()).strip()
    if not normalized:
        return '未命名研究项目'
    return normalized[:80]


def _project_task_step_delay_seconds() -> float:
    raw_value = (os.getenv('RESEARCH_COPILOT_PROJECT_TASK_STEP_DELAY_MS') or '').strip()
    if not raw_value:
        return 0.0
    try:
        delay_ms = max(0, int(raw_value))
    except ValueError:
        return 0.0
    return delay_ms / 1000.0


class ProjectService:
    async def _maybe_pause_for_progress(self) -> None:
        delay_seconds = _project_task_step_delay_seconds()
        if delay_seconds > 0:
            await asyncio.sleep(delay_seconds)

    def to_project_out(self, row: ResearchProjectRecord) -> ResearchProjectOut:
        return ResearchProjectOut(
            id=row.id,
            title=row.title,
            research_question=row.research_question,
            goal=row.goal,
            status=row.status,
            seed_query=row.seed_query,
            last_opened_at=row.last_opened_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def to_paper_out(self, row: PaperRecord) -> PaperOut:
        return PaperOut(
            id=row.id,
            source=row.source,
            source_id=row.source_id,
            title_en=row.title_en,
            abstract_en=row.abstract_en,
            authors=row.authors,
            year=row.year,
            venue=row.venue,
            pdf_url=row.pdf_url,
            pdf_local_path=row.pdf_local_path,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def get_or_404(self, db: Session, project_id: int) -> ResearchProjectRecord:
        row = db.get(ResearchProjectRecord, project_id)
        if row is None:
            raise ValueError('Project not found')
        return row

    def create_project(
        self,
        db: Session,
        *,
        research_question: str,
        goal: str = '',
        title: str = '',
        seed_query: str = '',
    ) -> ResearchProjectRecord:
        normalized_question = research_question.strip()
        if not normalized_question:
            raise ValueError('Research question is required')
        row = ResearchProjectRecord(
            title=(title or '').strip() or _default_project_title(normalized_question),
            research_question=normalized_question,
            goal=(goal or '').strip(),
            status='active',
            seed_query=(seed_query or '').strip() or normalized_question,
            last_opened_at=datetime.now(timezone.utc),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def list_projects(self, db: Session) -> list[ResearchProjectRecord]:
        return db.execute(
            select(ResearchProjectRecord).order_by(desc(ResearchProjectRecord.last_opened_at), desc(ResearchProjectRecord.updated_at))
        ).scalars().all()

    def update_project(self, db: Session, row: ResearchProjectRecord, **changes: Any) -> ResearchProjectRecord:
        if changes.get('title') is not None:
            row.title = changes['title'].strip() or row.title
        if changes.get('research_question') is not None:
            normalized = changes['research_question'].strip()
            if normalized:
                row.research_question = normalized
        if changes.get('goal') is not None:
            row.goal = changes['goal'].strip()
        if changes.get('status') is not None:
            row.status = changes['status']
        if changes.get('seed_query') is not None:
            row.seed_query = changes['seed_query'].strip()
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def _project_task_rows(self, db: Session, project_id: int) -> list[TaskRecord]:
        return db.execute(
            select(TaskRecord)
            .join(TaskArtifactRecord, TaskArtifactRecord.task_id == TaskRecord.id)
            .where(TaskArtifactRecord.artifact_ref_type == 'projects')
            .where(TaskArtifactRecord.artifact_ref_id == project_id)
            .order_by(TaskRecord.created_at.desc())
            .distinct()
        ).scalars().all()

    def delete_project(self, db: Session, row: ResearchProjectRecord) -> None:
        task_rows = self._project_task_rows(db, row.id)
        running_task = next((task for task in task_rows if task.status == 'running'), None)
        if running_task is not None:
            raise ValueError('Project has running tasks and cannot be deleted yet')

        for task in task_rows:
            db.delete(task)
        db.delete(row)
        db.commit()

    def touch_project(self, db: Session, row: ResearchProjectRecord) -> ResearchProjectRecord:
        row.last_opened_at = datetime.now(timezone.utc)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def add_paper(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        paper_id: int,
        selection_reason: str = '',
    ) -> ResearchProjectPaperRecord:
        paper = db.get(PaperRecord, paper_id)
        if paper is None:
            raise ValueError('Paper not found')

        existing = db.execute(
            select(ResearchProjectPaperRecord)
            .where(ResearchProjectPaperRecord.project_id == project.id)
            .where(ResearchProjectPaperRecord.paper_id == paper_id)
        ).scalars().first()
        if existing is not None:
            if selection_reason and not existing.selection_reason:
                existing.selection_reason = selection_reason
                db.add(existing)
                db.commit()
                db.refresh(existing)
            return existing

        current_links = db.execute(
            select(ResearchProjectPaperRecord)
            .where(ResearchProjectPaperRecord.project_id == project.id)
            .order_by(desc(ResearchProjectPaperRecord.sort_order))
        ).scalars().all()
        next_order = (current_links[0].sort_order + 1) if current_links else 1
        row = ResearchProjectPaperRecord(
            project_id=project.id,
            paper_id=paper_id,
            sort_order=next_order,
            pinned=False,
            selection_reason=(selection_reason or '').strip(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def remove_paper(self, db: Session, *, project: ResearchProjectRecord, project_paper_id: int) -> None:
        row = db.get(ResearchProjectPaperRecord, project_paper_id)
        if row is None or row.project_id != project.id:
            raise ValueError('Project paper not found')
        db.delete(row)
        db.commit()

    def create_evidence(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        paper_id: int | None,
        summary_id: int | None,
        paragraph_id: int | None,
        kind: str,
        excerpt: str,
        note_text: str,
        source_label: str,
        sort_order: int | None = None,
    ) -> ResearchProjectEvidenceItemRecord:
        normalized_excerpt = excerpt.strip()
        if not normalized_excerpt:
            raise ValueError('Evidence excerpt is required')

        if sort_order is None:
            last_item = db.execute(
                select(ResearchProjectEvidenceItemRecord)
                .where(ResearchProjectEvidenceItemRecord.project_id == project.id)
                .order_by(desc(ResearchProjectEvidenceItemRecord.sort_order))
            ).scalars().first()
            sort_order = (last_item.sort_order + 1) if last_item is not None else 1

        row = ResearchProjectEvidenceItemRecord(
            project_id=project.id,
            paper_id=paper_id,
            summary_id=summary_id,
            paragraph_id=paragraph_id,
            kind=kind,
            excerpt=normalized_excerpt,
            note_text=note_text.strip(),
            source_label=source_label.strip(),
            sort_order=sort_order,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def update_evidence(self, db: Session, row: ResearchProjectEvidenceItemRecord, **changes: Any) -> ResearchProjectEvidenceItemRecord:
        if changes.get('kind') is not None:
            row.kind = changes['kind']
        if changes.get('excerpt') is not None:
            normalized = changes['excerpt'].strip()
            if not normalized:
                raise ValueError('Evidence excerpt is required')
            row.excerpt = normalized
        if changes.get('note_text') is not None:
            row.note_text = changes['note_text'].strip()
        if changes.get('source_label') is not None:
            row.source_label = changes['source_label'].strip()
        if changes.get('sort_order') is not None:
            row.sort_order = int(changes['sort_order'])
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def delete_evidence(self, db: Session, row: ResearchProjectEvidenceItemRecord) -> None:
        db.delete(row)
        db.commit()

    def reorder_evidence(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        evidence_ids: list[int],
    ) -> list[ResearchProjectEvidenceItemRecord]:
        ordered_ids = [int(item) for item in evidence_ids if int(item) > 0]
        existing = db.execute(
            select(ResearchProjectEvidenceItemRecord)
            .where(ResearchProjectEvidenceItemRecord.project_id == project.id)
            .order_by(ResearchProjectEvidenceItemRecord.sort_order.asc(), ResearchProjectEvidenceItemRecord.created_at.asc())
        ).scalars().all()
        existing_ids = [item.id for item in existing]
        if not existing_ids:
            return []
        if sorted(existing_ids) != sorted(ordered_ids):
            raise ValueError('Evidence reorder payload must contain every project evidence item exactly once')
        by_id = {item.id: item for item in existing}
        for index, evidence_id in enumerate(ordered_ids, start=1):
            by_id[evidence_id].sort_order = index
            db.add(by_id[evidence_id])
        db.commit()
        return [by_id[evidence_id] for evidence_id in ordered_ids]

    def update_output(self, db: Session, row: ResearchProjectOutputRecord, **changes: Any) -> ResearchProjectOutputRecord:
        if changes.get('title') is not None:
            row.title = changes['title'].strip() or row.title
        if changes.get('content_json') is not None:
            row.content_json = json.dumps(changes['content_json'], ensure_ascii=False)
        if changes.get('content_markdown') is not None:
            row.content_markdown = changes['content_markdown']
        if changes.get('status') is not None:
            row.status = changes['status']
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def _get_summary_rows(self, db: Session, paper_id: int) -> list[SummaryRecord]:
        return db.execute(
            select(SummaryRecord).where(SummaryRecord.paper_id == paper_id).order_by(desc(SummaryRecord.created_at))
        ).scalars().all()

    def _get_reflection_rows(self, db: Session, paper_id: int, summary_ids: list[int]) -> list[ReflectionRecord]:
        rows = db.execute(
            select(ReflectionRecord).where(ReflectionRecord.related_paper_id == paper_id).order_by(desc(ReflectionRecord.created_at))
        ).scalars().all()
        if summary_ids:
            summary_rows = db.execute(
                select(ReflectionRecord)
                .where(ReflectionRecord.related_summary_id.in_(summary_ids))
                .order_by(desc(ReflectionRecord.created_at))
            ).scalars().all()
            by_id = {row.id: row for row in rows}
            for item in summary_rows:
                by_id[item.id] = item
            rows = sorted(by_id.values(), key=lambda item: (item.created_at, item.id), reverse=True)
        return rows

    def _get_reproduction_rows(self, db: Session, paper_id: int) -> list[ReproductionRecord]:
        return db.execute(
            select(ReproductionRecord).where(ReproductionRecord.paper_id == paper_id).order_by(desc(ReproductionRecord.updated_at))
        ).scalars().all()

    def _get_research_state(self, db: Session, paper_id: int) -> PaperResearchStateRecord | None:
        return db.execute(select(PaperResearchStateRecord).where(PaperResearchStateRecord.paper_id == paper_id)).scalar_one_or_none()

    def _to_project_paper_out(self, db: Session, link: ResearchProjectPaperRecord) -> ResearchProjectPaperOut:
        summaries = self._get_summary_rows(db, link.paper_id)
        summary_ids = [item.id for item in summaries]
        reflections = self._get_reflection_rows(db, link.paper_id, summary_ids)
        reproductions = self._get_reproduction_rows(db, link.paper_id)
        latest_reproduction = reproductions[0] if reproductions else None
        return ResearchProjectPaperOut(
            id=link.id,
            project_id=link.project_id,
            paper=self.to_paper_out(link.paper),
            sort_order=link.sort_order,
            pinned=link.pinned,
            selection_reason=link.selection_reason,
            is_downloaded=bool(link.paper.pdf_local_path),
            summary_count=len(summaries),
            reflection_count=len(reflections),
            reproduction_count=len(reproductions),
            latest_summary_id=summaries[0].id if summaries else None,
            latest_reflection_id=reflections[0].id if reflections else None,
            latest_reproduction_id=latest_reproduction.id if latest_reproduction else None,
            latest_reproduction_status=latest_reproduction.status if latest_reproduction else '',
            created_at=link.created_at,
            updated_at=link.updated_at,
        )

    def _to_linked_artifacts_out(self, db: Session, link: ResearchProjectPaperRecord) -> ResearchProjectLinkedArtifactsOut:
        summaries = self._get_summary_rows(db, link.paper_id)
        summary_ids = [item.id for item in summaries]
        reflections = self._get_reflection_rows(db, link.paper_id, summary_ids)
        reproductions = self._get_reproduction_rows(db, link.paper_id)
        return ResearchProjectLinkedArtifactsOut(
            paper_id=link.paper_id,
            paper_title=link.paper.title_en,
            summaries=[
                LinkedSummaryArtifactOut(
                    id=item.id,
                    summary_type=item.summary_type,
                    provider=item.provider,
                    model=item.model,
                    created_at=item.created_at,
                )
                for item in summaries[:5]
            ],
            reflections=[
                LinkedReflectionArtifactOut(
                    id=item.id,
                    stage=item.stage,
                    lifecycle_status=item.lifecycle_status,
                    report_summary=item.report_summary,
                    event_date=item.event_date,
                    created_at=item.created_at,
                )
                for item in reflections[:5]
            ],
            reproductions=[
                LinkedReproductionArtifactOut(
                    id=item.id,
                    status=item.status,
                    progress_summary=item.progress_summary,
                    progress_percent=item.progress_percent,
                    updated_at=item.updated_at,
                )
                for item in reproductions[:5]
            ],
        )

    def _to_evidence_out(self, row: ResearchProjectEvidenceItemRecord) -> ResearchProjectEvidenceOut:
        return ResearchProjectEvidenceOut(
            id=row.id,
            project_id=row.project_id,
            paper_id=row.paper_id,
            paper_title=row.paper.title_en if row.paper is not None else None,
            summary_id=row.summary_id,
            paragraph_id=row.paragraph_id,
            kind=row.kind,
            excerpt=row.excerpt,
            note_text=row.note_text,
            source_label=row.source_label,
            sort_order=row.sort_order,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _to_output_out(self, row: ResearchProjectOutputRecord) -> ResearchProjectOutputOut:
        return ResearchProjectOutputOut(
            id=row.id,
            project_id=row.project_id,
            output_type=row.output_type,
            title=row.title,
            content_json=json.loads(row.content_json or '{}'),
            content_markdown=row.content_markdown,
            status=row.status,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _parse_task_json(self, raw: str | None) -> dict[str, Any]:
        if not raw:
            return {}
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return payload if isinstance(payload, dict) else {}

    def to_task_out(self, db: Session, row: TaskRecord) -> ResearchProjectTaskOut:
        return ResearchProjectTaskOut(
            id=row.id,
            task_type=row.task_type,
            status=row.status,
            created_at=row.created_at,
            updated_at=row.updated_at,
            progress_steps=self._load_progress_steps(db, row.id),
        )

    def to_task_detail_out(self, db: Session, row: TaskRecord) -> ResearchProjectTaskDetailOut:
        return ResearchProjectTaskDetailOut(
            **self.to_task_out(db, row).model_dump(),
            input_json=self._parse_task_json(row.input_json),
            output_json=self._parse_task_json(row.output_json),
            error_log=row.error_log or '',
        )

    def _load_progress_steps(self, db: Session, task_id: int) -> list[ResearchProjectTaskProgressStepOut]:
        rows = db.execute(
            select(TaskArtifactRecord)
            .where(TaskArtifactRecord.task_id == task_id)
            .where(TaskArtifactRecord.role == 'progress')
            .where(TaskArtifactRecord.artifact_type == 'project_action_step')
            .order_by(TaskArtifactRecord.created_at.asc())
        ).scalars().all()
        latest: dict[str, ResearchProjectTaskProgressStepOut] = {}
        for row in rows:
            snapshot = json.loads(row.snapshot_json or '{}')
            key = str(snapshot.get('step_key') or '')
            latest[key] = ResearchProjectTaskProgressStepOut(
                step_key=key,
                label=str(snapshot.get('label') or key),
                status=str(snapshot.get('status') or ''),
                message=str(snapshot.get('message') or ''),
                related_paper_ids=[int(item) for item in snapshot.get('related_paper_ids', [])],
                created_at=row.created_at,
            )
        return sorted(latest.values(), key=lambda item: (item.created_at or datetime.min.replace(tzinfo=timezone.utc), item.step_key))

    def list_progress_artifacts(
        self,
        db: Session,
        task_id: int,
        *,
        after_artifact_id: int = 0,
    ) -> list[TaskArtifactRecord]:
        return db.execute(
            select(TaskArtifactRecord)
            .where(TaskArtifactRecord.task_id == task_id)
            .where(TaskArtifactRecord.role == 'progress')
            .where(TaskArtifactRecord.artifact_type == 'project_action_step')
            .where(TaskArtifactRecord.id > after_artifact_id)
            .order_by(TaskArtifactRecord.id.asc())
        ).scalars().all()

    def _task_has_project_ref(self, db: Session, task_id: int, project_id: int) -> bool:
        artifact = db.execute(
            select(TaskArtifactRecord.id)
            .where(TaskArtifactRecord.task_id == task_id)
            .where(TaskArtifactRecord.artifact_ref_type == 'projects')
            .where(TaskArtifactRecord.artifact_ref_id == project_id)
            .limit(1)
        ).first()
        return artifact is not None

    def get_task_or_404(self, db: Session, project_id: int, task_id: int) -> TaskRecord:
        row = db.get(TaskRecord, task_id)
        if row is None or not self._task_has_project_ref(db, task_id, project_id):
            raise ValueError('Project task not found')
        return row

    def _recent_tasks(self, db: Session, project_id: int) -> list[ResearchProjectTaskOut]:
        rows = self._project_task_rows(db, project_id)[:6]
        return [self.to_task_out(db, row) for row in rows]

    def build_workspace(self, db: Session, project: ResearchProjectRecord) -> ResearchProjectWorkspaceResponse:
        links = db.execute(
            select(ResearchProjectPaperRecord)
            .where(ResearchProjectPaperRecord.project_id == project.id)
            .order_by(desc(ResearchProjectPaperRecord.pinned), ResearchProjectPaperRecord.sort_order.asc(), ResearchProjectPaperRecord.created_at.asc())
        ).scalars().all()
        evidence_items = db.execute(
            select(ResearchProjectEvidenceItemRecord)
            .where(ResearchProjectEvidenceItemRecord.project_id == project.id)
            .order_by(ResearchProjectEvidenceItemRecord.sort_order.asc(), ResearchProjectEvidenceItemRecord.created_at.asc())
        ).scalars().all()
        outputs = db.execute(
            select(ResearchProjectOutputRecord)
            .where(ResearchProjectOutputRecord.project_id == project.id)
            .order_by(ResearchProjectOutputRecord.output_type.asc(), ResearchProjectOutputRecord.updated_at.desc())
        ).scalars().all()
        return ResearchProjectWorkspaceResponse(
            project=self.to_project_out(project),
            papers=[self._to_project_paper_out(db, link) for link in links],
            evidence_items=[self._to_evidence_out(item) for item in evidence_items],
            outputs=[self._to_output_out(item) for item in outputs],
            recent_tasks=self._recent_tasks(db, project.id),
            linked_existing_artifacts=[self._to_linked_artifacts_out(db, link) for link in links],
        )

    def _record_project_artifact(self, db: Session, task_id: int, project_id: int, artifact_type: str, snapshot_json: dict[str, Any]) -> None:
        workflow_service.add_artifact(
            db,
            task_id,
            artifact_type=artifact_type,
            artifact_ref_type='projects',
            artifact_ref_id=project_id,
            role='output',
            snapshot_json=snapshot_json,
        )

    def _record_progress(
        self,
        db: Session,
        *,
        task_id: int,
        project_id: int,
        step_key: str,
        label: str,
        status: str,
        message: str,
        related_paper_ids: list[int],
    ) -> None:
        workflow_service.add_artifact(
            db,
            task_id,
            artifact_type='project_action_step',
            artifact_ref_type='projects',
            artifact_ref_id=project_id,
            role='progress',
            snapshot_json={
                'step_key': step_key,
                'label': label,
                'status': status,
                'message': message,
                'related_paper_ids': related_paper_ids,
            },
        )

    async def _ensure_summary(self, db: Session, paper: PaperRecord, task_id: int, project_id: int) -> SummaryRecord:
        existing = db.execute(
            select(SummaryRecord).where(SummaryRecord.paper_id == paper.id).order_by(desc(SummaryRecord.created_at))
        ).scalars().first()
        if existing is not None:
            return existing

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
            task_id,
            artifact_type='summary',
            artifact_ref_type='summaries',
            artifact_ref_id=record.id,
            role='output',
            snapshot_json={'summary_type': 'quick', 'project_id': project_id},
        )
        return record

    def _select_project_links(self, db: Session, project_id: int, paper_ids: list[int]) -> list[ResearchProjectPaperRecord]:
        stmt = select(ResearchProjectPaperRecord).where(ResearchProjectPaperRecord.project_id == project_id)
        if paper_ids:
            stmt = stmt.where(ResearchProjectPaperRecord.paper_id.in_(paper_ids))
        stmt = stmt.order_by(ResearchProjectPaperRecord.sort_order.asc(), ResearchProjectPaperRecord.created_at.asc())
        return db.execute(stmt).scalars().all()

    def _build_evidence_blueprints(self, *, paper: PaperRecord, summary: SummaryRecord, instruction: str) -> list[dict[str, str]]:
        claim_text = summary.contributions_en or _first_sentence(summary.content_en or paper.abstract_en, 220)
        method_text = summary.method_en or _extract_line(summary.content_en, ['method', 'approach', 'architecture'], _first_sentence(paper.abstract_en, 220))
        limitation_text = summary.limitations_en or summary.future_work_en or 'Review the full paper for explicit limitations and experimental caveats.'
        result_text = _extract_line(summary.content_en, ['result', 'improve', 'outperform', 'accuracy', 'f1', 'bleu'], claim_text)
        items = [
            {'kind': 'claim', 'excerpt': claim_text, 'source_label': 'Summary contribution'},
            {'kind': 'method', 'excerpt': method_text, 'source_label': 'Summary method'},
            {'kind': 'result', 'excerpt': result_text, 'source_label': 'Summary result'},
            {'kind': 'limitation', 'excerpt': limitation_text, 'source_label': 'Summary limitation'},
        ]
        if instruction.strip():
            items.append(
                {
                    'kind': 'question',
                    'excerpt': f'When reviewing {paper.title_en}, focus on: {instruction.strip()}',
                    'source_label': 'Project instruction',
                }
            )
        return [item for item in items if item['excerpt'].strip()]

    def launch_action(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        action: str,
        paper_ids: list[int],
        instruction: str,
    ) -> TaskRecord:
        if action not in PROJECT_ACTION_TASK_TYPES:
            raise ValueError('Unsupported project action')
        links = self._select_project_links(db, project.id, paper_ids)
        if not links:
            if action == 'extract_evidence':
                raise ValueError('Select at least one paper in this project before extracting evidence')
            if action == 'generate_compare_table':
                raise ValueError('Add papers to the project before generating a comparison table')
            raise ValueError('Add papers to the project before drafting a literature review')

        selected_ids = [link.paper_id for link in links]
        task = workflow_service.create_task(
            db,
            task_type=PROJECT_ACTION_TASK_TYPES[action],
            input_json={
                'action': action,
                'project_id': project.id,
                'paper_ids': selected_ids,
                'instruction': instruction,
            },
            status='running',
        )
        self._record_project_artifact(
            db,
            task.id,
            project.id,
            'project_action',
            {'action': action, 'instruction': instruction, 'paper_ids': selected_ids},
        )
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='screening_papers',
            label='筛选项目论文',
            status='completed',
            message=f'已使用该项目下关联的 {len(selected_ids)} 篇论文。',
            related_paper_ids=selected_ids,
        )
        return task

    async def execute_task(self, task_id: int) -> None:
        try:
            with SessionLocal() as db:
                task = db.get(TaskRecord, task_id)
                if task is None:
                    return
                payload = self._parse_task_json(task.input_json)
                project_id = int(payload.get('project_id') or 0)
                action = str(payload.get('action') or '')
                paper_ids = [int(item) for item in payload.get('paper_ids', [])]
                instruction = str(payload.get('instruction') or '')
                project = self.get_or_404(db, project_id)
                links = self._select_project_links(db, project.id, paper_ids)
                if not links:
                    raise ValueError('Selected project papers are no longer available')

                if action == 'extract_evidence':
                    output_json = await self._execute_extract_evidence(
                        db,
                        task=task,
                        project=project,
                        links=links,
                        instruction=instruction,
                    )
                elif action == 'generate_compare_table':
                    output_json = await self._execute_generate_compare_table(
                        db,
                        task=task,
                        project=project,
                        links=links,
                        instruction=instruction,
                    )
                elif action == 'draft_literature_review':
                    output_json = await self._execute_draft_literature_review(
                        db,
                        task=task,
                        project=project,
                        links=links,
                        instruction=instruction,
                    )
                else:
                    raise ValueError(f'Unsupported project action: {action}')

                self.touch_project(db, project)
                workflow_service.update_task(db, task, status='completed', output_json=output_json)
        except Exception as exc:
            with SessionLocal() as db:
                task = db.get(TaskRecord, task_id)
                if task is not None and task.status not in PROJECT_TERMINAL_TASK_STATUSES:
                    workflow_service.update_task(db, task, status='failed', error_log=str(exc), output_json={'error': str(exc)})

    def mark_interrupted_project_tasks_failed(self, db: Session) -> int:
        rows = db.execute(
            select(TaskRecord)
            .join(TaskArtifactRecord, TaskArtifactRecord.task_id == TaskRecord.id)
            .where(TaskArtifactRecord.artifact_ref_type == 'projects')
            .where(TaskRecord.status == 'running')
            .order_by(TaskRecord.id.asc())
            .distinct()
        ).scalars().all()
        for row in rows:
            workflow_service.update_task(
                db,
                row,
                status='failed',
                error_log='interrupted_by_backend_restart',
                output_json={'error': 'interrupted_by_backend_restart'},
            )
        return len(rows)

    async def _execute_extract_evidence(
        self,
        db: Session,
        *,
        task: TaskRecord,
        project: ResearchProjectRecord,
        links: list[ResearchProjectPaperRecord],
        instruction: str,
    ) -> dict[str, Any]:
        selected_ids = [link.paper_id for link in links]
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='ensuring_summaries',
            label='补齐摘要',
            status='running',
            message='正在检查可复用的论文摘要。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()
        summaries: list[tuple[ResearchProjectPaperRecord, SummaryRecord]] = []
        for link in links:
            summary = await self._ensure_summary(db, link.paper, task.id, project.id)
            summaries.append((link, summary))
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='ensuring_summaries',
            label='补齐摘要',
            status='completed',
            message='所选论文都已具备可用摘要。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='extracting_evidence',
            label='提取证据',
            status='running',
            message='正在生成项目证据卡。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()

        existing = db.execute(
            select(ResearchProjectEvidenceItemRecord).where(ResearchProjectEvidenceItemRecord.project_id == project.id)
        ).scalars().all()
        seen = {(item.paper_id, item.kind, item.excerpt) for item in existing}
        created_ids: list[int] = []
        for link, summary in summaries:
            for blueprint in self._build_evidence_blueprints(paper=link.paper, summary=summary, instruction=instruction):
                dedupe_key = (link.paper_id, blueprint['kind'], blueprint['excerpt'])
                if dedupe_key in seen:
                    continue
                item = self.create_evidence(
                    db,
                    project=project,
                    paper_id=link.paper_id,
                    summary_id=summary.id,
                    paragraph_id=None,
                    kind=blueprint['kind'],
                    excerpt=blueprint['excerpt'],
                    note_text='',
                    source_label=blueprint['source_label'],
                )
                seen.add(dedupe_key)
                created_ids.append(item.id)
                workflow_service.add_artifact(
                    db,
                    task.id,
                    artifact_type='project_evidence',
                    artifact_ref_type='research_project_evidence_items',
                    artifact_ref_id=item.id,
                    role='output',
                    snapshot_json={'project_id': project.id, 'kind': item.kind},
                )
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='extracting_evidence',
            label='提取证据',
            status='completed',
            message=f'已创建 {len(created_ids)} 张新证据卡。',
            related_paper_ids=selected_ids,
        )
        return {'created_evidence_ids': created_ids}

    async def _execute_generate_compare_table(
        self,
        db: Session,
        *,
        task: TaskRecord,
        project: ResearchProjectRecord,
        links: list[ResearchProjectPaperRecord],
        instruction: str,
    ) -> dict[str, Any]:
        selected_ids = [link.paper_id for link in links]
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='ensuring_summaries',
            label='补齐摘要',
            status='running',
            message='正在检查生成对比表前的摘要覆盖情况。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()
        summaries: list[tuple[ResearchProjectPaperRecord, SummaryRecord, PaperResearchStateRecord | None, ReproductionRecord | None]] = []
        for link in links:
            summary = await self._ensure_summary(db, link.paper, task.id, project.id)
            state = self._get_research_state(db, link.paper_id)
            reproductions = self._get_reproduction_rows(db, link.paper_id)
            summaries.append((link, summary, state, reproductions[0] if reproductions else None))
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='ensuring_summaries',
            label='补齐摘要',
            status='completed',
            message='对比表所需摘要已准备完成。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='building_compare_table',
            label='生成对比表',
            status='running',
            message='正在整理并排对比所需的结构化条目。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()

        rows = []
        for link, summary, state, latest_reproduction in summaries:
            rows.append(
                {
                    'Paper': link.paper.title_en,
                    'Research Question': summary.problem_en or project.research_question,
                    'Method': summary.method_en or _first_sentence(summary.content_en or link.paper.abstract_en),
                    'Dataset / Setting': _extract_line(
                        summary.content_en or link.paper.abstract_en,
                        ['dataset', 'benchmark', 'setting', 'experiment'],
                        'See abstract / summary',
                    ),
                    'Metrics': _extract_line(
                        summary.content_en or link.paper.abstract_en,
                        ['metric', 'accuracy', 'f1', 'bleu', 'rouge', 'score'],
                        'See summary',
                    ),
                    'Main Result': summary.contributions_en or _first_sentence(summary.content_en or link.paper.abstract_en, 220),
                    'Limitations': summary.limitations_en or summary.future_work_en or 'Review full paper for limitations.',
                    'Reproduction Value': _repro_value_label(state, latest_reproduction),
                    'User Note': '',
                }
            )

        output = db.execute(
            select(ResearchProjectOutputRecord)
            .where(ResearchProjectOutputRecord.project_id == project.id)
            .where(ResearchProjectOutputRecord.output_type == 'compare_table')
            .order_by(desc(ResearchProjectOutputRecord.updated_at))
        ).scalars().first()
        payload = {'columns': COMPARE_COLUMNS, 'rows': rows, 'instruction': instruction}
        if output is None:
            output = ResearchProjectOutputRecord(
                project_id=project.id,
                output_type='compare_table',
                title=f'{project.title} Comparison Table',
                content_json=json.dumps(payload, ensure_ascii=False),
                content_markdown='',
                status='draft',
            )
            db.add(output)
            db.commit()
            db.refresh(output)
        else:
            output = self.update_output(db, output, content_json=payload, title=f'{project.title} Comparison Table')

        workflow_service.add_artifact(
            db,
            task.id,
            artifact_type='project_output',
            artifact_ref_type='research_project_outputs',
            artifact_ref_id=output.id,
            role='output',
            snapshot_json={'project_id': project.id, 'output_type': 'compare_table'},
        )
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='building_compare_table',
            label='生成对比表',
            status='completed',
            message='对比表已生成，可继续编辑。',
            related_paper_ids=selected_ids,
        )
        return {'project_output_id': output.id}

    async def _execute_draft_literature_review(
        self,
        db: Session,
        *,
        task: TaskRecord,
        project: ResearchProjectRecord,
        links: list[ResearchProjectPaperRecord],
        instruction: str,
    ) -> dict[str, Any]:
        selected_ids = [link.paper_id for link in links]
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='ensuring_summaries',
            label='补齐摘要',
            status='running',
            message='正在检查起草综述前的摘要覆盖情况。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()
        summaries: list[tuple[ResearchProjectPaperRecord, SummaryRecord]] = []
        for link in links:
            summary = await self._ensure_summary(db, link.paper, task.id, project.id)
            summaries.append((link, summary))
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='ensuring_summaries',
            label='补齐摘要',
            status='completed',
            message='所选论文的摘要覆盖已完成。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='drafting_review',
            label='起草综述',
            status='running',
            message='正在基于项目证据与摘要起草综述。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()

        evidence_rows = db.execute(
            select(ResearchProjectEvidenceItemRecord)
            .where(ResearchProjectEvidenceItemRecord.project_id == project.id)
            .order_by(ResearchProjectEvidenceItemRecord.sort_order.asc(), ResearchProjectEvidenceItemRecord.created_at.asc())
        ).scalars().all()
        evidence_by_paper = {paper_id: [] for paper_id in selected_ids}
        for item in evidence_rows:
            if item.paper_id in evidence_by_paper:
                evidence_by_paper[item.paper_id].append(item)

        paper_comparison_lines: list[str] = []
        gap_lines: list[str] = []
        next_step_lines: list[str] = []
        evidence_lines: list[str] = []
        for link, summary in summaries:
            paper_comparison_lines.append(
                f"- **{link.paper.title_en}**: "
                f"{summary.contributions_en or _first_sentence(summary.content_en or link.paper.abstract_en, 220)} "
                f"Method: {summary.method_en or _first_sentence(link.paper.abstract_en, 140)}"
            )
            limitation = summary.limitations_en or summary.future_work_en or 'The summary does not expose clear limitations yet.'
            gap_lines.append(f"- **{link.paper.title_en}**: {limitation}")
            next_step_lines.append(f"- Re-check {link.paper.title_en} for datasets, metrics, and reproducibility details.")
            paper_evidence = evidence_by_paper.get(link.paper_id) or []
            if paper_evidence:
                for item in paper_evidence[:3]:
                    evidence_lines.append(f"- **{link.paper.title_en}** [{item.kind}]: {item.excerpt}")
            else:
                evidence_lines.append(
                    f"- **{link.paper.title_en}**: "
                    f"{summary.contributions_en or _first_sentence(summary.content_en or link.paper.abstract_en, 220)}"
                )

        if instruction.strip():
            next_step_lines.insert(0, f"- Prioritize the following reviewer request: {instruction.strip()}")

        markdown = '\n\n'.join(
            [
                '## Problem Framing\n'
                + (project.research_question.strip() or 'This project compares a focused set of papers around a single research question.')
                + (f'\n\nProject goal: {project.goal.strip()}' if project.goal.strip() else ''),
                '## Paper Comparison\n' + ('\n'.join(paper_comparison_lines) if paper_comparison_lines else '- No papers selected.'),
                '## Evidence Highlights\n' + ('\n'.join(evidence_lines) if evidence_lines else '- No evidence cards yet.'),
                '## Gaps and Open Questions\n' + ('\n'.join(gap_lines) if gap_lines else '- No open questions captured yet.'),
                '## Next Steps\n' + ('\n'.join(next_step_lines) if next_step_lines else '- Continue curating papers and evidence.'),
            ]
        )

        output = db.execute(
            select(ResearchProjectOutputRecord)
            .where(ResearchProjectOutputRecord.project_id == project.id)
            .where(ResearchProjectOutputRecord.output_type == 'literature_review')
            .order_by(desc(ResearchProjectOutputRecord.updated_at))
        ).scalars().first()
        content_json = {'paper_ids': selected_ids, 'instruction': instruction, 'evidence_count': len(evidence_rows)}
        if output is None:
            output = ResearchProjectOutputRecord(
                project_id=project.id,
                output_type='literature_review',
                title=f'{project.title} Literature Review',
                content_json=json.dumps(content_json, ensure_ascii=False),
                content_markdown=markdown,
                status='draft',
            )
            db.add(output)
            db.commit()
            db.refresh(output)
        else:
            output = self.update_output(
                db,
                output,
                title=f'{project.title} Literature Review',
                content_json=content_json,
                content_markdown=markdown,
            )

        workflow_service.add_artifact(
            db,
            task.id,
            artifact_type='project_output',
            artifact_ref_type='research_project_outputs',
            artifact_ref_id=output.id,
            role='output',
            snapshot_json={'project_id': project.id, 'output_type': 'literature_review'},
        )
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='drafting_review',
            label='起草综述',
            status='completed',
            message='综述稿已生成，可继续编辑。',
            related_paper_ids=selected_ids,
        )
        return {'project_output_id': output.id}


project_service = ProjectService()
