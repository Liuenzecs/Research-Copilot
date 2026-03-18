from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import false, or_, select
from sqlalchemy.orm import Session

from app.models.db.reflection_record import ReflectionRecord
from app.models.db.repo_record import RepoRecord
from app.models.db.reproduction_record import ReproductionRecord
from app.models.db.research_project_record import ResearchProjectPaperRecord
from app.models.db.summary_record import SummaryRecord


@dataclass(frozen=True)
class ProjectScopeIds:
    paper_ids: set[int]
    summary_ids: set[int]
    repo_ids: set[int]
    reproduction_ids: set[int]
    reflection_ids: set[int]


def get_project_scope_ids(db: Session, project_id: int) -> ProjectScopeIds:
    paper_ids = set(
        db.execute(
            select(ResearchProjectPaperRecord.paper_id).where(ResearchProjectPaperRecord.project_id == project_id)
        ).scalars()
    )
    if not paper_ids:
        return ProjectScopeIds(set(), set(), set(), set(), set())

    summary_ids = set(db.execute(select(SummaryRecord.id).where(SummaryRecord.paper_id.in_(paper_ids))).scalars())
    repo_ids = set(db.execute(select(RepoRecord.id).where(RepoRecord.paper_id.in_(paper_ids))).scalars())
    reproduction_ids = set(db.execute(select(ReproductionRecord.id).where(ReproductionRecord.paper_id.in_(paper_ids))).scalars())
    reflection_ids = set(
        db.execute(
            select(ReflectionRecord.id).where(
                or_(
                    ReflectionRecord.related_paper_id.in_(paper_ids),
                    ReflectionRecord.related_summary_id.in_(summary_ids) if summary_ids else false(),
                    ReflectionRecord.related_repo_id.in_(repo_ids) if repo_ids else false(),
                    ReflectionRecord.related_reproduction_id.in_(reproduction_ids) if reproduction_ids else false(),
                )
            )
        ).scalars()
    )
    return ProjectScopeIds(
        paper_ids=paper_ids,
        summary_ids=summary_ids,
        repo_ids=repo_ids,
        reproduction_ids=reproduction_ids,
        reflection_ids=reflection_ids,
    )


def append_project_id(path: str, project_id: int | None) -> str:
    if not path or project_id is None:
        return path
    parsed = urlsplit(path)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query['project_id'] = str(project_id)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


def ref_belongs_to_project(scope: ProjectScopeIds, ref_table: str, ref_id: int | None) -> bool:
    if ref_id is None:
        return False
    if ref_table == 'papers':
        return ref_id in scope.paper_ids
    if ref_table == 'summaries':
        return ref_id in scope.summary_ids
    if ref_table == 'repos':
        return ref_id in scope.repo_ids
    if ref_table == 'reproductions':
        return ref_id in scope.reproduction_ids
    if ref_table == 'reflections':
        return ref_id in scope.reflection_ids
    return False
