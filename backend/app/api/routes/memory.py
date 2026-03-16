from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.schemas.memory import MemoryArchiveRequest, MemoryLinkRequest, MemoryOut, MemoryQueryRequest
from app.services.memory.service import memory_service

router = APIRouter(prefix='/memory', tags=['memory'])


@router.get('', response_model=list[MemoryOut])
def list_memory(
    limit: int = Query(default=12, ge=1, le=100),
    memory_types: list[str] | None = Query(default=None),
    layers: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[MemoryOut]:
    rows = memory_service.list_recent(
        db,
        limit=limit,
        memory_types=memory_types or [],
        layers=layers or [],
    )
    return [MemoryOut(**row) for row in rows]


@router.post('/query', response_model=list[MemoryOut])
def memory_query(payload: MemoryQueryRequest, db: Session = Depends(get_db)) -> list[MemoryOut]:
    rows = memory_service.query(
        db,
        query=payload.query,
        top_k=payload.top_k,
        memory_types=payload.memory_types,
        layers=payload.layers,
    )
    return [MemoryOut(**row) for row in rows]


@router.post('/link')
def memory_link(payload: MemoryLinkRequest, db: Session = Depends(get_db)) -> dict:
    row = memory_service.link(db, payload.from_memory_id, payload.to_memory_id, payload.link_type, payload.weight)
    return {'id': row.id, 'link_type': row.link_type}


@router.post('/archive')
def memory_archive(payload: MemoryArchiveRequest, db: Session = Depends(get_db)) -> dict:
    row = memory_service.archive(db, payload.memory_id, payload.archived)
    if row is None:
        raise HTTPException(status_code=404, detail='Memory item not found')
    return {'id': row.id, 'archived': row.archived}
