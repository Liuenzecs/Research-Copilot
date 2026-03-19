from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.db.idea_record import IdeaRecord
from app.models.db.note_record import NoteRecord
from app.models.db.paper_record import PaperRecord, PaperResearchStateRecord
from app.models.db.paper_annotation_record import PaperAnnotationRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.repo_record import RepoRecord
from app.models.db.reproduction_record import ReproductionRecord
from app.models.db.research_project_record import (
    ResearchProjectEvidenceItemRecord,
    ResearchProjectOutputRecord,
    ResearchProjectPaperRecord,
    ResearchProjectRecord,
    ResearchProjectSavedSearchCandidateRecord,
)
from app.models.db.summary_record import SummaryRecord
from app.models.db.task_artifact_record import TaskArtifactRecord
from app.models.db.task_record import TaskRecord
from app.models.schemas.paper import PaperOut
from app.models.schemas.project import (
    LinkedReflectionArtifactOut,
    LinkedReproductionArtifactOut,
    LinkedSummaryArtifactOut,
    ProjectActivityEventOut,
    ProjectDuplicateGroupOut,
    ProjectDuplicateListResponse,
    ProjectDuplicatePaperOut,
    ProjectDuplicateSummaryOut,
    ResearchProjectEvidenceOut,
    ResearchProjectListItemOut,
    ResearchProjectLinkedArtifactsOut,
    ResearchProjectOut,
    ResearchProjectOutputOut,
    ResearchProjectPaperBatchStateResponse,
    ResearchProjectPaperOut,
    ResearchProjectSmartViewOut,
    ResearchProjectTaskDetailOut,
    ResearchProjectTaskOut,
    ResearchProjectTaskProgressStepOut,
    ResearchProjectWorkspaceResponse,
)
from app.services.paper_search.base import SearchPaper
from app.services.paper_search.normalizer import _normalize as search_normalize
from app.services.paper_search.openalex import OpenAlexSearchService
from app.services.paper_search.semantic_scholar import SemanticScholarSearchService
from app.services.memory.service import memory_service
from app.services.pdf.downloader import pdf_downloader
from app.services.pdf.parser import pdf_parser
from app.services.project.activity import project_activity_service
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
    'fetch_pdfs': 'project_fetch_pdfs',
    'refresh_metadata': 'project_refresh_metadata',
    'ensure_summaries': 'project_ensure_summaries',
}

PROJECT_TERMINAL_TASK_STATUSES = {'completed', 'failed', 'archived'}

SMART_VIEW_LABELS = {
    'all_papers': '全部论文',
    'missing_pdf': '缺 PDF',
    'pending_summary': '待摘要',
    'pending_evidence': '待证据',
    'pending_writing_citation': '待写作引用',
    'high_reproduction_value': '高复现价值',
    'reportable': '可汇报',
    'risky': '有风险',
    'duplicate_candidates': '重复待合并',
}

STEP_LABELS = {
    'screening_papers': '筛选项目论文',
    'ensuring_summaries': '补齐摘要',
    'extracting_evidence': '提取证据',
    'building_compare_table': '生成对比表',
    'drafting_review': '起草综述',
    'fetching_pdfs': '补全 PDF',
    'refreshing_metadata': '刷新元数据与可信度',
}

INTEGRITY_PRIORITY = {
    'normal': 0,
    'updated': 1,
    'warning': 2,
    'error': 3,
    'retracted': 4,
}

REPRO_PRIORITY = {'none': 0, 'low': 1, 'medium': 2, 'high': 3}


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


def _json_object(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


class ProjectService:
    def __init__(self) -> None:
        self.openalex = OpenAlexSearchService()
        self.semantic_scholar = SemanticScholarSearchService()

    async def _maybe_pause_for_progress(self) -> None:
        delay_seconds = _project_task_step_delay_seconds()
        if delay_seconds > 0:
            await asyncio.sleep(delay_seconds)

    def _canonical_paper(self, db: Session, row: PaperRecord | None) -> PaperRecord | None:
        current = row
        visited: set[int] = set()
        while current is not None and current.merged_into_paper_id and current.id not in visited:
            visited.add(current.id)
            current = db.get(PaperRecord, current.merged_into_paper_id)
        return current

    def _canonical_paper_id(self, db: Session, paper_id: int | None) -> int | None:
        if not paper_id:
            return None
        row = self._canonical_paper(db, db.get(PaperRecord, paper_id))
        return row.id if row is not None else None

    def _ensure_research_state(self, db: Session, paper_id: int) -> PaperResearchStateRecord:
        state = self._get_research_state(db, paper_id)
        if state is not None:
            return state
        state = PaperResearchStateRecord(paper_id=paper_id)
        db.add(state)
        db.commit()
        db.refresh(state)
        return state

    def _log_activity(
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
    ) -> None:
        project_activity_service.record(
            db,
            project_id=project_id,
            event_type=event_type,
            title=title,
            message=message,
            ref_type=ref_type,
            ref_id=ref_id,
            metadata=metadata or {},
        )

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

    def to_project_list_item_out(
        self,
        row: ResearchProjectRecord,
        *,
        paper_count: int = 0,
        evidence_count: int = 0,
        output_count: int = 0,
    ) -> ResearchProjectListItemOut:
        return ResearchProjectListItemOut(
            **self.to_project_out(row).model_dump(),
            paper_count=paper_count,
            evidence_count=evidence_count,
            output_count=output_count,
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
            doi=row.doi,
            paper_url=row.paper_url,
            openalex_id=row.openalex_id,
            semantic_scholar_id=row.semantic_scholar_id,
            citation_count=row.citation_count,
            reference_count=row.reference_count,
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
        self._log_activity(
            db,
            project_id=row.id,
            event_type='project_created',
            title='创建项目',
            message=f'以研究问题“{_compact(row.research_question, 80)}”创建了项目工作台。',
            ref_type='projects',
            ref_id=row.id,
        )
        return row

    def list_projects(self, db: Session) -> list[ResearchProjectRecord]:
        return db.execute(
            select(ResearchProjectRecord).order_by(desc(ResearchProjectRecord.last_opened_at), desc(ResearchProjectRecord.updated_at))
        ).scalars().all()

    def list_project_list_items(self, db: Session) -> list[ResearchProjectListItemOut]:
        rows = self.list_projects(db)
        if not rows:
            return []

        project_ids = [row.id for row in rows]
        paper_counts = {
            int(project_id): int(total)
            for project_id, total in db.execute(
                select(ResearchProjectPaperRecord.project_id, func.count(ResearchProjectPaperRecord.id))
                .where(ResearchProjectPaperRecord.project_id.in_(project_ids))
                .group_by(ResearchProjectPaperRecord.project_id)
            ).all()
        }
        evidence_counts = {
            int(project_id): int(total)
            for project_id, total in db.execute(
                select(ResearchProjectEvidenceItemRecord.project_id, func.count(ResearchProjectEvidenceItemRecord.id))
                .where(ResearchProjectEvidenceItemRecord.project_id.in_(project_ids))
                .group_by(ResearchProjectEvidenceItemRecord.project_id)
            ).all()
        }
        output_counts = {
            int(project_id): int(total)
            for project_id, total in db.execute(
                select(ResearchProjectOutputRecord.project_id, func.count(ResearchProjectOutputRecord.id))
                .where(ResearchProjectOutputRecord.project_id.in_(project_ids))
                .group_by(ResearchProjectOutputRecord.project_id)
            ).all()
        }

        return [
            self.to_project_list_item_out(
                row,
                paper_count=paper_counts.get(row.id, 0),
                evidence_count=evidence_counts.get(row.id, 0),
                output_count=output_counts.get(row.id, 0),
            )
            for row in rows
        ]

    def update_project(self, db: Session, row: ResearchProjectRecord, **changes: Any) -> ResearchProjectRecord:
        updated_fields: list[str] = []
        if changes.get('title') is not None:
            value = changes['title'].strip() or row.title
            if value != row.title:
                row.title = value
                updated_fields.append('title')
        if changes.get('research_question') is not None:
            normalized = changes['research_question'].strip()
            if normalized and normalized != row.research_question:
                row.research_question = normalized
                updated_fields.append('research_question')
        if changes.get('goal') is not None:
            value = changes['goal'].strip()
            if value != row.goal:
                row.goal = value
                updated_fields.append('goal')
        if changes.get('status') is not None:
            if changes['status'] != row.status:
                row.status = changes['status']
                updated_fields.append('status')
        if changes.get('seed_query') is not None:
            value = changes['seed_query'].strip()
            if value != row.seed_query:
                row.seed_query = value
                updated_fields.append('seed_query')
        db.add(row)
        db.commit()
        db.refresh(row)
        if updated_fields:
            self._log_activity(
                db,
                project_id=row.id,
                event_type='project_updated',
                title='更新项目',
                message=f'更新了项目设置：{", ".join(updated_fields)}。',
                ref_type='projects',
                ref_id=row.id,
                metadata={'updated_fields': updated_fields},
            )
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
        canonical_paper_id = self._canonical_paper_id(db, paper_id) or paper_id
        paper = db.get(PaperRecord, canonical_paper_id)
        if paper is None:
            raise ValueError('Paper not found')

        existing = db.execute(
            select(ResearchProjectPaperRecord)
            .where(ResearchProjectPaperRecord.project_id == project.id)
            .where(ResearchProjectPaperRecord.paper_id == canonical_paper_id)
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
            paper_id=canonical_paper_id,
            sort_order=next_order,
            pinned=False,
            selection_reason=(selection_reason or '').strip(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        self._log_activity(
            db,
            project_id=project.id,
            event_type='paper_added',
            title='加入项目论文',
            message=f'将《{_compact(paper.title_en, 80)}》加入了项目论文池。',
            ref_type='papers',
            ref_id=paper.id,
            metadata={'selection_reason': row.selection_reason},
        )
        return row

    def remove_paper(self, db: Session, *, project: ResearchProjectRecord, project_paper_id: int) -> None:
        row = db.get(ResearchProjectPaperRecord, project_paper_id)
        if row is None or row.project_id != project.id:
            raise ValueError('Project paper not found')
        paper_id = row.paper_id
        paper_title = row.paper.title_en if row.paper is not None else f'paper#{paper_id}'
        db.delete(row)
        db.commit()
        self._log_activity(
            db,
            project_id=project.id,
            event_type='paper_removed',
            title='移出项目论文',
            message=f'将《{_compact(paper_title, 80)}》移出了项目论文池。',
            ref_type='papers',
            ref_id=paper_id,
        )

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
        canonical_paper_id = self._canonical_paper_id(db, paper_id) if paper_id else None

        if sort_order is None:
            last_item = db.execute(
                select(ResearchProjectEvidenceItemRecord)
                .where(ResearchProjectEvidenceItemRecord.project_id == project.id)
                .order_by(desc(ResearchProjectEvidenceItemRecord.sort_order))
            ).scalars().first()
            sort_order = (last_item.sort_order + 1) if last_item is not None else 1

        row = ResearchProjectEvidenceItemRecord(
            project_id=project.id,
            paper_id=canonical_paper_id,
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
        self._log_activity(
            db,
            project_id=project.id,
            event_type='evidence_created',
            title='创建证据卡',
            message=f'新增了一张 {row.kind} 类型证据卡。',
            ref_type='research_project_evidence_items',
            ref_id=row.id,
            metadata={'paper_id': row.paper_id, 'source_label': row.source_label},
        )
        return row

    def update_evidence(self, db: Session, row: ResearchProjectEvidenceItemRecord, **changes: Any) -> ResearchProjectEvidenceItemRecord:
        updated_fields: list[str] = []
        if changes.get('kind') is not None:
            if changes['kind'] != row.kind:
                row.kind = changes['kind']
                updated_fields.append('kind')
        if changes.get('excerpt') is not None:
            normalized = changes['excerpt'].strip()
            if not normalized:
                raise ValueError('Evidence excerpt is required')
            if normalized != row.excerpt:
                row.excerpt = normalized
                updated_fields.append('excerpt')
        if changes.get('note_text') is not None:
            value = changes['note_text'].strip()
            if value != row.note_text:
                row.note_text = value
                updated_fields.append('note_text')
        if changes.get('source_label') is not None:
            value = changes['source_label'].strip()
            if value != row.source_label:
                row.source_label = value
                updated_fields.append('source_label')
        if changes.get('sort_order') is not None:
            value = int(changes['sort_order'])
            if value != row.sort_order:
                row.sort_order = value
                updated_fields.append('sort_order')
        db.add(row)
        db.commit()
        db.refresh(row)
        if updated_fields:
            self._log_activity(
                db,
                project_id=row.project_id,
                event_type='evidence_updated',
                title='更新证据卡',
                message=f'更新了证据卡字段：{", ".join(updated_fields)}。',
                ref_type='research_project_evidence_items',
                ref_id=row.id,
                metadata={'updated_fields': updated_fields},
            )
        return row

    def delete_evidence(self, db: Session, row: ResearchProjectEvidenceItemRecord) -> None:
        project_id = row.project_id
        evidence_id = row.id
        paper_id = row.paper_id
        db.delete(row)
        db.commit()
        self._log_activity(
            db,
            project_id=project_id,
            event_type='evidence_deleted',
            title='删除证据卡',
            message='删除了一张项目证据卡。',
            ref_type='research_project_evidence_items',
            ref_id=evidence_id,
            metadata={'paper_id': paper_id},
        )

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
        self._log_activity(
            db,
            project_id=project.id,
            event_type='evidence_reordered',
            title='重排证据板',
            message=f'重新排列了 {len(ordered_ids)} 张证据卡。',
            ref_type='projects',
            ref_id=project.id,
            metadata={'evidence_ids': ordered_ids},
        )
        return [by_id[evidence_id] for evidence_id in ordered_ids]

    def update_output(self, db: Session, row: ResearchProjectOutputRecord, *, record_activity: bool = True, **changes: Any) -> ResearchProjectOutputRecord:
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
        if record_activity:
            self._log_activity(
                db,
                project_id=row.project_id,
                event_type='output_updated',
                title='更新成果物',
                message=f'更新了 {row.output_type} 内容。',
                ref_type='research_project_outputs',
                ref_id=row.id,
                metadata={'output_type': row.output_type},
            )
        return row

    def _get_summary_rows(self, db: Session, paper_id: int) -> list[SummaryRecord]:
        paper_id = self._canonical_paper_id(db, paper_id) or paper_id
        return db.execute(
            select(SummaryRecord).where(SummaryRecord.paper_id == paper_id).order_by(desc(SummaryRecord.created_at))
        ).scalars().all()

    def _get_reflection_rows(self, db: Session, paper_id: int, summary_ids: list[int]) -> list[ReflectionRecord]:
        paper_id = self._canonical_paper_id(db, paper_id) or paper_id
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
        paper_id = self._canonical_paper_id(db, paper_id) or paper_id
        return db.execute(
            select(ReproductionRecord).where(ReproductionRecord.paper_id == paper_id).order_by(desc(ReproductionRecord.updated_at))
        ).scalars().all()

    def _get_research_state(self, db: Session, paper_id: int) -> PaperResearchStateRecord | None:
        paper_id = self._canonical_paper_id(db, paper_id) or paper_id
        return db.execute(select(PaperResearchStateRecord).where(PaperResearchStateRecord.paper_id == paper_id)).scalar_one_or_none()

    def _to_project_paper_out(self, db: Session, link: ResearchProjectPaperRecord) -> ResearchProjectPaperOut:
        summaries = self._get_summary_rows(db, link.paper_id)
        summary_ids = [item.id for item in summaries]
        reflections = self._get_reflection_rows(db, link.paper_id, summary_ids)
        reproductions = self._get_reproduction_rows(db, link.paper_id)
        latest_reproduction = reproductions[0] if reproductions else None
        evidence_count = db.execute(
            select(func.count(ResearchProjectEvidenceItemRecord.id))
            .where(ResearchProjectEvidenceItemRecord.project_id == link.project_id)
            .where(ResearchProjectEvidenceItemRecord.paper_id == link.paper_id)
        ).scalar_one()
        report_worthy_count = sum(1 for row in reflections if row.is_report_worthy)
        paper = self._canonical_paper(db, link.paper) or link.paper
        return ResearchProjectPaperOut(
            id=link.id,
            project_id=link.project_id,
            paper=self.to_paper_out(paper),
            sort_order=link.sort_order,
            pinned=link.pinned,
            selection_reason=link.selection_reason,
            is_downloaded=bool(paper.pdf_local_path),
            summary_count=len(summaries),
            reflection_count=len(reflections),
            reproduction_count=len(reproductions),
            latest_summary_id=summaries[0].id if summaries else None,
            latest_reflection_id=reflections[0].id if reflections else None,
            latest_reproduction_id=latest_reproduction.id if latest_reproduction else None,
            latest_reproduction_status=latest_reproduction.status if latest_reproduction else '',
            evidence_count=int(evidence_count or 0),
            report_worthy_count=report_worthy_count,
            pdf_status=paper.pdf_status or ('downloaded' if paper.pdf_local_path else 'missing'),
            pdf_status_message=paper.pdf_status_message or '',
            pdf_last_checked_at=paper.pdf_last_checked_at,
            integrity_status=paper.integrity_status or 'warning',
            integrity_note=paper.integrity_note or '',
            metadata_last_checked_at=paper.metadata_last_checked_at,
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

    def _normalize_review_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload or {})
        if not isinstance(normalized.get('citations'), list):
            normalized['citations'] = []
        if not isinstance(normalized.get('blocks'), list):
            normalized['blocks'] = []
        if not isinstance(normalized.get('inserted_evidence_ids'), list):
            normalized['inserted_evidence_ids'] = []
        return normalized

    def _to_output_out(self, row: ResearchProjectOutputRecord) -> ResearchProjectOutputOut:
        payload = _json_object(row.content_json)
        if row.output_type == 'literature_review':
            payload = self._normalize_review_json(payload)
        return ResearchProjectOutputOut(
            id=row.id,
            project_id=row.project_id,
            output_type=row.output_type,
            title=row.title,
            content_json=payload,
            content_markdown=row.content_markdown,
            status=row.status,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _parse_task_json(self, raw: str | None) -> dict[str, Any]:
        return _json_object(raw)

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
            snapshot = _json_object(row.snapshot_json)
            key = str(snapshot.get('step_key') or '')
            latest[key] = ResearchProjectTaskProgressStepOut(
                step_key=key,
                label=str(snapshot.get('label') or STEP_LABELS.get(key, key)),
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

    def _review_output_row(self, db: Session, project_id: int) -> ResearchProjectOutputRecord | None:
        return db.execute(
            select(ResearchProjectOutputRecord)
            .where(ResearchProjectOutputRecord.project_id == project_id)
            .where(ResearchProjectOutputRecord.output_type == 'literature_review')
            .order_by(desc(ResearchProjectOutputRecord.updated_at))
        ).scalars().first()

    def _paper_ids_with_review_citations(self, output: ResearchProjectOutputRecord | None) -> set[int]:
        if output is None:
            return set()
        payload = self._normalize_review_json(_json_object(output.content_json))
        return {
            int(item.get('paper_id'))
            for item in payload.get('citations', [])
            if isinstance(item, dict) and int(item.get('paper_id') or 0) > 0
        }

    def _duplicate_paper_out(self, db: Session, project_id: int, paper: PaperRecord) -> ProjectDuplicatePaperOut:
        summary_count = db.execute(select(func.count(SummaryRecord.id)).where(SummaryRecord.paper_id == paper.id)).scalar_one()
        reflection_count = db.execute(
            select(func.count(ReflectionRecord.id)).where(ReflectionRecord.related_paper_id == paper.id)
        ).scalar_one()
        reproduction_count = db.execute(
            select(func.count(ReproductionRecord.id)).where(ReproductionRecord.paper_id == paper.id)
        ).scalar_one()
        evidence_count = db.execute(
            select(func.count(ResearchProjectEvidenceItemRecord.id))
            .where(ResearchProjectEvidenceItemRecord.project_id == project_id)
            .where(ResearchProjectEvidenceItemRecord.paper_id == paper.id)
        ).scalar_one()
        is_in_project = db.execute(
            select(ResearchProjectPaperRecord.id)
            .where(ResearchProjectPaperRecord.project_id == project_id)
            .where(ResearchProjectPaperRecord.paper_id == paper.id)
        ).first() is not None
        return ProjectDuplicatePaperOut(
            paper=self.to_paper_out(paper),
            evidence_count=int(evidence_count or 0),
            summary_count=int(summary_count or 0),
            reflection_count=int(reflection_count or 0),
            reproduction_count=int(reproduction_count or 0),
            is_in_project=is_in_project,
            merged=bool(paper.merged_into_paper_id),
        )

    def _duplicate_groups(self, db: Session, project_id: int) -> list[ProjectDuplicateGroupOut]:
        paper_ids = [
            int(paper_id)
            for (paper_id,) in db.execute(
                select(ResearchProjectPaperRecord.paper_id).where(ResearchProjectPaperRecord.project_id == project_id)
            ).all()
        ]
        if len(paper_ids) < 2:
            return []

        rows = db.execute(select(PaperRecord).where(PaperRecord.id.in_(paper_ids))).scalars().all()
        rows_by_id = {row.id: row for row in rows}
        grouped: list[tuple[str, str, list[int]]] = []

        def collect(reason_key: str, value_fn) -> None:
            buckets: dict[str, list[int]] = {}
            for row in rows:
                value = value_fn(row)
                if not value:
                    continue
                buckets.setdefault(value, []).append(row.id)
            for value, ids in buckets.items():
                unique_ids = sorted(set(ids))
                if len(unique_ids) > 1:
                    grouped.append((reason_key, value, unique_ids))

        collect('doi', lambda row: row.doi.strip().lower())
        collect('openalex', lambda row: row.openalex_id.strip())
        collect('semantic_scholar', lambda row: row.semantic_scholar_id.strip())
        collect('normalized_title', lambda row: search_normalize(row.title_en))

        groups: list[ProjectDuplicateGroupOut] = []
        seen_sets: set[tuple[int, ...]] = set()
        for reason_key, value, ids in grouped:
            fingerprint = tuple(ids)
            if fingerprint in seen_sets:
                continue
            seen_sets.add(fingerprint)
            reason = {
                'doi': f'相同 DOI: {value}',
                'openalex': f'相同 OpenAlex ID: {value}',
                'semantic_scholar': f'相同 Semantic Scholar ID: {value}',
                'normalized_title': '标题规范化后相同',
            }[reason_key]
            groups.append(
                ProjectDuplicateGroupOut(
                    key=f'{reason_key}:{value}',
                    reason=reason,
                    papers=[self._duplicate_paper_out(db, project_id, rows_by_id[item_id]) for item_id in ids if item_id in rows_by_id],
                )
            )
        return groups

    def _duplicate_summary(self, groups: list[ProjectDuplicateGroupOut]) -> ProjectDuplicateSummaryOut:
        return ProjectDuplicateSummaryOut(
            group_count=len(groups),
            paper_count=sum(len(group.papers) for group in groups),
        )

    def _smart_views(
        self,
        db: Session,
        *,
        papers: list[ResearchProjectPaperOut],
        outputs: list[ResearchProjectOutputRecord],
        duplicate_groups: list[ProjectDuplicateGroupOut],
    ) -> list[ResearchProjectSmartViewOut]:
        review_output = next((item for item in outputs if item.output_type == 'literature_review'), None)
        cited_paper_ids = self._paper_ids_with_review_citations(review_output)
        duplicate_paper_ids = {paper.paper.id for group in duplicate_groups for paper in group.papers}
        high_repro_ids: set[int] = set()
        for item in papers:
            state = self._get_research_state(db, item.paper.id)
            if item.latest_reproduction_status in {'planned', 'in_progress', 'blocked'}:
                high_repro_ids.add(item.paper.id)
            elif state and REPRO_PRIORITY.get(state.repro_interest or 'none', 0) >= REPRO_PRIORITY['medium']:
                high_repro_ids.add(item.paper.id)

        counts = {
            'all_papers': len(papers),
            'missing_pdf': sum(1 for item in papers if item.pdf_status in {'missing', 'landing_page_only', 'error'}),
            'pending_summary': sum(1 for item in papers if item.summary_count == 0),
            'pending_evidence': sum(1 for item in papers if item.evidence_count == 0),
            'pending_writing_citation': sum(1 for item in papers if item.paper.id not in cited_paper_ids),
            'high_reproduction_value': len(high_repro_ids),
            'reportable': sum(1 for item in papers if item.report_worthy_count > 0 or item.evidence_count > 0),
            'risky': sum(1 for item in papers if item.integrity_status in {'warning', 'error', 'retracted'}),
            'duplicate_candidates': len(duplicate_paper_ids),
        }
        return [
            ResearchProjectSmartViewOut(key=key, label=label, count=counts.get(key, 0))
            for key, label in SMART_VIEW_LABELS.items()
        ]

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
        paper_items = [self._to_project_paper_out(db, link) for link in links]
        duplicate_groups = self._duplicate_groups(db, project.id)
        return ResearchProjectWorkspaceResponse(
            project=self.to_project_out(project),
            papers=paper_items,
            evidence_items=[self._to_evidence_out(item) for item in evidence_items],
            outputs=[self._to_output_out(item) for item in outputs],
            recent_tasks=self._recent_tasks(db, project.id),
            linked_existing_artifacts=[self._to_linked_artifacts_out(db, link) for link in links],
            smart_views=self._smart_views(db, papers=paper_items, outputs=outputs, duplicate_groups=duplicate_groups),
            activity_timeline_preview=project_activity_service.list_preview(db, project.id, limit=12),
            duplicate_summary=self._duplicate_summary(duplicate_groups),
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
        status: str,
        message: str,
        related_paper_ids: list[int],
        label: str | None = None,
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
                'label': label or STEP_LABELS.get(step_key, step_key),
                'status': status,
                'message': message,
                'related_paper_ids': related_paper_ids,
            },
        )

    def _create_summary_record(
        self,
        db: Session,
        *,
        paper: PaperRecord,
        task_id: int,
        project_id: int,
        provider_name: str,
        model_name: str,
        result: dict[str, str],
    ) -> SummaryRecord:
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
        self._log_activity(
            db,
            project_id=project_id,
            event_type='summary_created',
            title='补齐摘要',
            message=f'为《{_compact(paper.title_en, 80)}》补充了 quick summary。',
            ref_type='summaries',
            ref_id=record.id,
            metadata={'paper_id': paper.id},
        )
        return record

    async def _ensure_summary(self, db: Session, paper: PaperRecord, task_id: int, project_id: int) -> SummaryRecord:
        existing = db.execute(
            select(SummaryRecord).where(SummaryRecord.paper_id == paper.id).order_by(desc(SummaryRecord.created_at))
        ).scalars().first()
        if existing is not None:
            return existing

        body = pdf_parser.extract_text(paper.pdf_local_path) if paper.pdf_local_path else ''
        result, provider_name, model_name = await summarize_service.quick(paper.title_en, paper.abstract_en, body)
        return self._create_summary_record(
            db,
            paper=paper,
            task_id=task_id,
            project_id=project_id,
            provider_name=provider_name,
            model_name=model_name,
            result=result,
        )

    def _select_project_links(self, db: Session, project_id: int, paper_ids: list[int]) -> list[ResearchProjectPaperRecord]:
        stmt = select(ResearchProjectPaperRecord).where(ResearchProjectPaperRecord.project_id == project_id)
        resolved_ids = [item for item in {self._canonical_paper_id(db, paper_id) for paper_id in paper_ids} if item]
        if resolved_ids:
            stmt = stmt.where(ResearchProjectPaperRecord.paper_id.in_(resolved_ids))
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

    def _merge_search_paper_into_record(self, paper: PaperRecord, candidate: SearchPaper) -> bool:
        changed = False
        if candidate.title_en and candidate.title_en != paper.title_en:
            paper.title_en = candidate.title_en
            changed = True
        if candidate.abstract_en and len(candidate.abstract_en) > len(paper.abstract_en or ''):
            paper.abstract_en = candidate.abstract_en
            changed = True
        if candidate.authors and not paper.authors:
            paper.authors = candidate.authors
            changed = True
        if candidate.year and candidate.year != paper.year:
            paper.year = candidate.year
            changed = True
        if candidate.venue and not paper.venue:
            paper.venue = candidate.venue
            changed = True
        if candidate.doi and not paper.doi:
            paper.doi = candidate.doi
            changed = True
        if candidate.paper_url and not paper.paper_url:
            paper.paper_url = candidate.paper_url
            changed = True
        if candidate.openalex_id and not paper.openalex_id:
            paper.openalex_id = candidate.openalex_id
            changed = True
        if candidate.semantic_scholar_id and not paper.semantic_scholar_id:
            paper.semantic_scholar_id = candidate.semantic_scholar_id
            changed = True
        if candidate.citation_count and candidate.citation_count > (paper.citation_count or 0):
            paper.citation_count = candidate.citation_count
            changed = True
        if candidate.reference_count and candidate.reference_count > (paper.reference_count or 0):
            paper.reference_count = candidate.reference_count
            changed = True
        if candidate.pdf_url and not paper.pdf_url:
            paper.pdf_url = candidate.pdf_url
            changed = True
        if candidate.year and paper.published_at is None:
            paper.published_at = datetime(candidate.year, 1, 1, tzinfo=timezone.utc)
            changed = True
        return changed

    async def _fetch_pdf_for_paper(self, db: Session, paper: PaperRecord) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        if paper.pdf_local_path:
            path = Path(paper.pdf_local_path)
            if not path.is_absolute():
                path = (Path.cwd() / path).resolve()
            if path.exists() and path.is_file() and path.stat().st_size > 0:
                paper.pdf_status = 'downloaded'
                paper.pdf_status_message = 'PDF already available locally.'
                paper.pdf_last_checked_at = now
                db.add(paper)
                db.commit()
                db.refresh(paper)
                return {'paper_id': paper.id, 'status': paper.pdf_status, 'message': paper.pdf_status_message}

        pdf_url = paper.pdf_url or (f'https://arxiv.org/pdf/{paper.source_id}.pdf' if paper.source == 'arxiv' and paper.source_id else '')
        if not pdf_url:
            try:
                resolved = await self.openalex.resolve_work(paper)
                if resolved is None and paper.semantic_scholar_id:
                    resolved = await self.semantic_scholar.fetch_paper(paper.semantic_scholar_id)
                if resolved is not None:
                    self._merge_search_paper_into_record(paper, resolved)
                    pdf_url = paper.pdf_url or resolved.pdf_url
            except Exception:
                pdf_url = paper.pdf_url

        if pdf_url:
            try:
                local_path = await pdf_downloader.download(paper.id, paper.title_en, pdf_url, paper.source_id)
                paper.pdf_local_path = local_path
                paper.pdf_url = pdf_url
                paper.pdf_status = 'downloaded'
                paper.pdf_status_message = 'Downloaded PDF successfully.'
                paper.pdf_last_checked_at = now
                db.add(paper)
                db.commit()
                db.refresh(paper)
                return {'paper_id': paper.id, 'status': paper.pdf_status, 'message': paper.pdf_status_message}
            except Exception as exc:
                paper.pdf_status = 'error'
                paper.pdf_status_message = _compact(str(exc), 220) or 'PDF download failed.'
                paper.pdf_last_checked_at = now
                db.add(paper)
                db.commit()
                db.refresh(paper)
                return {'paper_id': paper.id, 'status': paper.pdf_status, 'message': paper.pdf_status_message}

        paper.pdf_status = 'landing_page_only' if paper.paper_url else 'missing'
        paper.pdf_status_message = 'Only landing page metadata is available.' if paper.paper_url else 'No PDF URL is available.'
        paper.pdf_last_checked_at = now
        db.add(paper)
        db.commit()
        db.refresh(paper)
        return {'paper_id': paper.id, 'status': paper.pdf_status, 'message': paper.pdf_status_message}

    async def _refresh_metadata_for_paper(self, db: Session, paper: PaperRecord) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        try:
            payload = await self.openalex.resolve_work_payload(paper)
            resolved = await self.openalex.resolve_work(paper)
            if resolved is None and paper.semantic_scholar_id:
                resolved = await self.semantic_scholar.fetch_paper(paper.semantic_scholar_id)
            changed = False
            if resolved is not None:
                changed = self._merge_search_paper_into_record(paper, resolved)
            is_retracted = bool(payload.get('is_retracted') or payload.get('retracted')) if isinstance(payload, dict) else False
            if is_retracted:
                paper.integrity_status = 'retracted'
                paper.integrity_note = 'OpenAlex marks this work as retracted.'
            elif resolved is None and payload is None:
                paper.integrity_status = 'error'
                paper.integrity_note = 'No public metadata source returned a match.'
            elif changed:
                paper.integrity_status = 'updated'
                paper.integrity_note = 'Metadata refreshed and updated from public sources.'
            elif paper.doi or paper.openalex_id or paper.semantic_scholar_id:
                paper.integrity_status = 'normal'
                paper.integrity_note = 'Metadata refreshed from public sources.'
            else:
                paper.integrity_status = 'warning'
                paper.integrity_note = 'Metadata refreshed, but persistent identifiers are still incomplete.'
        except Exception as exc:
            paper.integrity_status = 'error'
            paper.integrity_note = _compact(str(exc), 220) or 'Metadata refresh failed.'
        paper.metadata_last_checked_at = now
        if paper.pdf_local_path:
            paper.pdf_status = 'downloaded'
            paper.pdf_status_message = 'PDF already available locally.'
        elif paper.pdf_url and paper.pdf_status == 'missing':
            paper.pdf_status = 'remote_pdf'
            paper.pdf_status_message = 'Remote PDF is available.'
        db.add(paper)
        db.commit()
        db.refresh(paper)
        return {'paper_id': paper.id, 'status': paper.integrity_status, 'message': paper.integrity_note}

    def _create_review_output(self, db: Session, project: ResearchProjectRecord) -> ResearchProjectOutputRecord:
        row = ResearchProjectOutputRecord(
            project_id=project.id,
            output_type='literature_review',
            title=f'{project.title} Literature Review',
            content_json=json.dumps({'citations': [], 'blocks': [], 'inserted_evidence_ids': []}, ensure_ascii=False),
            content_markdown='',
            status='draft',
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def _citation_token(self, evidence: ResearchProjectEvidenceItemRecord) -> str:
        parts = [f'paper={evidence.paper_id or ""}', f'evidence={evidence.id}']
        if evidence.paragraph_id:
            parts.append(f'paragraph={evidence.paragraph_id}')
        if evidence.summary_id:
            parts.append(f'summary={evidence.summary_id}')
        return f'[RC-CITE {" ".join(parts)}]'

    def _insert_review_markdown(
        self,
        markdown: str,
        snippet: str,
        *,
        placement: str,
        cursor_index: int | None,
        target_heading: str,
    ) -> str:
        base = markdown or ''
        content = snippet.strip()
        if not content:
            return base
        if placement == 'cursor' and cursor_index is not None:
            index = max(0, min(cursor_index, len(base)))
            return f'{base[:index]}{content}{base[index:]}'
        if target_heading.strip():
            lines = base.splitlines()
            lower_target = target_heading.strip().lower()
            for index, line in enumerate(lines):
                if line.strip().lower() == lower_target:
                    insert_at = len(lines)
                    for next_index in range(index + 1, len(lines)):
                        if lines[next_index].startswith('## '):
                            insert_at = next_index
                            break
                    new_lines = lines[:insert_at] + ['', content, ''] + lines[insert_at:]
                    return '\n'.join(new_lines).strip()
        if base.strip():
            return f'{base.rstrip()}\n\n## Pending Evidence\n{content}\n'.strip()
        return f'## Pending Evidence\n{content}\n'.strip()

    def insert_review_evidence(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        evidence_ids: list[int],
        placement: str,
        cursor_index: int | None,
        target_heading: str,
    ) -> ResearchProjectOutputRecord:
        selected_ids = [int(item) for item in evidence_ids if int(item) > 0]
        if not selected_ids:
            raise ValueError('Select at least one evidence card before inserting into the literature review')
        rows = db.execute(
            select(ResearchProjectEvidenceItemRecord)
            .where(ResearchProjectEvidenceItemRecord.project_id == project.id)
            .where(ResearchProjectEvidenceItemRecord.id.in_(selected_ids))
            .order_by(ResearchProjectEvidenceItemRecord.sort_order.asc(), ResearchProjectEvidenceItemRecord.created_at.asc())
        ).scalars().all()
        if len(rows) != len(selected_ids):
            raise ValueError('Some evidence cards are no longer available')

        output = self._review_output_row(db, project.id)
        if output is None:
            output = self._create_review_output(db, project)

        payload = self._normalize_review_json(_json_object(output.content_json))
        citations = {
            int(item.get('evidence_id') or 0): item
            for item in payload.get('citations', [])
            if isinstance(item, dict)
        }
        inserted_ids = {int(item) for item in payload.get('inserted_evidence_ids', []) if int(item) > 0}
        snippet_lines: list[str] = []
        for row in rows:
            snippet_lines.append(f'- {row.excerpt.strip()} {self._citation_token(row)}')
            citations[row.id] = {
                'paper_id': row.paper_id,
                'evidence_id': row.id,
                'paragraph_id': row.paragraph_id,
                'summary_id': row.summary_id,
                'source_label': row.source_label,
                'paper_title': row.paper.title_en if row.paper is not None else '',
                'integrity_status': row.paper.integrity_status if row.paper is not None else '',
            }
            inserted_ids.add(row.id)

        payload.setdefault('blocks', [])
        payload['blocks'].append(
            {
                'type': 'evidence_insert',
                'placement': placement,
                'evidence_ids': [row.id for row in rows],
                'inserted_at': datetime.now(timezone.utc).isoformat(),
            }
        )
        payload['citations'] = list(citations.values())
        payload['inserted_evidence_ids'] = sorted(inserted_ids)
        markdown = self._insert_review_markdown(
            output.content_markdown or '',
            '\n'.join(snippet_lines),
            placement=placement,
            cursor_index=cursor_index,
            target_heading=target_heading,
        )
        output = self.update_output(
            db,
            output,
            title=f'{project.title} Literature Review',
            content_json=payload,
            content_markdown=markdown,
            record_activity=False,
        )
        self._log_activity(
            db,
            project_id=project.id,
            event_type='evidence_inserted_review',
            title='证据写入综述稿',
            message=f'将 {len(rows)} 张证据卡插入到了综述稿中。',
            ref_type='research_project_outputs',
            ref_id=output.id,
            metadata={'evidence_ids': [row.id for row in rows], 'placement': placement},
        )
        return output

    def batch_update_paper_state(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        paper_ids: list[int],
        reading_status: str | None,
        repro_interest: str | None,
        is_core_paper: bool | None,
    ) -> ResearchProjectPaperBatchStateResponse:
        links = self._select_project_links(db, project.id, paper_ids)
        if not links:
            raise ValueError('Select at least one project paper before updating paper state')
        updated_ids: list[int] = []
        for link in links:
            state = self._ensure_research_state(db, link.paper_id)
            if reading_status is not None:
                state.reading_status = reading_status
            if repro_interest is not None:
                state.repro_interest = repro_interest
            if is_core_paper is not None:
                state.is_core_paper = is_core_paper
            state.last_opened_at = datetime.now(timezone.utc)
            db.add(state)
            updated_ids.append(link.paper_id)
        db.commit()
        self._log_activity(
            db,
            project_id=project.id,
            event_type='paper_batch_state_updated',
            title='批量更新论文状态',
            message=f'批量更新了 {len(updated_ids)} 篇项目论文的研究状态。',
            ref_type='projects',
            ref_id=project.id,
            metadata={
                'paper_ids': updated_ids,
                'reading_status': reading_status,
                'repro_interest': repro_interest,
                'is_core_paper': is_core_paper,
            },
        )
        return ResearchProjectPaperBatchStateResponse(updated_paper_ids=updated_ids)

    def list_duplicates(self, db: Session, project: ResearchProjectRecord) -> ProjectDuplicateListResponse:
        return ProjectDuplicateListResponse(groups=self._duplicate_groups(db, project.id))

    def _merge_integrity_status(self, left: str, right: str) -> str:
        return left if INTEGRITY_PRIORITY.get(left, 0) >= INTEGRITY_PRIORITY.get(right, 0) else right

    def _merge_paper_metadata(self, canonical: PaperRecord, merged: PaperRecord) -> None:
        if not canonical.doi and merged.doi:
            canonical.doi = merged.doi
        if not canonical.paper_url and merged.paper_url:
            canonical.paper_url = merged.paper_url
        if not canonical.openalex_id and merged.openalex_id:
            canonical.openalex_id = merged.openalex_id
        if not canonical.semantic_scholar_id and merged.semantic_scholar_id:
            canonical.semantic_scholar_id = merged.semantic_scholar_id
        if not canonical.abstract_en and merged.abstract_en:
            canonical.abstract_en = merged.abstract_en
        if not canonical.authors and merged.authors:
            canonical.authors = merged.authors
        if not canonical.venue and merged.venue:
            canonical.venue = merged.venue
        if not canonical.year and merged.year:
            canonical.year = merged.year
        if merged.citation_count and merged.citation_count > (canonical.citation_count or 0):
            canonical.citation_count = merged.citation_count
        if merged.reference_count and merged.reference_count > (canonical.reference_count or 0):
            canonical.reference_count = merged.reference_count
        if not canonical.pdf_url and merged.pdf_url:
            canonical.pdf_url = merged.pdf_url
        if not canonical.pdf_local_path and merged.pdf_local_path:
            canonical.pdf_local_path = merged.pdf_local_path
        canonical.integrity_status = self._merge_integrity_status(
            canonical.integrity_status or 'warning',
            merged.integrity_status or 'warning',
        )
        if merged.integrity_note and not canonical.integrity_note:
            canonical.integrity_note = merged.integrity_note

    def _merge_research_state(self, db: Session, canonical_paper_id: int, merged_paper_id: int) -> None:
        canonical_state = self._get_research_state(db, canonical_paper_id)
        merged_state = self._get_research_state(db, merged_paper_id)
        if merged_state is None:
            return
        if canonical_state is None:
            merged_state.paper_id = canonical_paper_id
            db.add(merged_state)
            return
        if canonical_state.reading_status == 'unread' and merged_state.reading_status != 'unread':
            canonical_state.reading_status = merged_state.reading_status
        if REPRO_PRIORITY.get(merged_state.repro_interest or 'none', 0) > REPRO_PRIORITY.get(canonical_state.repro_interest or 'none', 0):
            canonical_state.repro_interest = merged_state.repro_interest
        canonical_state.interest_level = max(canonical_state.interest_level or 0, merged_state.interest_level or 0)
        canonical_state.is_core_paper = canonical_state.is_core_paper or merged_state.is_core_paper
        if merged_state.last_opened_at and (
            canonical_state.last_opened_at is None or merged_state.last_opened_at > canonical_state.last_opened_at
        ):
            canonical_state.last_opened_at = merged_state.last_opened_at
        db.add(canonical_state)
        db.delete(merged_state)

    def merge_duplicates(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        canonical_paper_id: int,
        merged_paper_ids: list[int],
    ) -> ProjectDuplicateListResponse:
        canonical_paper_id = self._canonical_paper_id(db, canonical_paper_id) or canonical_paper_id
        canonical = db.get(PaperRecord, canonical_paper_id)
        if canonical is None:
            raise ValueError('Canonical paper not found')
        target_ids = [
            item
            for item in {self._canonical_paper_id(db, paper_id) for paper_id in merged_paper_ids}
            if item and item != canonical_paper_id
        ]
        if not target_ids:
            raise ValueError('Select at least one duplicate paper to merge')

        project_paper_ids = {
            int(paper_id)
            for (paper_id,) in db.execute(
                select(ResearchProjectPaperRecord.paper_id).where(ResearchProjectPaperRecord.project_id == project.id)
            ).all()
        }
        if canonical_paper_id not in project_paper_ids or any(item not in project_paper_ids for item in target_ids):
            raise ValueError('All merged papers must belong to the current project')

        for merged_id in target_ids:
            merged = db.get(PaperRecord, merged_id)
            if merged is None:
                continue
            self._merge_paper_metadata(canonical, merged)

            canonical_links = {
                row.project_id: row
                for row in db.execute(
                    select(ResearchProjectPaperRecord).where(ResearchProjectPaperRecord.paper_id == canonical_paper_id)
                ).scalars().all()
            }
            for link in db.execute(
                select(ResearchProjectPaperRecord).where(ResearchProjectPaperRecord.paper_id == merged_id)
            ).scalars().all():
                same_project = canonical_links.get(link.project_id)
                if same_project is not None:
                    same_project.pinned = same_project.pinned or link.pinned
                    if not same_project.selection_reason and link.selection_reason:
                        same_project.selection_reason = link.selection_reason
                    db.add(same_project)
                    db.delete(link)
                else:
                    link.paper_id = canonical_paper_id
                    db.add(link)

            for evidence in db.execute(
                select(ResearchProjectEvidenceItemRecord).where(ResearchProjectEvidenceItemRecord.paper_id == merged_id)
            ).scalars().all():
                evidence.paper_id = canonical_paper_id
                db.add(evidence)

            for summary in db.execute(select(SummaryRecord).where(SummaryRecord.paper_id == merged_id)).scalars().all():
                summary.paper_id = canonical_paper_id
                db.add(summary)

            for reflection in db.execute(select(ReflectionRecord).where(ReflectionRecord.related_paper_id == merged_id)).scalars().all():
                reflection.related_paper_id = canonical_paper_id
                db.add(reflection)

            for reproduction in db.execute(select(ReproductionRecord).where(ReproductionRecord.paper_id == merged_id)).scalars().all():
                reproduction.paper_id = canonical_paper_id
                db.add(reproduction)

            for annotation in db.execute(select(PaperAnnotationRecord).where(PaperAnnotationRecord.paper_id == merged_id)).scalars().all():
                annotation.paper_id = canonical_paper_id
                db.add(annotation)

            for note in db.execute(select(NoteRecord).where(NoteRecord.paper_id == merged_id)).scalars().all():
                note.paper_id = canonical_paper_id
                db.add(note)

            for idea in db.execute(select(IdeaRecord).where(IdeaRecord.paper_id == merged_id)).scalars().all():
                idea.paper_id = canonical_paper_id
                db.add(idea)

            for repo in db.execute(select(RepoRecord).where(RepoRecord.paper_id == merged_id)).scalars().all():
                repo.paper_id = canonical_paper_id
                db.add(repo)

            for row in db.execute(
                select(ResearchProjectSavedSearchCandidateRecord).where(ResearchProjectSavedSearchCandidateRecord.paper_id == merged_id)
            ).scalars().all():
                existing = db.execute(
                    select(ResearchProjectSavedSearchCandidateRecord)
                    .where(ResearchProjectSavedSearchCandidateRecord.saved_search_id == row.saved_search_id)
                    .where(ResearchProjectSavedSearchCandidateRecord.paper_id == canonical_paper_id)
                ).scalars().first()
                if existing is None:
                    row.paper_id = canonical_paper_id
                    db.add(row)
                else:
                    if existing.triage_status == 'new' and row.triage_status != 'new':
                        existing.triage_status = row.triage_status
                    if not existing.ai_reason_text and row.ai_reason_text:
                        existing.ai_reason_text = row.ai_reason_text
                    if row.rank_score > existing.rank_score:
                        existing.rank_score = row.rank_score
                        existing.rank_position = row.rank_position
                        existing.reason_json = row.reason_json
                    db.add(existing)
                    db.delete(row)

            self._merge_research_state(db, canonical_paper_id, merged_id)
            merged.merged_into_paper_id = canonical_paper_id
            db.add(merged)

        db.add(canonical)
        db.commit()
        db.refresh(canonical)
        self._log_activity(
            db,
            project_id=project.id,
            event_type='duplicates_merged',
            title='合并重复论文',
            message=f'将 {len(target_ids)} 篇重复论文软合并到《{_compact(canonical.title_en, 80)}》。',
            ref_type='papers',
            ref_id=canonical.id,
            metadata={'canonical_paper_id': canonical.id, 'merged_paper_ids': target_ids},
        )
        return self.list_duplicates(db, project)

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
            raise ValueError('请先在当前项目中至少选择一篇论文，再执行该动作')

        selected_ids = [link.paper_id for link in links]
        task = workflow_service.create_task(
            db,
            task_type=PROJECT_ACTION_TASK_TYPES[action],
            input_json={
                'action': action,
                'project_id': project.id,
                'paper_ids': selected_ids,
                'instruction': instruction.strip(),
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
        self._log_activity(
            db,
            project_id=project.id,
            event_type='project_action_launched',
            title='启动项目动作',
            message=f'已启动 {action}，覆盖 {len(selected_ids)} 篇项目论文。',
            ref_type='tasks',
            ref_id=task.id,
            metadata={'action': action, 'paper_ids': selected_ids, 'instruction': instruction.strip()},
        )
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='screening_papers',
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
                elif action == 'fetch_pdfs':
                    output_json = await self._execute_fetch_pdfs(
                        db,
                        task=task,
                        project=project,
                        links=links,
                    )
                elif action == 'refresh_metadata':
                    output_json = await self._execute_refresh_metadata(
                        db,
                        task=task,
                        project=project,
                        links=links,
                    )
                elif action == 'ensure_summaries':
                    output_json = await self._execute_ensure_summaries(
                        db,
                        task=task,
                        project=project,
                        links=links,
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

    async def _execute_ensure_summaries(
        self,
        db: Session,
        *,
        task: TaskRecord,
        project: ResearchProjectRecord,
        links: list[ResearchProjectPaperRecord],
    ) -> dict[str, Any]:
        selected_ids = [link.paper_id for link in links]
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='ensuring_summaries',
            status='running',
            message='正在检查哪些论文已经有可复用摘要。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()
        created_summary_ids: list[int] = []
        reused_count = 0
        for link in links:
            existing = db.execute(
                select(SummaryRecord).where(SummaryRecord.paper_id == link.paper_id).order_by(desc(SummaryRecord.created_at))
            ).scalars().first()
            if existing is not None:
                reused_count += 1
                continue
            summary = await self._ensure_summary(db, link.paper, task.id, project.id)
            created_summary_ids.append(summary.id)
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='ensuring_summaries',
            status='completed',
            message=f'已为 {len(selected_ids)} 篇论文准备摘要，其中新增 {len(created_summary_ids)} 篇，复用 {reused_count} 篇。',
            related_paper_ids=selected_ids,
        )
        self._log_activity(
            db,
            project_id=project.id,
            event_type='summaries_ensured',
            title='批量补齐摘要',
            message=f'检查了 {len(selected_ids)} 篇论文的摘要覆盖，新增 {len(created_summary_ids)} 篇 quick summary。',
            ref_type='tasks',
            ref_id=task.id,
            metadata={'created_summary_ids': created_summary_ids, 'paper_ids': selected_ids},
        )
        return {'created_summary_ids': created_summary_ids, 'reused_count': reused_count}

    async def _execute_fetch_pdfs(
        self,
        db: Session,
        *,
        task: TaskRecord,
        project: ResearchProjectRecord,
        links: list[ResearchProjectPaperRecord],
    ) -> dict[str, Any]:
        selected_ids = [link.paper_id for link in links]
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='fetching_pdfs',
            status='running',
            message='正在尝试解析并补全所选论文的 PDF。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()
        results = []
        for link in links:
            results.append(await self._fetch_pdf_for_paper(db, link.paper))
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='fetching_pdfs',
            status='completed',
            message=f'已更新 {len(results)} 篇论文的 PDF 状态。',
            related_paper_ids=selected_ids,
        )
        self._log_activity(
            db,
            project_id=project.id,
            event_type='pdf_fetch_completed',
            title='批量补全 PDF',
            message=f'更新了 {len(results)} 篇项目论文的 PDF 状态。',
            ref_type='tasks',
            ref_id=task.id,
            metadata={'results': results},
        )
        return {'results': results}

    async def _execute_refresh_metadata(
        self,
        db: Session,
        *,
        task: TaskRecord,
        project: ResearchProjectRecord,
        links: list[ResearchProjectPaperRecord],
    ) -> dict[str, Any]:
        selected_ids = [link.paper_id for link in links]
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='refreshing_metadata',
            status='running',
            message='正在从公开来源刷新元数据与可信度信号。',
            related_paper_ids=selected_ids,
        )
        await self._maybe_pause_for_progress()
        results = []
        for link in links:
            results.append(await self._refresh_metadata_for_paper(db, link.paper))
        self._record_progress(
            db,
            task_id=task.id,
            project_id=project.id,
            step_key='refreshing_metadata',
            status='completed',
            message=f'已更新 {len(results)} 篇论文的元数据与可信度状态。',
            related_paper_ids=selected_ids,
        )
        self._log_activity(
            db,
            project_id=project.id,
            event_type='metadata_refresh_completed',
            title='刷新元数据与可信度',
            message=f'刷新了 {len(results)} 篇项目论文的元数据和可信度状态。',
            ref_type='tasks',
            ref_id=task.id,
            metadata={'results': results},
        )
        return {'results': results}

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
            status='completed',
            message=f'已创建 {len(created_ids)} 张新证据卡。',
            related_paper_ids=selected_ids,
        )
        self._log_activity(
            db,
            project_id=project.id,
            event_type='evidence_extracted',
            title='批量提取证据',
            message=f'从 {len(selected_ids)} 篇论文中提取了 {len(created_ids)} 张证据卡。',
            ref_type='tasks',
            ref_id=task.id,
            metadata={'paper_ids': selected_ids, 'created_evidence_ids': created_ids, 'instruction': instruction.strip()},
        )
        return {'created_evidence_ids': created_ids, 'paper_ids': selected_ids}

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
        payload = {
            'columns': COMPARE_COLUMNS,
            'rows': rows,
            'instruction': instruction,
            'paper_ids': selected_ids,
        }
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
            output = self.update_output(
                db,
                output,
                content_json=payload,
                title=f'{project.title} Comparison Table',
                record_activity=False,
            )

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
            status='completed',
            message='对比表已生成，可继续编辑。',
            related_paper_ids=selected_ids,
        )
        self._log_activity(
            db,
            project_id=project.id,
            event_type='compare_table_generated',
            title='生成对比表',
            message=f'已为 {len(selected_ids)} 篇论文生成或刷新对比表。',
            ref_type='research_project_outputs',
            ref_id=output.id,
            metadata={'paper_ids': selected_ids, 'row_count': len(rows), 'instruction': instruction.strip()},
        )
        return {'project_output_id': output.id, 'paper_ids': selected_ids, 'row_count': len(rows)}

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

        output = self._review_output_row(db, project.id)
        if output is None:
            output = self._create_review_output(db, project)

        existing_payload = self._normalize_review_json(_json_object(output.content_json))
        citations = []
        inserted_evidence_ids = sorted(
            {
                int(item.id)
                for item in evidence_rows
                if item.paper_id in selected_ids
            }
            | {
                int(item)
                for item in existing_payload.get('inserted_evidence_ids', [])
                if int(item) > 0
            }
        )
        for item in evidence_rows:
            if item.paper_id not in selected_ids:
                continue
            citations.append(
                {
                    'paper_id': item.paper_id,
                    'evidence_id': item.id,
                    'paragraph_id': item.paragraph_id,
                    'summary_id': item.summary_id,
                    'source_label': item.source_label,
                    'paper_title': item.paper.title_en if item.paper is not None else '',
                    'integrity_status': item.paper.integrity_status if item.paper is not None else '',
                }
            )

        content_json = self._normalize_review_json(
            {
                **existing_payload,
                'paper_ids': selected_ids,
                'instruction': instruction,
                'evidence_count': len(evidence_rows),
                'citations': citations,
                'blocks': [
                    {
                        'type': 'draft_literature_review',
                        'paper_ids': selected_ids,
                        'generated_at': datetime.now(timezone.utc).isoformat(),
                    }
                ],
                'inserted_evidence_ids': inserted_evidence_ids,
            }
        )
        output = self.update_output(
            db,
            output,
            title=f'{project.title} Literature Review',
            content_json=content_json,
            content_markdown=markdown,
            record_activity=False,
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
            status='completed',
            message='综述稿已生成，可继续编辑。',
            related_paper_ids=selected_ids,
        )
        self._log_activity(
            db,
            project_id=project.id,
            event_type='literature_review_drafted',
            title='起草综述',
            message=f'已为 {len(selected_ids)} 篇论文生成或刷新综述稿。',
            ref_type='research_project_outputs',
            ref_id=output.id,
            metadata={
                'paper_ids': selected_ids,
                'citation_count': len(content_json.get('citations', [])),
                'inserted_evidence_ids': content_json.get('inserted_evidence_ids', []),
                'instruction': instruction.strip(),
            },
        )
        return {
            'project_output_id': output.id,
            'paper_ids': selected_ids,
            'citation_count': len(content_json.get('citations', [])),
        }


project_service = ProjectService()
