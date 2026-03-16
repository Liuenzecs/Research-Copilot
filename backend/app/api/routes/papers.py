from __future__ import annotations

import json
import re
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.paper_record import PaperRecord, PaperResearchStateRecord
from app.models.db.paper_annotation_record import PaperAnnotationRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.summary_record import SummaryRecord
from app.models.db.task_artifact_record import TaskArtifactRecord
from app.models.db.task_record import TaskRecord
from app.models.schemas.paper import (
    PaperAnnotationCreateRequest,
    PaperAnnotationOut,
    PaperContextReflectionCreateRequest,
    PaperDownloadRequest,
    PaperDownloadResponse,
    PaperOut,
    PaperReaderResponse,
    PaperResearchStateUpdate,
    PaperSearchRequest,
    PaperSearchResponse,
    PaperWorkspaceResponse,
)
from app.services.paper_search.arxiv import ArxivSearchService
from app.services.paper_search.normalizer import dedupe_and_rank
from app.services.paper_search.openalex import OpenAlexSearchService
from app.services.paper_search.semantic_scholar import SemanticScholarSearchService
from app.services.memory.service import memory_service
from app.services.pdf.downloader import pdf_downloader
from app.services.pdf.parser import pdf_parser
from app.services.reflection.service import reflection_service
from app.services.workflow.service import workflow_service

router = APIRouter(prefix='/papers', tags=['papers'])

arxiv_service = ArxivSearchService()
semantic_service = SemanticScholarSearchService()
openalex_service = OpenAlexSearchService()


def to_paper_out(p: PaperRecord) -> PaperOut:
    return PaperOut(
        id=p.id,
        source=p.source,
        source_id=p.source_id,
        title_en=p.title_en,
        abstract_en=p.abstract_en,
        authors=p.authors,
        year=p.year,
        venue=p.venue,
        pdf_url=p.pdf_url,
        pdf_local_path=p.pdf_local_path,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def summary_to_dict(item: SummaryRecord) -> dict:
    return {
        'id': item.id,
        'paper_id': item.paper_id,
        'summary_type': item.summary_type,
        'content_en': item.content_en,
        'problem_en': item.problem_en,
        'method_en': item.method_en,
        'contributions_en': item.contributions_en,
        'limitations_en': item.limitations_en,
        'future_work_en': item.future_work_en,
        'provider': item.provider,
        'model': item.model,
        'created_at': item.created_at,
        'updated_at': item.updated_at,
    }


def reflection_to_dict(item: ReflectionRecord) -> dict:
    return {
        'id': item.id,
        'reflection_type': item.reflection_type,
        'related_paper_id': item.related_paper_id,
        'related_summary_id': item.related_summary_id,
        'related_repo_id': item.related_repo_id,
        'related_reproduction_id': item.related_reproduction_id,
        'related_task_id': item.related_task_id,
        'template_type': item.template_type,
        'stage': item.stage,
        'lifecycle_status': item.lifecycle_status,
        'content_structured_json': json.loads(item.content_structured_json or '{}'),
        'content_markdown': item.content_markdown,
        'is_report_worthy': item.is_report_worthy,
        'report_summary': item.report_summary,
        'event_date': item.event_date,
        'created_at': item.created_at,
        'updated_at': item.updated_at,
    }


def annotation_to_out(item: PaperAnnotationRecord) -> PaperAnnotationOut:
    return PaperAnnotationOut(
        id=item.id,
        paper_id=item.paper_id,
        paragraph_id=item.paragraph_id,
        selected_text=item.selected_text or '',
        note_text=item.note_text or '',
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def build_workspace_payload(db: Session, paper: PaperRecord) -> dict:
    state = ensure_research_state(db, paper.id)
    summaries = (
        db.execute(select(SummaryRecord).where(SummaryRecord.paper_id == paper.id).order_by(SummaryRecord.created_at.desc()))
        .scalars()
        .all()
    )
    summary_ids = [x.id for x in summaries]

    if summary_ids:
        reflection_filter = or_(
            ReflectionRecord.related_paper_id == paper.id,
            ReflectionRecord.related_summary_id.in_(summary_ids),
        )
    else:
        reflection_filter = ReflectionRecord.related_paper_id == paper.id

    reflections = (
        db.execute(
            select(ReflectionRecord)
            .where(reflection_filter)
            .order_by(ReflectionRecord.event_date.desc(), ReflectionRecord.created_at.desc())
        )
        .scalars()
        .all()
    )

    reflection_ids = [x.id for x in reflections]
    artifact_conditions = [and_(TaskArtifactRecord.artifact_ref_type == 'papers', TaskArtifactRecord.artifact_ref_id == paper.id)]
    if summary_ids:
        artifact_conditions.append(and_(TaskArtifactRecord.artifact_ref_type == 'summaries', TaskArtifactRecord.artifact_ref_id.in_(summary_ids)))
    if reflection_ids:
        artifact_conditions.append(and_(TaskArtifactRecord.artifact_ref_type == 'reflections', TaskArtifactRecord.artifact_ref_id.in_(reflection_ids)))

    tasks = (
        db.execute(
            select(TaskRecord)
            .join(TaskArtifactRecord, TaskArtifactRecord.task_id == TaskRecord.id)
            .where(or_(*artifact_conditions))
            .order_by(TaskRecord.created_at.desc())
            .distinct()
            .limit(20)
        )
        .scalars()
        .all()
    )

    task_rows = [
        {
            'id': t.id,
            'task_type': t.task_type,
            'status': t.status,
            'created_at': t.created_at,
            'updated_at': t.updated_at,
        }
        for t in tasks
    ]

    research_state = {
        'reading_status': state.reading_status,
        'interest_level': state.interest_level,
        'repro_interest': state.repro_interest,
        'user_rating': state.user_rating,
        'last_opened_at': state.last_opened_at,
        'topic_cluster': state.topic_cluster,
        'is_core_paper': state.is_core_paper,
        'updated_at': state.updated_at,
    }

    return {
        'paper': to_paper_out(paper),
        'research_state': research_state,
        'summaries': [summary_to_dict(item) for item in summaries],
        'reflections': [reflection_to_dict(item) for item in reflections],
        'recent_tasks': task_rows,
    }


def build_reader_payload(paper: PaperRecord) -> dict:
    if not paper.pdf_local_path:
        return {
            'pdf_downloaded': False,
            'reader_ready': False,
            'paragraphs': [],
            'text_notice': '当前尚未下载 PDF，请先下载论文后再进入正文阅读。',
        }

    path = Path(paper.pdf_local_path)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()

    if not path.exists() or not path.is_file():
        return {
            'pdf_downloaded': True,
            'reader_ready': False,
            'paragraphs': [],
            'text_notice': f'已记录 PDF 路径，但本地文件缺失：{path}',
        }

    raw_text = pdf_parser.extract_text(str(path))
    if not raw_text.strip():
        return {
            'pdf_downloaded': True,
            'reader_ready': False,
            'paragraphs': [],
            'text_notice': 'PDF 已下载，但暂未解析出可阅读正文。你仍可继续使用摘要、心得和研究状态。',
        }

    paragraphs: list[dict] = []
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_lines
        if not current_lines:
            return
        merged = ' '.join(line.strip() for line in current_lines if line.strip())
        normalized = re.sub(r'\s+', ' ', merged).strip()
        if normalized:
            paragraphs.append({'paragraph_id': len(paragraphs) + 1, 'text': normalized})
        current_lines = []

    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped:
            flush()
            continue
        current_lines.append(stripped)
        if len(' '.join(current_lines)) >= 600:
            flush()
    flush()

    if not paragraphs:
        return {
            'pdf_downloaded': True,
            'reader_ready': False,
            'paragraphs': [],
            'text_notice': 'PDF 已下载，但暂未整理出可阅读段落。你仍可继续使用摘要、心得和研究状态。',
        }

    return {
        'pdf_downloaded': True,
        'reader_ready': True,
        'paragraphs': paragraphs,
        'text_notice': '当前为本地 PDF 抽取文本，可能存在格式误差；英文原文始终保持 canonical。',
    }


def ensure_research_state(db: Session, paper_id: int) -> PaperResearchStateRecord:
    state = db.execute(select(PaperResearchStateRecord).where(PaperResearchStateRecord.paper_id == paper_id)).scalar_one_or_none()
    if state is None:
        state = PaperResearchStateRecord(paper_id=paper_id)
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


def upsert_paper(db: Session, paper) -> PaperRecord:
    row = (
        db.execute(select(PaperRecord).where(PaperRecord.source == paper.source, PaperRecord.source_id == paper.source_id))
        .scalars()
        .first()
    )
    if row is None:
        row = PaperRecord(
            source=paper.source,
            source_id=paper.source_id,
            title_en=paper.title_en,
            abstract_en=paper.abstract_en,
            authors=paper.authors,
            year=paper.year,
            venue=paper.venue,
            pdf_url=paper.pdf_url,
            published_at=datetime(paper.year, 1, 1, tzinfo=timezone.utc) if paper.year else None,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    else:
        row.title_en = paper.title_en or row.title_en
        row.abstract_en = paper.abstract_en or row.abstract_en
        row.authors = paper.authors or row.authors
        row.year = paper.year or row.year
        row.venue = paper.venue or row.venue
        row.pdf_url = paper.pdf_url or row.pdf_url
        db.add(row)
        db.commit()
        db.refresh(row)
    ensure_research_state(db, row.id)
    return row


def derive_related_task_id(db: Session, paper_id: int, summary_id: int | None) -> int | None:
    conditions = [and_(TaskArtifactRecord.artifact_ref_type == 'papers', TaskArtifactRecord.artifact_ref_id == paper_id)]
    if summary_id is not None:
        conditions.append(and_(TaskArtifactRecord.artifact_ref_type == 'summaries', TaskArtifactRecord.artifact_ref_id == summary_id))

    artifact = (
        db.execute(select(TaskArtifactRecord).where(or_(*conditions)).order_by(TaskArtifactRecord.created_at.desc()))
        .scalars()
        .first()
    )
    return artifact.task_id if artifact else None


def format_search_error(source: str, exc: Exception) -> str:
    if isinstance(exc, httpx.ConnectError):
        return f'{source}: 网络连接失败，已跳过该数据源。'
    if isinstance(exc, httpx.TimeoutException):
        return f'{source}: 请求超时，已跳过该数据源。'
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if source == 'semantic_scholar' and status == 429:
            return (
                'semantic_scholar: 达到速率限制(429)，本次已自动降级为 arXiv 结果。'
                '可选：在 .env 配置 SEMANTIC_SCHOLAR_API_KEY 或稍后重试。'
            )
        return f'{source}: 上游 HTTP {status}'
    message = str(exc).strip()
    if message:
        trimmed = message if len(message) <= 160 else f'{message[:160]}...'
        return f'{source}: {trimmed}'
    return f'{source}: {exc.__class__.__name__}'


@router.post('/search', response_model=PaperSearchResponse)
async def search_papers(payload: PaperSearchRequest, db: Session = Depends(get_db)) -> PaperSearchResponse:
    task = workflow_service.create_task(
        db,
        task_type='paper_search',
        input_json=payload.model_dump(),
        status='running',
    )
    papers = []
    errors: list[str] = []

    for source in payload.sources:
        try:
            if source == 'arxiv':
                papers.extend(await arxiv_service.search(payload.query, payload.limit))
            elif source == 'semantic_scholar':
                papers.extend(await semantic_service.search(payload.query, payload.limit))
            elif source == 'openalex':
                papers.extend(await openalex_service.search(payload.query, payload.limit))
        except Exception as exc:
            errors.append(format_search_error(source, exc))

    unified = dedupe_and_rank(papers, payload.limit, payload.query)
    stored = [upsert_paper(db, p) for p in unified]

    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='search_results',
        snapshot_json={'count': len(stored), 'sources': payload.sources, 'errors': errors},
        role='output',
    )
    workflow_service.update_task(
        db,
        task,
        status='completed' if not errors else 'completed_with_warnings',
        output_json={'paper_ids': [p.id for p in stored], 'errors': errors},
    )
    return PaperSearchResponse(items=[to_paper_out(p) for p in stored], warnings=errors)


@router.post('/download', response_model=PaperDownloadResponse)
async def download_paper(payload: PaperDownloadRequest, db: Session = Depends(get_db)) -> PaperDownloadResponse:
    task = workflow_service.create_task(
        db,
        task_type='paper_download',
        input_json=payload.model_dump(),
        status='running',
    )

    paper = None
    if payload.paper_id is not None:
        paper = db.get(PaperRecord, payload.paper_id)
    elif payload.arxiv_id:
        arxiv_id = payload.arxiv_id.strip()
        paper = (
            db.execute(select(PaperRecord).where(PaperRecord.source == 'arxiv', PaperRecord.source_id == arxiv_id))
            .scalars()
            .first()
        )
        if paper is None:
            paper = PaperRecord(
                source='arxiv',
                source_id=arxiv_id,
                title_en=arxiv_id,
                abstract_en='',
                authors='',
                year=None,
                venue='arXiv',
                pdf_url=f'https://arxiv.org/pdf/{arxiv_id}.pdf',
            )
            db.add(paper)
            db.commit()
            db.refresh(paper)
            ensure_research_state(db, paper.id)

    if paper is None:
        workflow_service.update_task(db, task, status='failed', error_log='Paper not found')
        raise HTTPException(status_code=404, detail='Paper not found')

    pdf_url = paper.pdf_url or (f'https://arxiv.org/pdf/{paper.source_id}.pdf' if paper.source == 'arxiv' else '')
    if not pdf_url:
        workflow_service.update_task(db, task, status='failed', error_log='No PDF URL available')
        raise HTTPException(status_code=400, detail='No PDF URL available')

    try:
        local_path = await pdf_downloader.download(paper.id, paper.title_en, pdf_url, paper.source_id)
        paper.pdf_local_path = local_path
        db.add(paper)
        db.commit()
        db.refresh(paper)

        workflow_service.add_artifact(
            db,
            task.id,
            artifact_type='pdf_file',
            artifact_ref_type='papers',
            artifact_ref_id=paper.id,
            snapshot_json={'path': local_path},
        )
        workflow_service.update_task(db, task, status='completed', output_json={'paper_id': paper.id, 'pdf_local_path': local_path})
    except Exception as exc:
        workflow_service.update_task(db, task, status='failed', error_log=str(exc))
        raise

    return PaperDownloadResponse(paper_id=paper.id, pdf_local_path=paper.pdf_local_path, downloaded=True)


@router.get('/{paper_id}/workspace', response_model=PaperWorkspaceResponse)
def get_paper_workspace(paper_id: int, db: Session = Depends(get_db)) -> PaperWorkspaceResponse:
    paper = db.get(PaperRecord, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')
    return PaperWorkspaceResponse(**build_workspace_payload(db, paper))


@router.get('/{paper_id}/reader', response_model=PaperReaderResponse)
def get_paper_reader(paper_id: int, db: Session = Depends(get_db)) -> PaperReaderResponse:
    paper = db.get(PaperRecord, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')

    workspace_payload = build_workspace_payload(db, paper)
    reader_payload = build_reader_payload(paper)
    annotations = (
        db.execute(
            select(PaperAnnotationRecord)
            .where(PaperAnnotationRecord.paper_id == paper_id)
            .order_by(PaperAnnotationRecord.updated_at.desc(), PaperAnnotationRecord.created_at.desc())
        )
        .scalars()
        .all()
    )
    return PaperReaderResponse(
        **workspace_payload,
        **reader_payload,
        annotations=[annotation_to_out(item) for item in annotations],
    )


@router.post('/{paper_id}/annotations', response_model=PaperAnnotationOut)
def create_paper_annotation(
    paper_id: int,
    payload: PaperAnnotationCreateRequest,
    db: Session = Depends(get_db),
) -> PaperAnnotationOut:
    paper = db.get(PaperRecord, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')
    if payload.paragraph_id <= 0:
        raise HTTPException(status_code=400, detail='paragraph_id must be positive')

    note_text = (payload.note_text or '').strip()
    if not note_text:
        raise HTTPException(status_code=400, detail='note_text is required')

    annotation = PaperAnnotationRecord(
        paper_id=paper_id,
        paragraph_id=payload.paragraph_id,
        selected_text=(payload.selected_text or '').strip(),
        note_text=note_text,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation_to_out(annotation)


@router.patch('/{paper_id}/research-state')
def update_paper_research_state(
    paper_id: int,
    payload: PaperResearchStateUpdate,
    db: Session = Depends(get_db),
) -> dict:
    paper = db.get(PaperRecord, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')

    state = ensure_research_state(db, paper_id)
    changes = payload.model_dump(exclude_none=True)
    for key, value in changes.items():
        setattr(state, key, value)
    state.last_opened_at = datetime.now(timezone.utc)

    db.add(state)
    db.commit()
    db.refresh(state)

    workflow_task = workflow_service.create_task(
        db,
        task_type='paper_research_state_update',
        input_json={'paper_id': paper_id, 'changes': changes},
        status='completed',
    )
    workflow_service.add_artifact(
        db,
        workflow_task.id,
        artifact_type='paper_state',
        artifact_ref_type='papers',
        artifact_ref_id=paper_id,
        snapshot_json=changes,
    )

    return {
        'paper_id': paper_id,
        'reading_status': state.reading_status,
        'interest_level': state.interest_level,
        'repro_interest': state.repro_interest,
        'user_rating': state.user_rating,
        'topic_cluster': state.topic_cluster,
        'is_core_paper': state.is_core_paper,
        'last_opened_at': state.last_opened_at,
    }


@router.post('/{paper_id}/reflections')
def create_paper_context_reflection(
    paper_id: int,
    payload: PaperContextReflectionCreateRequest,
    db: Session = Depends(get_db),
) -> dict:
    paper = db.get(PaperRecord, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')

    summary_id = payload.summary_id
    if summary_id is not None:
        summary = db.get(SummaryRecord, summary_id)
        if summary is None or summary.paper_id != paper_id:
            raise HTTPException(status_code=400, detail='summary_id does not belong to this paper')

    related_task_id = derive_related_task_id(db, paper_id=paper_id, summary_id=summary_id)

    task = workflow_service.create_task(
        db,
        task_type='paper_reflection_create',
        input_json={'paper_id': paper_id, **payload.model_dump(mode='json')},
        status='running',
    )

    reflection = reflection_service.create(
        db,
        reflection_type='paper',
        related_paper_id=paper_id,
        related_summary_id=summary_id,
        related_task_id=related_task_id,
        template_type='paper',
        stage=payload.stage,
        lifecycle_status=payload.lifecycle_status,
        content_structured_json=payload.content_structured_json,
        content_markdown=payload.content_markdown,
        is_report_worthy=payload.is_report_worthy,
        report_summary=payload.report_summary,
        event_date=payload.event_date or date.today(),
    )

    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='reflection',
        artifact_ref_type='reflections',
        artifact_ref_id=reflection.id,
        snapshot_json={'related_paper_id': paper_id, 'related_summary_id': summary_id, 'related_task_id': related_task_id},
    )
    workflow_service.update_task(db, task, status='completed', output_json={'reflection_id': reflection.id})

    return reflection_to_dict(reflection)


@router.post('/{paper_id}/memory')
def push_paper_to_memory(paper_id: int, db: Session = Depends(get_db)) -> dict:
    paper = db.get(PaperRecord, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')

    text = f"{paper.title_en}\n\n{paper.abstract_en}".strip()
    item = memory_service.create_memory(
        db,
        memory_type='PaperMemory',
        layer='structured',
        text_content=text,
        ref_table='papers',
        ref_id=paper.id,
        importance=0.6,
    )

    task = workflow_service.create_task(
        db,
        task_type='paper_memory_push',
        input_json={'paper_id': paper.id},
        status='completed',
    )
    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='memory_item',
        artifact_ref_type='memory_items',
        artifact_ref_id=item.id,
        snapshot_json={'paper_id': paper.id},
    )

    return {'paper_id': paper.id, 'memory_id': item.id}


@router.get('/{paper_id}/pdf')
def get_paper_pdf(
    paper_id: int,
    download: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    paper = db.get(PaperRecord, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')
    if not paper.pdf_local_path:
        raise HTTPException(status_code=404, detail='Paper PDF has not been downloaded yet')

    path = Path(paper.pdf_local_path)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()

    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail=f'PDF file missing on disk: {path}')

    if download:
        return FileResponse(path=str(path), media_type='application/pdf', filename=path.name)
    return FileResponse(path=str(path), media_type='application/pdf')


@router.get('/{paper_id}', response_model=PaperOut)
def get_paper(paper_id: int, db: Session = Depends(get_db)) -> PaperOut:
    paper = db.get(PaperRecord, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')
    return to_paper_out(paper)
