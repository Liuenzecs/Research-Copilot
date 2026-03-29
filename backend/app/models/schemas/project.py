from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.schemas.paper import PaperOut, SearchCandidateOut


class ResearchProjectCreateRequest(BaseModel):
    research_question: str
    goal: str = ''
    title: str = ''
    seed_query: str = ''


class ResearchProjectUpdateRequest(BaseModel):
    title: str | None = None
    research_question: str | None = None
    goal: str | None = None
    status: str | None = None
    seed_query: str | None = None


class ResearchProjectOut(BaseModel):
    id: int
    title: str
    research_question: str
    goal: str
    status: str
    seed_query: str
    last_opened_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ResearchProjectListItemOut(ResearchProjectOut):
    paper_count: int = 0
    evidence_count: int = 0
    output_count: int = 0


class ResearchProjectPaperAddRequest(BaseModel):
    paper_id: int
    selection_reason: str = ''
    saved_search_candidate_id: int | None = None


class ResearchProjectPaperOut(BaseModel):
    id: int
    project_id: int
    paper: PaperOut
    sort_order: int
    pinned: bool
    selection_reason: str
    is_downloaded: bool
    summary_count: int = 0
    reflection_count: int = 0
    reproduction_count: int = 0
    latest_summary_id: int | None = None
    latest_reflection_id: int | None = None
    latest_reproduction_id: int | None = None
    latest_reproduction_status: str = ''
    evidence_count: int = 0
    report_worthy_count: int = 0
    read_at: date | None = None
    pdf_status: str = 'missing'
    pdf_status_message: str = ''
    pdf_last_checked_at: datetime | None = None
    integrity_status: str = 'warning'
    integrity_note: str = ''
    metadata_last_checked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ResearchProjectEvidenceCreateRequest(BaseModel):
    paper_id: int | None = None
    summary_id: int | None = None
    paragraph_id: int | None = None
    kind: str = 'claim'
    excerpt: str
    note_text: str = ''
    source_label: str = ''
    sort_order: int | None = None


class ResearchProjectEvidenceUpdateRequest(BaseModel):
    kind: str | None = None
    excerpt: str | None = None
    note_text: str | None = None
    source_label: str | None = None
    sort_order: int | None = None


class ResearchProjectEvidenceReorderRequest(BaseModel):
    evidence_ids: list[int] = Field(default_factory=list)


class ResearchProjectEvidenceOut(BaseModel):
    id: int
    project_id: int
    paper_id: int | None
    paper_title: str | None = None
    summary_id: int | None
    paragraph_id: int | None
    kind: str
    excerpt: str
    note_text: str
    source_label: str
    sort_order: int
    created_at: datetime
    updated_at: datetime


class ResearchProjectOutputOut(BaseModel):
    id: int
    project_id: int
    output_type: str
    title: str
    content_json: dict[str, Any] = Field(default_factory=dict)
    content_markdown: str = ''
    status: str
    created_at: datetime
    updated_at: datetime


class ResearchProjectOutputUpdateRequest(BaseModel):
    title: str | None = None
    content_json: dict[str, Any] | None = None
    content_markdown: str | None = None
    status: str | None = None


class ResearchProjectReviewInsertRequest(BaseModel):
    evidence_ids: list[int] = Field(default_factory=list)
    placement: str = 'append'
    cursor_index: int | None = None
    target_heading: str = ''


class ResearchProjectActionRequest(BaseModel):
    paper_ids: list[int] = Field(default_factory=list)
    instruction: str = ''


class ResearchProjectCurateReadingListRequest(BaseModel):
    user_need: str = ''
    target_count: int = 100
    selection_profile: str = 'balanced'
    saved_search_id: int | None = None
    sources: list[str] = Field(default_factory=lambda: ['arxiv', 'openalex', 'semantic_scholar'])


class ResearchProjectTaskProgressStepOut(BaseModel):
    step_key: str
    label: str
    status: str
    message: str
    related_paper_ids: list[int] = Field(default_factory=list)
    progress_current: int | None = None
    progress_total: int | None = None
    progress_percent: float | None = None
    progress_unit: str = ''
    progress_meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class ResearchProjectTaskOut(BaseModel):
    id: int
    task_type: str
    status: str
    created_at: datetime
    updated_at: datetime
    progress_steps: list[ResearchProjectTaskProgressStepOut] = Field(default_factory=list)


class ResearchProjectTaskDetailOut(ResearchProjectTaskOut):
    input_json: dict[str, Any] = Field(default_factory=dict)
    output_json: dict[str, Any] = Field(default_factory=dict)
    error_log: str = ''


class ProjectActionLaunchResponse(BaseModel):
    task: ResearchProjectTaskDetailOut
    detail_url: str
    stream_url: str


class LinkedSummaryArtifactOut(BaseModel):
    id: int
    summary_type: str
    provider: str = ''
    model: str = ''
    created_at: datetime


class LinkedReflectionArtifactOut(BaseModel):
    id: int
    stage: str
    lifecycle_status: str
    report_summary: str = ''
    event_date: date | None = None
    created_at: datetime


class LinkedReproductionArtifactOut(BaseModel):
    id: int
    status: str
    progress_summary: str = ''
    progress_percent: float | None = None
    updated_at: datetime


class ResearchProjectLinkedArtifactsOut(BaseModel):
    paper_id: int
    paper_title: str
    summaries: list[LinkedSummaryArtifactOut] = Field(default_factory=list)
    reflections: list[LinkedReflectionArtifactOut] = Field(default_factory=list)
    reproductions: list[LinkedReproductionArtifactOut] = Field(default_factory=list)


class ResearchProjectSmartViewOut(BaseModel):
    key: str
    label: str
    count: int = 0


class ProjectDuplicatePaperOut(BaseModel):
    paper: PaperOut
    evidence_count: int = 0
    summary_count: int = 0
    reflection_count: int = 0
    reproduction_count: int = 0
    is_in_project: bool = False
    merged: bool = False


class ProjectDuplicateGroupOut(BaseModel):
    key: str
    reason: str
    papers: list[ProjectDuplicatePaperOut] = Field(default_factory=list)


class ProjectDuplicateSummaryOut(BaseModel):
    group_count: int = 0
    paper_count: int = 0


class ProjectDuplicateMergeRequest(BaseModel):
    canonical_paper_id: int
    merged_paper_ids: list[int] = Field(default_factory=list)


class ProjectDuplicateListResponse(BaseModel):
    groups: list[ProjectDuplicateGroupOut] = Field(default_factory=list)


class ProjectActivityEventOut(BaseModel):
    id: int
    project_id: int
    event_type: str
    title: str
    message: str
    ref_type: str = ''
    ref_id: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ResearchProjectPaperBatchStateRequest(BaseModel):
    paper_ids: list[int] = Field(default_factory=list)
    reading_status: str | None = None
    repro_interest: str | None = None
    read_at: date | None = None
    clear_read_at: bool | None = None
    is_core_paper: bool | None = None


class ResearchProjectPaperBatchStateResponse(BaseModel):
    updated_paper_ids: list[int] = Field(default_factory=list)


class ResearchProjectPaperBatchAddItem(BaseModel):
    paper_id: int
    selection_reason: str = ''
    saved_search_candidate_id: int | None = None


class ResearchProjectPaperBatchAddRequest(BaseModel):
    items: list[ResearchProjectPaperBatchAddItem] = Field(default_factory=list)


class ResearchProjectPaperBatchAddResponse(BaseModel):
    items: list[ResearchProjectPaperOut] = Field(default_factory=list)


class ResearchProjectWorkspaceResponse(BaseModel):
    project: ResearchProjectOut
    papers: list[ResearchProjectPaperOut] = Field(default_factory=list)
    evidence_items: list[ResearchProjectEvidenceOut] = Field(default_factory=list)
    outputs: list[ResearchProjectOutputOut] = Field(default_factory=list)
    recent_tasks: list[ResearchProjectTaskOut] = Field(default_factory=list)
    linked_existing_artifacts: list[ResearchProjectLinkedArtifactsOut] = Field(default_factory=list)
    smart_views: list[ResearchProjectSmartViewOut] = Field(default_factory=list)
    activity_timeline_preview: list[ProjectActivityEventOut] = Field(default_factory=list)
    duplicate_summary: ProjectDuplicateSummaryOut = Field(default_factory=ProjectDuplicateSummaryOut)


class ResearchProjectEvidenceReorderResponse(BaseModel):
    items: list[ResearchProjectEvidenceOut] = Field(default_factory=list)


class ProjectSearchFilters(BaseModel):
    sources: list[str] = Field(default_factory=lambda: ['arxiv'])
    year_from: int | None = None
    year_to: int | None = None
    venue_query: str = ''
    require_pdf: bool | None = None
    project_membership: str = 'all'
    has_summary: bool | None = None
    has_reflection: bool | None = None
    has_reproduction: bool | None = None
    reading_status: str = ''
    repro_interest: str = ''


class ResearchProjectSearchRunCreateRequest(BaseModel):
    query: str
    filters: ProjectSearchFilters = Field(default_factory=ProjectSearchFilters)
    sort_mode: str = 'relevance'


class ResearchProjectSearchRunOut(BaseModel):
    id: int
    project_id: int
    saved_search_id: int | None = None
    query: str
    filters: ProjectSearchFilters = Field(default_factory=ProjectSearchFilters)
    sort_mode: str
    result_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime


class ResearchProjectSearchRunDetailOut(BaseModel):
    run: ResearchProjectSearchRunOut
    items: list[SearchCandidateOut] = Field(default_factory=list)


class ResearchProjectSavedSearchCreateRequest(BaseModel):
    title: str = ''
    query: str
    filters: ProjectSearchFilters = Field(default_factory=ProjectSearchFilters)
    sort_mode: str = 'relevance'
    source_run_id: int | None = None


class ResearchProjectSavedSearchUpdateRequest(BaseModel):
    title: str | None = None
    query: str | None = None
    filters: ProjectSearchFilters | None = None
    sort_mode: str | None = None


class ResearchProjectSavedSearchOut(BaseModel):
    id: int
    project_id: int
    title: str
    query: str
    filters: ProjectSearchFilters = Field(default_factory=ProjectSearchFilters)
    search_mode: str = 'manual'
    user_need: str = ''
    selection_profile: str = 'balanced'
    target_count: int = 0
    sort_mode: str
    last_run_id: int | None = None
    last_result_count: int = 0
    created_at: datetime
    updated_at: datetime


class ResearchProjectSavedSearchCandidateUpdateRequest(BaseModel):
    triage_status: str | None = None


class ResearchProjectSavedSearchDetailOut(BaseModel):
    saved_search: ResearchProjectSavedSearchOut
    last_run: ResearchProjectSearchRunOut | None = None
    items: list[SearchCandidateOut] = Field(default_factory=list)


class ResearchProjectSavedSearchAiReasonResponse(BaseModel):
    item: SearchCandidateOut
