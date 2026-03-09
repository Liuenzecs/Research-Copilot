# API Spec (MVP)

## Core Research APIs
- `GET /health`
- `POST /papers/search`
- `POST /papers/download`
- `GET /papers/{id}`
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
- `POST /reproduction/plan`
- `POST /reproduction/execute`
- `POST /memory/query`
- `POST /memory/link`
- `POST /memory/archive`
- `GET /library/list`
- `GET /settings/providers`

## Reflection APIs
- `POST /reflections`
- `PATCH /reflections/{id}`
- `GET /reflections`
- `GET /reflections/{id}`
- `GET /reflections/timeline`

## Task/Audit APIs
- `POST /tasks`
- `GET /tasks`
- `GET /tasks/{id}`
- `PATCH /tasks/{id}`
- `POST /tasks/{id}/artifacts`
- `GET /tasks/{id}/artifacts`

Notes:
- Task records use archive/status updates in MVP; no hard delete route.
- Reproduction execution endpoint is guarded MVP mode (plan-first, non-auto-executing).
