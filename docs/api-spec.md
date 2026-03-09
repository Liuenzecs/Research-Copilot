# API Spec (MVP + V1 Workflow Hardening)

## Core Research APIs
- `GET /health`
- `POST /papers/search`
- `POST /papers/download`
- `GET /papers/{id}`
- `GET /papers/{id}/workspace`
- `PATCH /papers/{id}/research-state`
- `POST /papers/{id}/reflections`
- `POST /papers/{id}/memory`
- `POST /summaries/quick`
- `POST /summaries/deep`
- `POST /summaries/compare`
- `POST /translation/key-fields`
- `POST /translation/segment`
- `POST /brainstorm/ideas`
- `POST /brainstorm/gap-analysis`
- `POST /brainstorm/survey-outline`
- `POST /brainstorm/proposal`
- `POST /repos/find`
- `GET /library/list`
- `GET /settings/providers`

## Reproduction APIs
- `POST /reproduction/plan`
- `GET /reproduction/{id}`
- `PATCH /reproduction/{id}`
- `PATCH /reproduction/{id}/steps/{step_id}`
- `POST /reproduction/{id}/reflections`
- `POST /reproduction/execute`

## Reflection APIs
- `POST /reflections`
- `PATCH /reflections/{id}`
- `GET /reflections`
- `GET /reflections/{id}`
- `GET /reflections/timeline`

Supported reflection filters:
- `reflection_type`
- `lifecycle_status`
- `date_from`, `date_to`
- `related_paper_id`
- `related_summary_id`
- `related_repo_id`
- `related_reproduction_id`
- `related_task_id`

## Weekly Reporting APIs
- `GET /reports/weekly/context`
- `POST /reports/weekly/drafts`
- `GET /reports/weekly/drafts`
- `GET /reports/weekly/drafts/{id}`
- `PATCH /reports/weekly/drafts/{id}`

## Memory APIs
- `POST /memory/query`
- `POST /memory/link`
- `POST /memory/archive`

## Task/Audit APIs
- `POST /tasks`
- `GET /tasks`
- `GET /tasks/{id}`
- `PATCH /tasks/{id}`
- `POST /tasks/{id}/artifacts`
- `GET /tasks/{id}/artifacts`

`GET /tasks` supports traceability filters:
- `include_archived`
- `status`
- `task_type`
- `artifact_ref_type`
- `artifact_ref_id`
- `date_from`, `date_to`

Notes:
- Task records use archive/status updates in MVP; no hard delete route.
- Task artifacts are immutable audit snapshots.
- Reproduction execution endpoint remains guarded (plan-first, manual-confirm policy).

