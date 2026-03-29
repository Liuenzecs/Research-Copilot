export type Paper = {
  id: number;
  source: string;
  source_id: string;
  title_en: string;
  abstract_en: string;
  authors: string;
  year?: number;
  venue?: string;
  doi?: string;
  paper_url?: string;
  openalex_id?: string;
  semantic_scholar_id?: string;
  citation_count?: number;
  reference_count?: number;
  pdf_url?: string;
  pdf_local_path?: string;
  created_at?: string;
  updated_at?: string;
};

export type PaperSearchSortMode = 'relevance' | 'year_desc' | 'citation_desc';

export type PaperSearchFilters = {
  sources: string[];
  year_from?: number | null;
  year_to?: number | null;
  venue_query: string;
  require_pdf?: boolean | null;
  project_membership: 'all' | 'in_project' | 'not_in_project' | string;
  has_summary?: boolean | null;
  has_reflection?: boolean | null;
  has_reproduction?: boolean | null;
  reading_status: string;
  repro_interest: string;
};

export type PaperSearchReason = {
  summary: string;
  matched_terms: string[];
  matched_fields: string[];
  source_signals: string[];
  local_signals: string[];
  merged_sources: string[];
  duplicate_count: number;
  score_breakdown: Record<string, number>;
  topic_match_score: number;
  passed_topic_gate: boolean;
  filter_reason: string;
  ranking_reason: string;
};

export type SearchCandidate = {
  candidate_id?: number | null;
  saved_search_id?: number | null;
  run_id?: number | null;
  paper: Paper;
  rank_position: number;
  rank_score: number;
  reason: PaperSearchReason;
  ai_reason_text: string;
  triage_status: 'new' | 'shortlisted' | 'rejected' | string;
  is_in_project: boolean;
  is_downloaded: boolean;
  summary_count: number;
  reflection_count: number;
  reproduction_count: number;
  reading_status: string;
  repro_interest: string;
  selected_by_ai: boolean;
  selection_bucket: string;
  selection_rank?: number | null;
  matched_in_latest_run: boolean;
};

export type PaperSearchResponse = {
  items: SearchCandidate[];
  warnings?: string[];
};

export type PaperCitationTrail = {
  paper: Paper;
  references: SearchCandidate[];
  cited_by: SearchCandidate[];
};

export type Summary = {
  id: number;
  paper_id: number;
  summary_type: string;
  content_en: string;
  problem_en?: string;
  method_en?: string;
  contributions_en?: string;
  limitations_en?: string;
  future_work_en?: string;
  provider?: string;
  model?: string;
  created_at?: string;
  updated_at?: string;
};

export type Reflection = {
  id: number;
  reflection_type: string;
  related_paper_id?: number | null;
  related_summary_id?: number | null;
  related_repo_id?: number | null;
  related_reproduction_id?: number | null;
  related_task_id?: number | null;
  template_type: string;
  stage: string;
  lifecycle_status: 'draft' | 'finalized' | 'archived';
  content_structured_json: Record<string, string>;
  content_markdown: string;
  is_report_worthy: boolean;
  report_summary: string;
  event_date: string;
  created_at?: string;
  updated_at?: string;
};

export type Task = {
  id: number;
  task_type: string;
  status: string;
  trigger_source?: string;
  created_at: string;
  updated_at?: string;
  input_json?: Record<string, unknown>;
  output_json?: Record<string, unknown>;
};

export type PaperResearchState = {
  reading_status: string;
  interest_level: number;
  repro_interest: string;
  user_rating?: number | null;
  read_at?: string | null;
  last_opened_at?: string | null;
  topic_cluster?: string;
  is_core_paper: boolean;
  updated_at?: string;
};

export type PaperWorkspace = {
  paper: Paper;
  research_state: PaperResearchState;
  summaries: Summary[];
  reflections: Reflection[];
  recent_tasks: Task[];
};

export type ResearchProject = {
  id: number;
  title: string;
  research_question: string;
  goal: string;
  status: 'active' | 'paused' | 'archived' | string;
  seed_query: string;
  last_opened_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ResearchProjectListItem = ResearchProject & {
  paper_count: number;
  evidence_count: number;
  output_count: number;
};

export type ResearchProjectPaper = {
  id: number;
  project_id: number;
  paper: Paper;
  sort_order: number;
  pinned: boolean;
  selection_reason: string;
  is_downloaded: boolean;
  summary_count: number;
  reflection_count: number;
  reproduction_count: number;
  latest_summary_id?: number | null;
  latest_reflection_id?: number | null;
  latest_reproduction_id?: number | null;
  latest_reproduction_status?: string;
  evidence_count: number;
  report_worthy_count: number;
  read_at?: string | null;
  pdf_status: 'downloaded' | 'remote_pdf' | 'landing_page_only' | 'missing' | 'error' | string;
  pdf_status_message: string;
  pdf_last_checked_at?: string | null;
  integrity_status: 'normal' | 'warning' | 'updated' | 'retracted' | 'error' | string;
  integrity_note: string;
  metadata_last_checked_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ResearchProjectEvidenceItem = {
  id: number;
  project_id: number;
  paper_id?: number | null;
  paper_title?: string | null;
  summary_id?: number | null;
  paragraph_id?: number | null;
  kind: 'claim' | 'method' | 'result' | 'limitation' | 'question' | string;
  excerpt: string;
  note_text: string;
  source_label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ResearchProjectOutput = {
  id: number;
  project_id: number;
  output_type: 'compare_table' | 'literature_review' | string;
  title: string;
  content_json: Record<string, unknown>;
  content_markdown: string;
  status: 'draft' | 'finalized' | string;
  created_at: string;
  updated_at: string;
};

export type ProjectReviewCitation = {
  paper_id?: number | null;
  evidence_id?: number | null;
  paragraph_id?: number | null;
  summary_id?: number | null;
  source_label?: string;
  paper_title?: string;
  integrity_status?: string;
};

export type ResearchProjectTaskProgressStep = {
  step_key: string;
  label: string;
  status: string;
  message: string;
  related_paper_ids: number[];
  progress_current?: number | null;
  progress_total?: number | null;
  progress_percent?: number | null;
  progress_unit?: string;
  progress_meta?: Record<string, unknown>;
  created_at?: string | null;
};

export type ResearchProjectTask = {
  id: number;
  task_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  progress_steps: ResearchProjectTaskProgressStep[];
};

export type ResearchProjectTaskDetail = ResearchProjectTask & {
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown>;
  error_log: string;
};

export type ProjectActionLaunchResponse = {
  task: ResearchProjectTaskDetail;
  detail_url: string;
  stream_url: string;
};

export type ResearchProjectTaskEvent = {
  type: 'task_started' | 'progress' | 'heartbeat' | 'task_completed' | 'task_failed' | 'workspace_refreshed';
  task_id?: number;
  event_id?: number;
  task?: ResearchProjectTaskDetail;
  step?: ResearchProjectTaskProgressStep;
  workspace?: ResearchProjectWorkspace;
  message?: string;
};

export type AutoSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type LinkedSummaryArtifact = {
  id: number;
  summary_type: string;
  provider?: string;
  model?: string;
  created_at: string;
};

export type LinkedReflectionArtifact = {
  id: number;
  stage: string;
  lifecycle_status: string;
  report_summary: string;
  event_date?: string | null;
  created_at: string;
};

export type LinkedReproductionArtifact = {
  id: number;
  status: string;
  progress_summary: string;
  progress_percent?: number | null;
  updated_at: string;
};

export type ResearchProjectLinkedArtifacts = {
  paper_id: number;
  paper_title: string;
  summaries: LinkedSummaryArtifact[];
  reflections: LinkedReflectionArtifact[];
  reproductions: LinkedReproductionArtifact[];
};

export type ResearchProjectSmartView = {
  key: string;
  label: string;
  count: number;
};

export type ProjectActivityEvent = {
  id: number;
  project_id: number;
  event_type: string;
  title: string;
  message: string;
  ref_type: string;
  ref_id?: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ProjectDuplicatePaper = {
  paper: Paper;
  evidence_count: number;
  summary_count: number;
  reflection_count: number;
  reproduction_count: number;
  is_in_project: boolean;
  merged: boolean;
};

export type ProjectDuplicateGroup = {
  key: string;
  reason: string;
  papers: ProjectDuplicatePaper[];
};

export type ProjectDuplicateSummary = {
  group_count: number;
  paper_count: number;
};

export type ResearchProjectWorkspace = {
  project: ResearchProject;
  papers: ResearchProjectPaper[];
  evidence_items: ResearchProjectEvidenceItem[];
  outputs: ResearchProjectOutput[];
  recent_tasks: ResearchProjectTask[];
  linked_existing_artifacts: ResearchProjectLinkedArtifacts[];
  smart_views: ResearchProjectSmartView[];
  activity_timeline_preview: ProjectActivityEvent[];
  duplicate_summary: ProjectDuplicateSummary;
};

export type ProjectSearchRun = {
  id: number;
  project_id: number;
  saved_search_id?: number | null;
  query: string;
  filters: PaperSearchFilters;
  sort_mode: PaperSearchSortMode | string;
  result_count: number;
  warnings: string[];
  created_at: string;
};

export type ProjectSearchRunDetail = {
  run: ProjectSearchRun;
  items: SearchCandidate[];
};

export type ProjectSavedSearch = {
  id: number;
  project_id: number;
  title: string;
  query: string;
  filters: PaperSearchFilters;
  search_mode: 'manual' | 'ai_curated' | string;
  user_need: string;
  selection_profile: 'balanced' | 'repro_first' | 'frontier_first' | string;
  target_count: number;
  sort_mode: PaperSearchSortMode | string;
  last_run_id?: number | null;
  last_result_count: number;
  created_at: string;
  updated_at: string;
};

export type ProjectSavedSearchDetail = {
  saved_search: ProjectSavedSearch;
  last_run?: ProjectSearchRun | null;
  items: SearchCandidate[];
};

export type PaperAssistantReply = {
  action: string;
  answer_markdown: string;
  provider?: string;
  model?: string;
  locator: Record<string, unknown>;
  suggested_evidence: Record<string, unknown>;
  suggested_review_snippet: string;
};

export type PaperReaderParagraph = {
  paragraph_id: number;
  text: string;
  page_no: number;
  kind: 'heading' | 'body' | 'formula' | 'caption';
  bbox: number[];
};

export type PaperReaderPagePreview = {
  page_no: number;
  image_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
};

export type PaperReaderFigure = {
  figure_id: number;
  page_no: number;
  image_url: string;
  caption_text: string;
  anchor_paragraph_id?: number | null;
  match_mode: 'caption' | 'approximate';
};

export type PaperAnnotation = {
  id: number;
  paper_id: number;
  paragraph_id: number;
  selected_text: string;
  note_text: string;
  created_at: string;
  updated_at: string;
};

export type PaperReader = PaperWorkspace & {
  pdf_downloaded: boolean;
  pdf_status: "queued" | "downloading" | "downloaded" | "remote_pdf" | "landing_page_only" | "missing" | "error" | string;
  pdf_status_message: string;
  reader_ready: boolean;
  paragraphs: PaperReaderParagraph[];
  pages: PaperReaderPagePreview[];
  figures: PaperReaderFigure[];
  annotations: PaperAnnotation[];
  reader_notices: string[];
  text_notice: string;
};

export type LibraryItem = {
  id: number;
  title_en: string;
  authors: string;
  source: string;
  year?: number;
  pdf_local_path?: string;
  is_downloaded: boolean;
  reading_status: string;
  interest_level?: number;
  repro_interest?: string;
  is_core_paper: boolean;
  summary_count: number;
  reflection_count?: number;
  reproduction_count: number;
  memory_count: number;
  in_memory: boolean;
  read_at?: string | null;
  last_opened_at?: string | null;
  last_activity_at: string;
  last_activity_label: string;
  is_my_library: boolean;
};

export type AiReflectionMode = 'quick' | 'critical' | 'advisor';

export type ReproductionStep = {
  id: number;
  step_no: number;
  command: string;
  purpose: string;
  risk_level: string;
  step_status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'skipped';
  progress_note: string;
  blocker_reason: string;
  blocked_at?: string | null;
  resolved_at?: string | null;
  requires_manual_confirm: boolean;
  expected_output: string;
  safe: boolean;
  safety_reason: string;
};

export type ReproductionLog = {
  id: number;
  reproduction_id: number;
  step_id?: number | null;
  log_text: string;
  error_type: string;
  next_step_suggestion: string;
  created_at: string;
};

export type ReproductionPlanResult = {
  reproduction_id: number;
  status: string;
  plan_markdown: string;
  progress_summary: string;
  progress_percent?: number | null;
  steps: ReproductionStep[];
};

export type ReproductionListItem = {
  reproduction_id: number;
  paper_id?: number | null;
  repo_id?: number | null;
  status: string;
  progress_summary: string;
  progress_percent?: number | null;
  updated_at: string;
};

export type ReproductionDetail = ReproductionPlanResult & {
  paper_id?: number | null;
  repo_id?: number | null;
  repo?: RepoCandidate | null;
  steps: ReproductionStep[];
  logs: ReproductionLog[];
  created_at: string;
  updated_at: string;
};

export type RepoCandidate = {
  id: number;
  paper_id?: number | null;
  platform: string;
  repo_url: string;
  owner: string;
  name: string;
  stars: number;
  forks: number;
  readme_summary: string;
  created_at: string;
  updated_at: string;
};

export type RepoFindResponse = {
  items: RepoCandidate[];
  rate_limited: boolean;
  rate_limit_reset: string;
  used_token: boolean;
  paperswithcode: Array<Record<string, unknown>>;
};

export type WeeklyReportContext = {
  week_start: string;
  week_end: string;
  project_id?: number | null;
  report_worthy_reflections: WeeklyReportReflectionItem[];
  recent_papers: WeeklyReportPaperActivityItem[];
  reproduction_progress: WeeklyReportReproductionItem[];
  blockers: WeeklyReportBlockerItem[];
  next_actions: string[];
  project_activity: Array<Record<string, unknown>>;
};

export type WeeklyReportReflectionItem = {
  id: number;
  event_date: string;
  reflection_type: string;
  report_summary: string;
  related_paper_id?: number | null;
  related_paper_title?: string | null;
  related_reproduction_id?: number | null;
  related_task_id?: number | null;
};

export type WeeklyReportPaperActivityItem = {
  paper_id: number;
  title_en: string;
  source: string;
  year?: number | null;
  last_activity_at: string;
  activity_type: string;
  activity_summary: string;
};

export type WeeklyReportReproductionItem = {
  reproduction_id: number;
  paper_id?: number | null;
  paper_title?: string | null;
  repo_id?: number | null;
  repo_label: string;
  status: string;
  progress_percent?: number | null;
  progress_summary: string;
  updated_at: string;
};

export type WeeklyReportBlockerItem = {
  reproduction_id: number;
  paper_id?: number | null;
  paper_title?: string | null;
  step_id: number;
  step_no: number;
  command: string;
  blocker_reason: string;
  blocked_at?: string | null;
};

export type WeeklyReportContextSnapshot = {
  week_start: string;
  week_end: string;
  project_id?: number | null;
  report_worthy_reflections: WeeklyReportReflectionItem[];
  recent_papers: WeeklyReportPaperActivityItem[];
  reproduction_progress: WeeklyReportReproductionItem[];
  blockers: WeeklyReportBlockerItem[];
  next_actions: string[];
  project_activity: Array<Record<string, unknown>>;
};

export type WeeklyReportDraft = {
  id: number;
  project_id?: number | null;
  week_start: string;
  week_end: string;
  title: string;
  draft_markdown: string;
  status: 'draft' | 'finalized' | 'archived';
  source_snapshot_json: Record<string, unknown> | WeeklyReportContextSnapshot;
  generated_task_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type MemoryJumpTarget = {
  kind: 'paper' | 'reproduction' | 'reflection' | 'brainstorm';
  path: string;
};

export type MemoryItem = {
  id: number;
  memory_type: string;
  layer: string;
  text_content: string;
  importance: number;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
  ref_table?: string;
  ref_id?: number | null;
  jump_target?: MemoryJumpTarget | null;
  retrieval_mode: 'semantic' | 'fallback';
  match_reason: string;
  context_hint?: string | null;
};

export type BrainstormIdeaResult = {
  id: number;
  idea_type: string;
  content: string;
};

export type TranslationResult = {
  id: number;
  target_type: string;
  target_id: number;
  unit_type: string;
  field_name: string;
  content_en_snapshot: string;
  content_zh: string;
  disclaimer: string;
};

export type ProviderSettings = {
  primary_llm_provider: string;
  selection_llm_provider: string;
  llm_mode: string;
  openai_enabled: boolean;
  openai_model: string;
  openai_api_key_configured: boolean;
  deepseek_enabled: boolean;
  deepseek_model: string;
  deepseek_api_key_configured: boolean;
  openai_compatible_enabled: boolean;
  openai_compatible_model: string;
  openai_compatible_base_url: string;
  openai_compatible_api_key_configured: boolean;
  libretranslate_enabled: boolean;
  libretranslate_api_url: string;
  libretranslate_api_key_configured: boolean;
  semantic_scholar_api_key_configured: boolean;
  github_token_configured: boolean;
  runtime_db_url: string;
  runtime_db_path: string;
  runtime_data_dir: string;
  runtime_vector_dir: string;
  runtime_settings_path: string;
  notes: string[];
};

export type ProviderSettingsUpdate = Partial<{
  primary_llm_provider: string;
  selection_llm_provider: string;
  openai_api_key: string;
  openai_model: string;
  deepseek_api_key: string;
  deepseek_model: string;
  openai_compatible_api_key: string;
  openai_compatible_model: string;
  openai_compatible_base_url: string;
  semantic_scholar_api_key: string;
  github_token: string;
  libretranslate_api_url: string;
  libretranslate_api_key: string;
}>;
