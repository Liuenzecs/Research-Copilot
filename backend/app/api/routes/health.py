from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.rag.vector_store import vector_store

router = APIRouter(prefix='/health', tags=['health'])


@router.get('')
def health_check() -> dict:
    db_ok = False
    with SessionLocal() as db:
        try:
            db.execute(text('SELECT 1'))
            db_ok = True
        except Exception:
            db_ok = False

    vector_ok = vector_store._get_collection() is not None  # noqa: SLF001
    settings = get_settings()
    return {
        'status': 'ok',
        'db': db_ok,
        'vector': vector_ok,
        'providers': {
            'openai': bool(settings.openai_api_key),
            'deepseek': bool(settings.deepseek_api_key),
        },
    }
