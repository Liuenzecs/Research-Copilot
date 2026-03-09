from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    brainstorm,
    health,
    library,
    memory,
    papers,
    reflections,
    reproduction,
    repos,
    settings,
    summaries,
    tasks,
    translation,
)
from app.core.logging import setup_logging
from app.db.init_db import initialize_database

setup_logging()
initialize_database()

app = FastAPI(title='Research Copilot API', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(health.router)
app.include_router(papers.router)
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
