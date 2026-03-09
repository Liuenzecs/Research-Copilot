from datetime import datetime

from pydantic import BaseModel, Field


class PaperSearchRequest(BaseModel):
    query: str
    sources: list[str] = Field(default_factory=lambda: ['arxiv', 'semantic_scholar'])
    limit: int = 10
    year_from: int | None = None
    year_to: int | None = None


class PaperOut(BaseModel):
    id: int
    source: str
    source_id: str
    title_en: str
    abstract_en: str
    authors: str
    year: int | None = None
    venue: str = ''
    pdf_url: str = ''
    pdf_local_path: str = ''
    created_at: datetime
    updated_at: datetime


class PaperSearchResponse(BaseModel):
    items: list[PaperOut]


class PaperDownloadRequest(BaseModel):
    paper_id: int | None = None
    arxiv_id: str | None = None


class PaperDownloadResponse(BaseModel):
    paper_id: int
    pdf_local_path: str
    downloaded: bool


class PaperResearchStateUpdate(BaseModel):
    reading_status: str | None = None
    interest_level: int | None = None
    repro_interest: str | None = None
    user_rating: int | None = None
    topic_cluster: str | None = None
    is_core_paper: bool | None = None
