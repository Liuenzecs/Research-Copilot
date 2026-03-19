from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.db.paper_record import PaperRecord, PaperResearchStateRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.reproduction_record import ReproductionRecord
from app.models.db.research_project_record import ResearchProjectPaperRecord
from app.models.db.summary_record import SummaryRecord
from app.models.schemas.paper import PaperOut, PaperSearchReasonOut, PaperSearchRequest, SearchCandidateOut
from app.services.paper_search.arxiv import ArxivSearchService
from app.services.paper_search.base import SearchPaper
from app.services.paper_search.normalizer import RankedSearchPaper, dedupe_and_rank
from app.services.paper_search.openalex import OpenAlexSearchService
from app.services.paper_search.semantic_scholar import SemanticScholarSearchService


@dataclass(slots=True)
class SearchExecutionResult:
    items: list[SearchCandidateOut]
    warnings: list[str]


def _normalize_source_list(raw_sources: list[str]) -> list[str]:
    allowed = {'arxiv', 'openalex', 'semantic_scholar'}
    cleaned = [item.strip() for item in raw_sources if item and item.strip() in allowed]
    if cleaned:
        return cleaned
    default_sources = [
        item.strip()
        for item in get_settings().default_search_sources.split(',')
        if item and item.strip() in allowed
    ]
    return default_sources or ['arxiv']


def _paper_to_out(row: PaperRecord) -> PaperOut:
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


def _load_search_fixture_path() -> Path | None:
    fixture_path = (os.getenv('RESEARCH_COPILOT_SEARCH_FIXTURE_PATH') or '').strip()
    if not fixture_path:
        return None
    path = Path(fixture_path)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    if not path.exists():
        return None
    return path


def load_search_fixtures(query: str, limit: int) -> list[SearchPaper] | None:
    path = _load_search_fixture_path()
    if path is None:
        return None

    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return None

    raw_items = payload if isinstance(payload, list) else payload.get('items', [])
    if not isinstance(raw_items, list):
        return None

    ranked_items: list[tuple[int, int, SearchPaper]] = []
    tokens = [token for token in query.lower().split() if token]
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        paper = SearchPaper(
            source=str(item.get('source') or 'fixture'),
            source_id=str(item.get('source_id') or ''),
            title_en=str(item.get('title_en') or ''),
            abstract_en=str(item.get('abstract_en') or ''),
            authors=str(item.get('authors') or ''),
            year=int(item['year']) if item.get('year') is not None else None,
            venue=str(item.get('venue') or ''),
            pdf_url=str(item.get('pdf_url') or ''),
            doi=str(item.get('doi') or ''),
            paper_url=str(item.get('paper_url') or ''),
            openalex_id=str(item.get('openalex_id') or ''),
            semantic_scholar_id=str(item.get('semantic_scholar_id') or ''),
            citation_count=int(item.get('citation_count') or 0),
            reference_count=int(item.get('reference_count') or 0),
        )
        haystack = ' '.join([paper.title_en, paper.abstract_en, paper.authors, paper.venue]).lower()
        score = sum(1 for token in tokens if token in haystack)
        if tokens and score == 0:
            continue
        ranked_items.append((score, paper.year or 0, paper))

    ranked_items.sort(key=lambda entry: (entry[0], entry[1]), reverse=True)
    return [entry[2] for entry in ranked_items[:limit]]


def load_citation_fixture(source_id: str) -> dict | None:
    path = _load_search_fixture_path()
    if path is None:
        return None
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return None
    raw_items = payload if isinstance(payload, list) else payload.get('items', [])
    if not isinstance(raw_items, list):
        return None
    for item in raw_items:
        if isinstance(item, dict) and str(item.get('source_id') or '') == source_id:
            citation_trail = item.get('citation_trail')
            return citation_trail if isinstance(citation_trail, dict) else None
    return None


class PaperSearchService:
    def __init__(self) -> None:
        self.arxiv = ArxivSearchService()
        self.openalex = OpenAlexSearchService()
        self.semantic_scholar = SemanticScholarSearchService()

    def format_search_error(self, source: str, exc: Exception) -> str:
        import httpx

        if isinstance(exc, httpx.ConnectError):
            return f'{source}: 网络连接失败，已跳过该数据源。'
        if isinstance(exc, httpx.TimeoutException):
            return f'{source}: 请求超时，已跳过该数据源。'
        if isinstance(exc, httpx.HTTPStatusError):
            status = exc.response.status_code
            if source == 'semantic_scholar' and status == 429:
                return (
                    'semantic_scholar: 达到速率限制(429)，本次已自动降级为其他结果。'
                    '可选：在 .env 配置 SEMANTIC_SCHOLAR_API_KEY 或稍后重试。'
                )
            return f'{source}: 上游 HTTP {status}'
        message = str(exc).strip()
        if message:
            trimmed = message if len(message) <= 160 else f'{message[:160]}...'
            return f'{source}: {trimmed}'
        return f'{source}: {exc.__class__.__name__}'

    async def _provider_results(self, query: str, limit: int, sources: list[str]) -> tuple[list[SearchPaper], list[str], list[str]]:
        fixture_papers = load_search_fixtures(query, limit)
        if fixture_papers is not None:
            filtered = [item for item in fixture_papers if item.source in sources]
            effective_sources = sorted({item.source for item in filtered})
            return filtered, [], effective_sources or ['fixture']

        async def invoke(source: str) -> tuple[str, list[SearchPaper], str | None]:
            try:
                if source == 'arxiv':
                    return source, await self.arxiv.search(query, limit), None
                if source == 'openalex':
                    return source, await self.openalex.search(query, limit), None
                if source == 'semantic_scholar':
                    return source, await self.semantic_scholar.search(query, limit), None
                return source, [], None
            except Exception as exc:  # pragma: no cover - exercised in route tests via monkeypatch
                return source, [], self.format_search_error(source, exc)

        results = await asyncio.gather(*[invoke(source) for source in sources])
        papers: list[SearchPaper] = []
        warnings: list[str] = []
        effective_sources: list[str] = []
        for source, items, warning in results:
            if items:
                effective_sources.append(source)
                papers.extend(items)
            if warning:
                warnings.append(warning)
        return papers, warnings, effective_sources

    def _paper_matches_metadata_filters(self, paper: SearchPaper, payload: PaperSearchRequest) -> bool:
        if payload.year_from is not None and (paper.year is None or paper.year < payload.year_from):
            return False
        if payload.year_to is not None and (paper.year is None or paper.year > payload.year_to):
            return False
        if payload.venue_query.strip():
            if payload.venue_query.strip().lower() not in (paper.venue or '').lower():
                return False
        if payload.require_pdf is True and not paper.pdf_url:
            return False
        if payload.require_pdf is False and paper.pdf_url:
            return False
        return True

    def upsert_paper(self, db: Session, paper: SearchPaper) -> PaperRecord:
        row = None
        if paper.doi:
            row = db.execute(select(PaperRecord).where(func.lower(PaperRecord.doi) == paper.doi.lower())).scalar_one_or_none()
        if row is None and paper.openalex_id:
            row = db.execute(select(PaperRecord).where(PaperRecord.openalex_id == paper.openalex_id)).scalar_one_or_none()
        if row is None and paper.semantic_scholar_id:
            row = db.execute(select(PaperRecord).where(PaperRecord.semantic_scholar_id == paper.semantic_scholar_id)).scalar_one_or_none()
        if row is None:
            row = db.execute(
                select(PaperRecord).where(PaperRecord.source == paper.source, PaperRecord.source_id == paper.source_id)
            ).scalar_one_or_none()

        if row is None:
            row = PaperRecord(
                source=paper.source,
                source_id=paper.source_id,
                title_en=paper.title_en,
                abstract_en=paper.abstract_en,
                authors=paper.authors,
                year=paper.year,
                venue=paper.venue,
                doi=paper.doi,
                paper_url=paper.paper_url,
                openalex_id=paper.openalex_id,
                semantic_scholar_id=paper.semantic_scholar_id,
                citation_count=paper.citation_count,
                reference_count=paper.reference_count,
                pdf_url=paper.pdf_url,
                published_at=datetime(paper.year, 1, 1, tzinfo=timezone.utc) if paper.year else None,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return row

        row.title_en = paper.title_en or row.title_en
        if paper.abstract_en and len(paper.abstract_en) > len(row.abstract_en or ''):
            row.abstract_en = paper.abstract_en
        row.authors = paper.authors or row.authors
        row.year = paper.year or row.year
        row.venue = paper.venue or row.venue
        row.doi = paper.doi or row.doi
        row.paper_url = paper.paper_url or row.paper_url
        row.openalex_id = paper.openalex_id or row.openalex_id
        row.semantic_scholar_id = paper.semantic_scholar_id or row.semantic_scholar_id
        row.citation_count = max(row.citation_count or 0, paper.citation_count or 0)
        row.reference_count = max(row.reference_count or 0, paper.reference_count or 0)
        if paper.pdf_url and (not row.pdf_url or 'arxiv.org/pdf' in paper.pdf_url):
            row.pdf_url = paper.pdf_url
        if paper.year and row.published_at is None:
            row.published_at = datetime(paper.year, 1, 1, tzinfo=timezone.utc)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def _local_status_maps(self, db: Session, paper_ids: list[int], project_id: int | None) -> dict[str, dict[int, int | str | bool]]:
        if not paper_ids:
            return {
                'summary_count': {},
                'reflection_count': {},
                'reproduction_count': {},
                'reading_status': {},
                'repro_interest': {},
                'project_membership': {},
            }

        summary_count = {
            int(paper_id): int(total)
            for paper_id, total in db.execute(
                select(SummaryRecord.paper_id, func.count(SummaryRecord.id)).where(SummaryRecord.paper_id.in_(paper_ids)).group_by(SummaryRecord.paper_id)
            ).all()
        }
        reflection_count = {
            int(paper_id): int(total)
            for paper_id, total in db.execute(
                select(ReflectionRecord.related_paper_id, func.count(ReflectionRecord.id))
                .where(ReflectionRecord.related_paper_id.in_(paper_ids))
                .group_by(ReflectionRecord.related_paper_id)
            ).all()
        }
        reproduction_count = {
            int(paper_id): int(total)
            for paper_id, total in db.execute(
                select(ReproductionRecord.paper_id, func.count(ReproductionRecord.id))
                .where(ReproductionRecord.paper_id.in_(paper_ids))
                .group_by(ReproductionRecord.paper_id)
            ).all()
        }
        states = db.execute(
            select(PaperResearchStateRecord).where(PaperResearchStateRecord.paper_id.in_(paper_ids))
        ).scalars().all()
        reading_status = {int(row.paper_id): row.reading_status for row in states}
        repro_interest = {int(row.paper_id): row.repro_interest for row in states}

        project_membership: dict[int, bool] = {}
        if project_id:
            project_membership = {
                int(paper_id): True
                for (paper_id,) in db.execute(
                    select(ResearchProjectPaperRecord.paper_id)
                    .where(ResearchProjectPaperRecord.project_id == project_id)
                    .where(ResearchProjectPaperRecord.paper_id.in_(paper_ids))
                ).all()
            }

        return {
            'summary_count': summary_count,
            'reflection_count': reflection_count,
            'reproduction_count': reproduction_count,
            'reading_status': reading_status,
            'repro_interest': repro_interest,
            'project_membership': project_membership,
        }

    def _passes_local_filters(self, candidate: SearchCandidateOut, payload: PaperSearchRequest) -> bool:
        if payload.project_membership == 'in_project' and not candidate.is_in_project:
            return False
        if payload.project_membership == 'not_in_project' and candidate.is_in_project:
            return False
        if payload.has_summary is True and candidate.summary_count <= 0:
            return False
        if payload.has_summary is False and candidate.summary_count > 0:
            return False
        if payload.has_reflection is True and candidate.reflection_count <= 0:
            return False
        if payload.has_reflection is False and candidate.reflection_count > 0:
            return False
        if payload.has_reproduction is True and candidate.reproduction_count <= 0:
            return False
        if payload.has_reproduction is False and candidate.reproduction_count > 0:
            return False
        if payload.reading_status.strip() and candidate.reading_status != payload.reading_status.strip():
            return False
        if payload.repro_interest.strip() and candidate.repro_interest != payload.repro_interest.strip():
            return False
        return True

    def _candidate_from_ranked(
        self,
        row: PaperRecord,
        ranked: RankedSearchPaper,
        *,
        project_id: int | None,
        status_maps: dict[str, dict[int, int | str | bool]],
        candidate_id: int | None = None,
        saved_search_id: int | None = None,
        run_id: int | None = None,
        ai_reason_text: str = '',
        triage_status: str = 'new',
        matched_in_latest_run: bool = True,
    ) -> SearchCandidateOut:
        summary_count = int(status_maps['summary_count'].get(row.id, 0))
        reflection_count = int(status_maps['reflection_count'].get(row.id, 0))
        reproduction_count = int(status_maps['reproduction_count'].get(row.id, 0))
        reading_status = str(status_maps['reading_status'].get(row.id, ''))
        repro_interest = str(status_maps['repro_interest'].get(row.id, ''))
        is_in_project = bool(status_maps['project_membership'].get(row.id, False)) if project_id else False

        local_signals = list(ranked.reason.local_signals)
        if is_in_project:
            local_signals.append('已在当前项目中')
        if row.pdf_local_path:
            local_signals.append('已下载 PDF')
        if summary_count:
            local_signals.append(f'已有摘要 {summary_count}')
        if reflection_count:
            local_signals.append(f'已有心得 {reflection_count}')
        if reproduction_count:
            local_signals.append(f'已有复现 {reproduction_count}')
        reason = PaperSearchReasonOut(
            summary=ranked.reason.summary,
            matched_terms=list(ranked.reason.matched_terms),
            matched_fields=list(ranked.reason.matched_fields),
            source_signals=list(ranked.reason.source_signals),
            local_signals=local_signals,
            merged_sources=list(ranked.reason.merged_sources),
            duplicate_count=ranked.reason.duplicate_count,
            score_breakdown=dict(ranked.reason.score_breakdown),
        )
        return SearchCandidateOut(
            candidate_id=candidate_id,
            saved_search_id=saved_search_id,
            run_id=run_id,
            paper=_paper_to_out(row),
            rank_position=ranked.rank_position,
            rank_score=ranked.rank_score,
            reason=reason,
            ai_reason_text=ai_reason_text,
            triage_status=triage_status,
            is_in_project=is_in_project,
            is_downloaded=bool(row.pdf_local_path),
            summary_count=summary_count,
            reflection_count=reflection_count,
            reproduction_count=reproduction_count,
            reading_status=reading_status,
            repro_interest=repro_interest,
            matched_in_latest_run=matched_in_latest_run,
        )

    async def execute_search(self, db: Session, payload: PaperSearchRequest) -> SearchExecutionResult:
        sources = _normalize_source_list(payload.sources)
        raw_papers, warnings, _effective_sources = await self._provider_results(payload.query.strip(), payload.limit, sources)
        filtered_raw = [paper for paper in raw_papers if self._paper_matches_metadata_filters(paper, payload)]
        ranked_papers = dedupe_and_rank(filtered_raw, payload.limit * 3, payload.query, sort_mode=payload.sort_mode)

        stored_ranked: list[tuple[PaperRecord, RankedSearchPaper]] = []
        for ranked in ranked_papers:
            row = self.upsert_paper(db, ranked.paper)
            stored_ranked.append((row, ranked))

        paper_ids = [row.id for row, _ in stored_ranked]
        status_maps = self._local_status_maps(db, paper_ids, payload.project_id)

        items: list[SearchCandidateOut] = []
        for row, ranked in stored_ranked:
            candidate = self._candidate_from_ranked(row, ranked, project_id=payload.project_id, status_maps=status_maps)
            if self._passes_local_filters(candidate, payload):
                items.append(candidate)

        items = items[:payload.limit]
        for index, item in enumerate(items, start=1):
            item.rank_position = index
        return SearchExecutionResult(items=items, warnings=warnings)


paper_search_service = PaperSearchService()
