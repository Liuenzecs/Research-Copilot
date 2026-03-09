from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.db.paper_record import PaperRecord
from app.models.db.repo_record import RepoRecord
from app.models.schemas.repo import RepoFindRequest, RepoOut
from app.services.memory.service import memory_service
from app.services.repo_finder.service import repo_finder_service
from app.services.workflow.service import workflow_service

router = APIRouter(prefix='/repos', tags=['repos'])


def to_repo_out(r: RepoRecord) -> RepoOut:
    return RepoOut(
        id=r.id,
        paper_id=r.paper_id,
        platform=r.platform,
        repo_url=r.repo_url,
        owner=r.owner,
        name=r.name,
        stars=r.stars,
        forks=r.forks,
        readme_summary=r.readme_summary,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


@router.post('/find', response_model=dict)
async def find_repos(payload: RepoFindRequest, db: Session = Depends(get_db)) -> dict:
    query = payload.query
    if not query and payload.paper_id:
        paper = db.get(PaperRecord, payload.paper_id)
        if paper is None:
            raise HTTPException(status_code=404, detail='Paper not found')
        query = paper.title_en
    if not query:
        raise HTTPException(status_code=400, detail='query or paper_id is required')

    task = workflow_service.create_task(db, task_type='repo_find', input_json=payload.model_dump(), status='running')
    result = await repo_finder_service.find(query)

    records: list[RepoRecord] = []
    for item in result['results']:
        row = RepoRecord(
            paper_id=payload.paper_id,
            platform='github',
            repo_url=item['repo_url'],
            owner=item['owner'],
            name=item['name'],
            stars=item['stars'],
            forks=item['forks'],
            readme_summary=item['readme_summary'],
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        records.append(row)

        memory_service.create_memory(
            db,
            memory_type='RepoMemory',
            layer='structured',
            text_content=f"{row.name} {row.readme_summary}",
            ref_table='repos',
            ref_id=row.id,
            importance=0.6,
        )

    workflow_service.add_artifact(
        db,
        task.id,
        artifact_type='repo_results',
        snapshot_json={'count': len(records), 'rate_limited': result['rate_limited']},
    )
    workflow_service.update_task(db, task, status='completed', output_json={'repo_ids': [r.id for r in records]})

    return {
        'items': [to_repo_out(r).model_dump() for r in records],
        'rate_limited': result['rate_limited'],
        'rate_limit_reset': result['rate_limit_reset'],
        'used_token': result['used_token'],
        'paperswithcode': result['paperswithcode'],
    }
