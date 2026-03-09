# Database Schema (MVP + V1 Workflow Hardening)

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
  - artifact_ref_type + artifact_ref_id for cross-page traceability

## Reflection Tables
- reflections
  - reflection_type
  - related_paper_id / related_summary_id / related_repo_id / related_reproduction_id
  - related_task_id (nullable)
  - template_type
  - stage
  - lifecycle_status: `draft | finalized | archived`
  - content_structured_json
  - content_markdown
  - is_report_worthy
  - report_summary
  - event_date
  - created_at / updated_at

## Reproduction Tracking Deltas
- reproductions
  - progress_summary
  - progress_percent (0-100, nullable)
- reproduction_steps
  - step_status: `pending | in_progress | done | blocked | skipped`
  - progress_note
  - blocker_reason
  - blocked_at
  - resolved_at

## Weekly Reporting Table
- weekly_reports
  - week_start
  - week_end
  - title
  - draft_markdown
  - status: `draft | finalized | archived`
  - source_snapshot_json
  - generated_task_id
  - created_at / updated_at

## Translation Forward Compatibility
- translations use `unit_type` + `locator_json`:
  - key_field
  - paragraph
  - section
  - selection
- English remains canonical.
- Chinese translation remains optional and non-destructive.

