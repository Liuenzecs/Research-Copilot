# Architecture

## System Overview
- Local-first single-user research workbench.
- Backend: FastAPI modular monolith.
- Frontend: Next.js App Router 3-column professional UI.
- CLI: Typer wrappers over backend APIs.
- Persistence: SQLite + local filesystem + Chroma.

## Research Workflow Orientation
- Canonical English content for papers/summaries.
- Optional Chinese overlays for translation units.
- Research-state tracking per paper:
  - reading_status: unread | skimmed | deep_read | archived
  - interest_level: 1-5
  - repro_interest: none | low | medium | high
  - user_rating: 1-5
  - last_opened_at
  - topic_cluster
  - is_core_paper
- Structured reflections are first-class objects (not generic notes).

## Audit and Traceability
- Each major workflow run records `tasks` and `task_artifacts`.
- Workflows: search, download, summaries, translation, brainstorm, repo finder, reproduction planning, reflections.
- Task history is audit-oriented with archive/status transitions (no hard delete in MVP).

## Reflection Subsystem
- Reflection types: paper, reproduction.
- Lifecycle: draft | finalized | archived.
- Optional link to workflow history via `related_task_id`.
- Timeline view merges reflection events with related task metadata.
- ReflectionMemory entries are linked into long-term memory.
