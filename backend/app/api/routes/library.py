from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.services.library.service import library_service

router = APIRouter(prefix='/library', tags=['library'])


@router.get('/list')
def list_library(db: Session = Depends(get_db)) -> dict:
    return library_service.list_library(db)
