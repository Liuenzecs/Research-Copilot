export type Paper = {
  id: number;
  source: string;
  source_id: string;
  title_en: string;
  abstract_en: string;
  authors: string;
  year?: number;
  venue?: string;
  pdf_url?: string;
  pdf_local_path?: string;
  created_at?: string;
  updated_at?: string;
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
  last_opened_at?: string | null;
  last_activity_at: string;
  last_activity_label: string;
  is_my_library: boolean;
};

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
  report_worthy_reflections: WeeklyReportReflectionItem[];
  recent_papers: WeeklyReportPaperActivityItem[];
  reproduction_progress: WeeklyReportReproductionItem[];
  blockers: WeeklyReportBlockerItem[];
  next_actions: string[];
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
  report_worthy_reflections: WeeklyReportReflectionItem[];
  recent_papers: WeeklyReportPaperActivityItem[];
  reproduction_progress: WeeklyReportReproductionItem[];
  blockers: WeeklyReportBlockerItem[];
  next_actions: string[];
};

export type WeeklyReportDraft = {
  id: number;
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
  openai_enabled: boolean;
  openai_model: string;
  deepseek_enabled: boolean;
  deepseek_model: string;
  libretranslate_enabled: boolean;
  libretranslate_api_url: string;
  semantic_scholar_api_key_configured: boolean;
  github_token_configured: boolean;
  llm_mode: string;
  runtime_db_url: string;
  runtime_db_path: string;
  runtime_data_dir: string;
  runtime_vector_dir: string;
  notes: string[];
};
