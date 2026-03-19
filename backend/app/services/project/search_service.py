from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.db.research_project_record import (
    ResearchProjectRecord,
    ResearchProjectSavedSearchCandidateRecord,
    ResearchProjectSavedSearchRecord,
    ResearchProjectSearchRunRecord,
)
from app.models.schemas.paper import PaperSearchReasonOut, PaperSearchRequest, SearchCandidateOut
from app.models.schemas.project import (
    ProjectSearchFilters,
    ResearchProjectSavedSearchCreateRequest,
    ResearchProjectSavedSearchDetailOut,
    ResearchProjectSavedSearchOut,
    ResearchProjectSavedSearchUpdateRequest,
    ResearchProjectSearchRunCreateRequest,
    ResearchProjectSearchRunDetailOut,
    ResearchProjectSearchRunOut,
)
from app.services.paper_search.recommender import paper_search_recommender
from app.services.paper_search.service import paper_search_service


SEARCH_RUN_LIMIT = 24


class ProjectSearchService:
    def _serialize_filters(self, filters: ProjectSearchFilters) -> str:
        return json.dumps(filters.model_dump(), ensure_ascii=False)

    def _deserialize_filters(self, raw_value: str) -> ProjectSearchFilters:
        try:
            payload = json.loads(raw_value or '{}')
        except json.JSONDecodeError:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        return ProjectSearchFilters(**payload)

    def _parse_reason(self, raw_value: str) -> PaperSearchReasonOut:
        try:
            payload = json.loads(raw_value or '{}')
        except json.JSONDecodeError:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        return PaperSearchReasonOut(**payload)

    def _to_run_out(self, row: ResearchProjectSearchRunRecord) -> ResearchProjectSearchRunOut:
        return ResearchProjectSearchRunOut(
            id=row.id,
            project_id=row.project_id,
            saved_search_id=row.saved_search_id,
            query=row.query,
            filters=self._deserialize_filters(row.filters_json),
            sort_mode=row.sort_mode,
            result_count=row.result_count,
            warnings=json.loads(row.warnings_json or '[]'),
            created_at=row.created_at,
        )

    def _to_saved_search_out(self, row: ResearchProjectSavedSearchRecord) -> ResearchProjectSavedSearchOut:
        return ResearchProjectSavedSearchOut(
            id=row.id,
            project_id=row.project_id,
            title=row.title,
            query=row.query,
            filters=self._deserialize_filters(row.filters_json),
            sort_mode=row.sort_mode,
            last_run_id=row.last_run_id,
            last_result_count=row.last_result_count,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _search_payload(self, project_id: int, query: str, filters: ProjectSearchFilters, sort_mode: str) -> PaperSearchRequest:
        return PaperSearchRequest(
            query=query,
            sources=filters.sources,
            limit=SEARCH_RUN_LIMIT,
            year_from=filters.year_from,
            year_to=filters.year_to,
            venue_query=filters.venue_query,
            require_pdf=filters.require_pdf,
            project_id=project_id,
            project_membership=filters.project_membership,
            has_summary=filters.has_summary,
            has_reflection=filters.has_reflection,
            has_reproduction=filters.has_reproduction,
            reading_status=filters.reading_status,
            repro_interest=filters.repro_interest,
            sort_mode=sort_mode,
        )

    async def create_search_run(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        payload: ResearchProjectSearchRunCreateRequest,
    ) -> ResearchProjectSearchRunDetailOut:
        normalized_query = payload.query.strip()
        if not normalized_query:
            raise ValueError('Search query is required')

        search_payload = self._search_payload(project.id, normalized_query, payload.filters, payload.sort_mode)
        result = await paper_search_service.execute_search(db, search_payload)
        row = ResearchProjectSearchRunRecord(
            project_id=project.id,
            saved_search_id=None,
            query=normalized_query,
            filters_json=self._serialize_filters(payload.filters),
            sort_mode=payload.sort_mode,
            result_count=len(result.items),
            warnings_json=json.dumps(result.warnings, ensure_ascii=False),
            created_at=datetime.now(timezone.utc),
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        items = [item.model_copy(update={'run_id': row.id}) for item in result.items]
        return ResearchProjectSearchRunDetailOut(run=self._to_run_out(row), items=items)

    def list_search_runs(self, db: Session, project_id: int) -> list[ResearchProjectSearchRunOut]:
        rows = db.execute(
            select(ResearchProjectSearchRunRecord)
            .where(ResearchProjectSearchRunRecord.project_id == project_id)
            .order_by(desc(ResearchProjectSearchRunRecord.created_at), desc(ResearchProjectSearchRunRecord.id))
            .limit(20)
        ).scalars().all()
        return [self._to_run_out(row) for row in rows]

    async def create_saved_search(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        payload: ResearchProjectSavedSearchCreateRequest,
    ) -> ResearchProjectSavedSearchDetailOut:
        normalized_query = payload.query.strip()
        if not normalized_query:
            raise ValueError('Search query is required')

        row = ResearchProjectSavedSearchRecord(
            project_id=project.id,
            title=(payload.title or '').strip() or normalized_query[:80],
            query=normalized_query,
            filters_json=self._serialize_filters(payload.filters),
            sort_mode=payload.sort_mode,
            last_run_id=None,
            last_result_count=0,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return await self.rerun_saved_search(db, project=project, saved_search=row)

    def list_saved_searches(self, db: Session, project_id: int) -> list[ResearchProjectSavedSearchOut]:
        rows = db.execute(
            select(ResearchProjectSavedSearchRecord)
            .where(ResearchProjectSavedSearchRecord.project_id == project_id)
            .order_by(desc(ResearchProjectSavedSearchRecord.updated_at), desc(ResearchProjectSavedSearchRecord.id))
        ).scalars().all()
        return [self._to_saved_search_out(row) for row in rows]

    def get_saved_search_or_404(self, db: Session, project_id: int, saved_search_id: int) -> ResearchProjectSavedSearchRecord:
        row = db.get(ResearchProjectSavedSearchRecord, saved_search_id)
        if row is None or row.project_id != project_id:
            raise ValueError('Saved search not found')
        return row

    def get_candidate_or_404(
        self,
        db: Session,
        saved_search_id: int,
        candidate_id: int,
    ) -> ResearchProjectSavedSearchCandidateRecord:
        row = db.get(ResearchProjectSavedSearchCandidateRecord, candidate_id)
        if row is None or row.saved_search_id != saved_search_id:
            raise ValueError('Saved search candidate not found')
        return row

    def candidate_for_project(self, db: Session, project_id: int, candidate_id: int) -> ResearchProjectSavedSearchCandidateRecord:
        row = db.get(ResearchProjectSavedSearchCandidateRecord, candidate_id)
        if row is None:
            raise ValueError('Saved search candidate not found')
        saved_search = db.get(ResearchProjectSavedSearchRecord, row.saved_search_id)
        if saved_search is None or saved_search.project_id != project_id:
            raise ValueError('Saved search candidate not found')
        return row

    def _candidate_out_from_row(
        self,
        db: Session,
        *,
        project_id: int,
        saved_search: ResearchProjectSavedSearchRecord,
        row: ResearchProjectSavedSearchCandidateRecord,
    ) -> SearchCandidateOut:
        status_maps = paper_search_service._local_status_maps(db, [row.paper_id], project_id)
        ranked = SimpleNamespace(
            rank_position=row.rank_position,
            rank_score=row.rank_score,
            reason=self._parse_reason(row.reason_json),
        )
        return paper_search_service._candidate_from_ranked(
            row.paper,
            ranked=ranked,
            project_id=project_id,
            status_maps=status_maps,
            candidate_id=row.id,
            saved_search_id=saved_search.id,
            run_id=saved_search.last_run_id,
            ai_reason_text=row.ai_reason_text,
            triage_status=row.triage_status,
            matched_in_latest_run=row.last_seen_run_id == saved_search.last_run_id,
        )

    def get_saved_search_detail(
        self,
        db: Session,
        *,
        project_id: int,
        saved_search: ResearchProjectSavedSearchRecord,
    ) -> ResearchProjectSavedSearchDetailOut:
        last_run = db.get(ResearchProjectSearchRunRecord, saved_search.last_run_id) if saved_search.last_run_id else None
        candidate_rows = db.execute(
            select(ResearchProjectSavedSearchCandidateRecord)
            .where(ResearchProjectSavedSearchCandidateRecord.saved_search_id == saved_search.id)
            .order_by(
                desc(ResearchProjectSavedSearchCandidateRecord.last_seen_run_id == saved_search.last_run_id),
                ResearchProjectSavedSearchCandidateRecord.rank_position.asc(),
                ResearchProjectSavedSearchCandidateRecord.id.asc(),
            )
        ).scalars().all()
        items = [self._candidate_out_from_row(db, project_id=project_id, saved_search=saved_search, row=row) for row in candidate_rows]
        return ResearchProjectSavedSearchDetailOut(
            saved_search=self._to_saved_search_out(saved_search),
            last_run=self._to_run_out(last_run) if last_run else None,
            items=items,
        )

    def update_saved_search(
        self,
        db: Session,
        *,
        row: ResearchProjectSavedSearchRecord,
        payload: ResearchProjectSavedSearchUpdateRequest,
    ) -> ResearchProjectSavedSearchRecord:
        if payload.title is not None:
            row.title = payload.title.strip() or row.title
        if payload.query is not None:
            normalized_query = payload.query.strip()
            if normalized_query:
                row.query = normalized_query
        if payload.filters is not None:
            row.filters_json = self._serialize_filters(payload.filters)
        if payload.sort_mode is not None:
            row.sort_mode = payload.sort_mode
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def delete_saved_search(self, db: Session, row: ResearchProjectSavedSearchRecord) -> None:
        db.delete(row)
        db.commit()

    async def rerun_saved_search(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        saved_search: ResearchProjectSavedSearchRecord,
    ) -> ResearchProjectSavedSearchDetailOut:
        filters = self._deserialize_filters(saved_search.filters_json)
        search_payload = self._search_payload(project.id, saved_search.query, filters, saved_search.sort_mode)
        result = await paper_search_service.execute_search(db, search_payload)

        run = ResearchProjectSearchRunRecord(
            project_id=project.id,
            saved_search_id=saved_search.id,
            query=saved_search.query,
            filters_json=saved_search.filters_json,
            sort_mode=saved_search.sort_mode,
            result_count=len(result.items),
            warnings_json=json.dumps(result.warnings, ensure_ascii=False),
            created_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        existing = {
            row.paper_id: row
            for row in db.execute(
                select(ResearchProjectSavedSearchCandidateRecord)
                .where(ResearchProjectSavedSearchCandidateRecord.saved_search_id == saved_search.id)
            ).scalars().all()
        }
        for item in result.items:
            row = existing.get(item.paper.id)
            if row is None:
                row = ResearchProjectSavedSearchCandidateRecord(
                    saved_search_id=saved_search.id,
                    paper_id=item.paper.id,
                    rank_position=item.rank_position,
                    rank_score=item.rank_score,
                    reason_json=json.dumps(item.reason.model_dump(), ensure_ascii=False),
                    ai_reason_text='',
                    triage_status='new',
                    first_seen_run_id=run.id,
                    last_seen_run_id=run.id,
                )
            else:
                row.rank_position = item.rank_position
                row.rank_score = item.rank_score
                row.reason_json = json.dumps(item.reason.model_dump(), ensure_ascii=False)
                row.last_seen_run_id = run.id
            db.add(row)

        saved_search.last_run_id = run.id
        saved_search.last_result_count = len(result.items)
        db.add(saved_search)
        db.commit()
        db.refresh(saved_search)
        return self.get_saved_search_detail(db, project_id=project.id, saved_search=saved_search)

    def update_candidate(
        self,
        db: Session,
        *,
        row: ResearchProjectSavedSearchCandidateRecord,
        triage_status: str,
    ) -> ResearchProjectSavedSearchCandidateRecord:
        normalized = triage_status.strip()
        if normalized not in {'new', 'shortlisted', 'rejected'}:
            raise ValueError('Invalid triage_status')
        row.triage_status = normalized
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    async def generate_ai_reason(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        saved_search: ResearchProjectSavedSearchRecord,
        row: ResearchProjectSavedSearchCandidateRecord,
    ) -> SearchCandidateOut:
        candidate = self._candidate_out_from_row(db, project_id=project.id, saved_search=saved_search, row=row)
        ai_reason = await paper_search_recommender.generate_reason(candidate, research_question=project.research_question)
        row.ai_reason_text = ai_reason
        db.add(row)
        db.commit()
        db.refresh(row)
        return self._candidate_out_from_row(db, project_id=project.id, saved_search=saved_search, row=row)

    def default_selection_reason(self, row: ResearchProjectSavedSearchCandidateRecord) -> str:
        if row.ai_reason_text.strip():
            return row.ai_reason_text.strip()
        reason = self._parse_reason(row.reason_json)
        return reason.summary.strip()


project_search_service = ProjectSearchService()
