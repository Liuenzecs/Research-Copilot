from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class PaperSearchRequest(BaseModel):
    query: str
    sources: list[str] = Field(default_factory=lambda: ['arxiv'])
    limit: int = 10
    year_from: int | None = None
    year_to: int | None = None
    venue_query: str = ''
    require_pdf: bool | None = None
    project_id: int | None = None
    project_membership: str = 'all'
    has_summary: bool | None = None
    has_reflection: bool | None = None
    has_reproduction: bool | None = None
    reading_status: str = ''
    repro_interest: str = ''
    sort_mode: str = 'relevance'


class PaperOut(BaseModel):
    id: int
    source: str
    source_id: str
    title_en: str
    abstract_en: str
    authors: str
    year: int | None = None
    venue: str = ''
    doi: str = ''
    paper_url: str = ''
    openalex_id: str = ''
    semantic_scholar_id: str = ''
    citation_count: int = 0
    reference_count: int = 0
    pdf_url: str = ''
    pdf_local_path: str = ''
    created_at: datetime
    updated_at: datetime


class PaperSearchReasonOut(BaseModel):
    summary: str = ''
    matched_terms: list[str] = Field(default_factory=list)
    matched_fields: list[str] = Field(default_factory=list)
    source_signals: list[str] = Field(default_factory=list)
    local_signals: list[str] = Field(default_factory=list)
    merged_sources: list[str] = Field(default_factory=list)
    duplicate_count: int = 1
    score_breakdown: dict[str, float] = Field(default_factory=dict)
    topic_match_score: float = 0.0
    passed_topic_gate: bool = True
    filter_reason: str = ''
    ranking_reason: str = ''


class SearchCandidateOut(BaseModel):
    candidate_id: int | None = None
    saved_search_id: int | None = None
    run_id: int | None = None
    paper: PaperOut
    rank_position: int
    rank_score: float = 0.0
    reason: PaperSearchReasonOut = Field(default_factory=PaperSearchReasonOut)
    ai_reason_text: str = ''
    triage_status: str = 'new'
    is_in_project: bool = False
    is_downloaded: bool = False
    summary_count: int = 0
    reflection_count: int = 0
    reproduction_count: int = 0
    reading_status: str = ''
    repro_interest: str = ''
    selected_by_ai: bool = False
    selection_bucket: str = ''
    selection_rank: int | None = None
    matched_in_latest_run: bool = True


class PaperSearchResponse(BaseModel):
    items: list[SearchCandidateOut]
    warnings: list[str] = Field(default_factory=list)


class PaperCitationTrailResponse(BaseModel):
    paper: PaperOut
    references: list[SearchCandidateOut] = Field(default_factory=list)
    cited_by: list[SearchCandidateOut] = Field(default_factory=list)


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
    read_at: date | None = None
    clear_read_at: bool | None = None
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
    kind: str = 'body'
    bbox: list[float] = Field(default_factory=list)


class PaperReaderPagePreview(BaseModel):
    page_no: int
    image_url: str
    thumbnail_url: str = ''
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


class PaperAssistantSelectionRequest(BaseModel):
    action: str
    selected_text: str = ''
    paragraph_id: int | None = None
    project_id: int | None = None
    evidence_ids: list[int] = Field(default_factory=list)


class PaperAssistantSectionRequest(BaseModel):
    action: str
    paragraph_id: int | None = None
    project_id: int | None = None
    evidence_ids: list[int] = Field(default_factory=list)


class PaperAssistantReply(BaseModel):
    action: str
    answer_markdown: str
    provider: str = ''
    model: str = ''
    locator: dict[str, Any] = Field(default_factory=dict)
    suggested_evidence: dict[str, Any] = Field(default_factory=dict)
    suggested_review_snippet: str = ''


class PaperOpenedResponse(BaseModel):
    paper_id: int
    last_opened_at: datetime | None = None


class PaperAiReflectionCreateRequest(BaseModel):
    mode: str = 'quick'
    project_id: int | None = None
    summary_id: int | None = None
    event_date: date | None = None


class PaperContextReflectionCreateRequest(BaseModel):
    summary_id: int | None = None
    stage: str = 'initial'
    lifecycle_status: str = 'draft'
    content_structured_json: dict[str, Any] = Field(default_factory=dict)
    content_markdown: str = ''
    is_report_worthy: bool = False
    report_summary: str = ''
    event_date: date | None = None
