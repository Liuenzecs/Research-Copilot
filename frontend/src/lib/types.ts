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
};

export type Summary = {
  id: number;
  paper_id: number;
  summary_type: string;
  content_en: string;
};

export type Reflection = {
  id: number;
  reflection_type: string;
  template_type: string;
  stage: string;
  lifecycle_status: 'draft' | 'finalized' | 'archived';
  content_structured_json: Record<string, string>;
  content_markdown: string;
  is_report_worthy: boolean;
  report_summary: string;
  event_date: string;
};

export type Task = {
  id: number;
  task_type: string;
  status: string;
  created_at: string;
};
