from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class PaperSearchRequest(BaseModel):
    query: str
    sources: list[str] = Field(default_factory=lambda: ['arxiv'])
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
    warnings: list[str] = Field(default_factory=list)


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


class PaperWorkspaceResponse(BaseModel):
    paper: PaperOut
    research_state: dict[str, Any]
    summaries: list[dict[str, Any]]
    reflections: list[dict[str, Any]]
    recent_tasks: list[dict[str, Any]]


class PaperReaderParagraph(BaseModel):
    paragraph_id: int
    text: str
    page_no: int


class PaperReaderPagePreview(BaseModel):
    page_no: int
    image_url: str
    width: int
    height: int


class PaperReaderFigure(BaseModel):
    figure_id: int
    page_no: int
    image_url: str
    caption_text: str = ''
    anchor_paragraph_id: int | None = None
    match_mode: str = 'approximate'


class PaperAnnotationOut(BaseModel):
    id: int
    paper_id: int
    paragraph_id: int
    selected_text: str = ''
    note_text: str = ''
    created_at: datetime
    updated_at: datetime


class PaperAnnotationCreateRequest(BaseModel):
    paragraph_id: int
    selected_text: str = ''
    note_text: str


class PaperReaderResponse(BaseModel):
    paper: PaperOut
    research_state: dict[str, Any]
    summaries: list[dict[str, Any]]
    reflections: list[dict[str, Any]]
    recent_tasks: list[dict[str, Any]]
    pdf_downloaded: bool
    reader_ready: bool
    paragraphs: list[PaperReaderParagraph]
    pages: list[PaperReaderPagePreview] = Field(default_factory=list)
    figures: list[PaperReaderFigure] = Field(default_factory=list)
    annotations: list[PaperAnnotationOut] = Field(default_factory=list)
    reader_notices: list[str] = Field(default_factory=list)
    text_notice: str = ''


class PaperContextReflectionCreateRequest(BaseModel):
    summary_id: int | None = None
    stage: str = 'initial'
    lifecycle_status: str = 'draft'
    content_structured_json: dict[str, Any] = Field(default_factory=dict)
    content_markdown: str = ''
    is_report_worthy: bool = False
    report_summary: str = ''
    event_date: date | None = None
