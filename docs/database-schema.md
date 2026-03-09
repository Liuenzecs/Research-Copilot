# Database Schema (MVP)

## Core Tables
- papers
- paper_research_state
- summaries
- translations
- notes
- ideas
- repos
- reproductions
- reproduction_steps
- reproduction_logs
- profiles
- memory_items
- memory_links

## Workflow/Audit Tables
- tasks
  - task_type, status, trigger_source
  - input_json, output_json, error_log
  - started_at, finished_at
  - archived_at, archived_by
- task_artifacts
  - immutable snapshots for input/output/intermediate artifacts

## Reflection Tables
- reflections
  - reflection_type
  - related_paper_id / related_repo_id / related_reproduction_id
  - related_task_id (nullable)
  - template_type
  - stage
  - lifecycle_status: draft | finalized | archived
  - content_structured_json
  - content_markdown
  - is_report_worthy
  - report_summary
  - event_date
  - created_at / updated_at

## Translation Forward Compatibility
- translations use `unit_type` + `locator_json`:
  - key_field
  - paragraph
  - section
  - selection
- English remains canonical.
- Chinese translation remains optional and non-destructive.
