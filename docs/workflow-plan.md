# Workflow and Audit Plan

## Task Recording
Each major workflow call creates a `tasks` record and related `task_artifacts`.

Tracked workflows:
- paper search
- PDF download
- summary generation
- translation
- brainstorm/proposal
- repo discovery
- reproduction planning
- reflection create/update

## Audit Rules
- Tasks are archived via status/archived fields.
- Hard delete is not part of MVP.
- Artifacts are immutable snapshots for replay/audit.

## Reflection-Task Linkage
Reflections can optionally reference workflow runs through `related_task_id` for timeline traceability.
