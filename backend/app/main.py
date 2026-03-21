from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    brainstorm,
    health,
    library,
    memory,
    papers,
    projects,
    reflections,
    reports,
    reproduction,
    repos,
    settings,
    summaries,
    tasks,
    translation,
)
from app.core.logging import setup_logging
from app.db.init_db import initialize_database
from app.db.session import SessionLocal
from app.services.project.runtime import project_task_runtime
from app.services.rag.vector_store import vector_store
from app.services.project.service import project_service


setup_logging()


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    with SessionLocal() as db:
        project_service.mark_interrupted_project_tasks_failed(db)
    vector_warmup = asyncio.create_task(asyncio.to_thread(vector_store.ensure_ready))
    yield
    if not vector_warmup.done():
        vector_warmup.cancel()
    await project_task_runtime.shutdown()


app = FastAPI(title='Research Copilot API', version='0.1.0', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(health.router)
app.include_router(papers.router)
app.include_router(projects.router)
app.include_router(summaries.router)
app.include_router(translation.router)
app.include_router(brainstorm.router)
app.include_router(repos.router)
app.include_router(reproduction.router)
app.include_router(memory.router)
app.include_router(library.router)
app.include_router(settings.router)
app.include_router(reflections.router)
app.include_router(tasks.router)
app.include_router(reports.router)
