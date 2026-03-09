from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.paper_record import PaperRecord, PaperResearchStateRecord
from app.models.schemas.paper import (
    PaperDownloadRequest,
    PaperDownloadResponse,
    PaperOut,
    PaperSearchRequest,
    PaperSearchResponse,
)
from app.services.paper_search.arxiv import ArxivSearchService
from app.services.paper_search.normalizer import dedupe_and_rank
from app.services.paper_search.openalex import OpenAlexSearchService
from app.services.paper_search.semantic_scholar import SemanticScholarSearchService
from app.services.pdf.downloader import pdf_downloader
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


def ensure_research_state(db: Session, paper_id: int) -> None:
    state = db.execute(select(PaperResearchStateRecord).where(PaperResearchStateRecord.paper_id == paper_id)).scalar_one_or_none()
    if state is None:
        state = PaperResearchStateRecord(paper_id=paper_id)
        db.add(state)
        db.commit()


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
            errors.append(f'{source}: {exc}')

    unified = dedupe_and_rank(papers, payload.limit)
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
    return PaperSearchResponse(items=[to_paper_out(p) for p in stored])


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


@router.get('/{paper_id}', response_model=PaperOut)
def get_paper(paper_id: int, db: Session = Depends(get_db)) -> PaperOut:
    paper = db.get(PaperRecord, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')
    return to_paper_out(paper)
