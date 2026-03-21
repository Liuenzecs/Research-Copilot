# AGENTS

## Purpose

This repository is a desktop-first research workbench for literature search, reading, evidence extraction, reflections, reproduction tracking, and weekly reporting.

The current mainline is:

- Desktop shell: `Tauri v2`
- Frontend: `Vite + React + React Router + TanStack Query`
- Backend: `FastAPI`
- Storage: `SQLite + local filesystem + Chroma`
- Target platform for the main product: `Windows`

`AGENTS.md` is meant to be shared. It should stay in Git and should not be added to `.gitignore`.

## Product Rules

- The product is `desktop-first`, not `web-first`.
- Do not reintroduce `Next.js` runtime assumptions into the current mainline unless that is an explicit product decision.
- Keep the existing route semantics stable:
  - `/projects`
  - `/projects/:projectId`
  - `/papers/:paperId`
  - `/search`
  - `/library`
  - `/reflections`
  - `/reproduction`
  - `/memory`
  - `/dashboard/weekly-report`
  - `/settings`
- UI copy should be Chinese-first.
- Keep the brand name `Research Copilot` in English.
- Keep canonical paper metadata, original paper titles, and source text in their original language when that is the correct domain representation.

## Architecture Map

- `frontend/src/routes`
  - Route-level page entry layer.
  - New pages should land here, not under a legacy `src/app` structure.
- `frontend/src/components`
  - Reusable UI and complex business components.
- `frontend/src/desktop`
  - Desktop shell composition, startup screen, router wiring.
- `frontend/src/lib`
  - API clients, runtime config, query setup, shared helpers, constants, and presentation helpers.
- `frontend/src-tauri`
  - Tauri host, Rust entrypoint, capabilities, bundling config.
- `backend/app/api/routes`
  - HTTP API layer.
- `backend/app/services`
  - Domain services and workflow orchestration.
- `backend/app/models`
  - SQLAlchemy records, domain models, Pydantic schemas.
- `backend/app/db/migrations`
  - Alembic migrations.
- `docs`
  - Product, architecture, API, and planning documents.

## Frontend Conventions

- Use `React Router` for navigation.
- Use `TanStack Query` for server-state reads, cache invalidation, and mutation refresh flows.
- Keep API access organized by domain modules under `frontend/src/lib`, not in a single ever-growing file.
- Preserve the desktop startup pattern:
  - show startup shell first
  - wait for backend readiness in the background
  - enter business routes only after runtime is ready
- Favor route-level lazy loading for heavy pages.
- Avoid bringing back `next/link`, `next/navigation`, or compatibility shims.

## Backend Conventions

- Keep the FastAPI backend modular by domain.
- When changing database schema, add an Alembic migration under `backend/app/db/migrations/versions`.
- Prefer forward-compatible changes; do not silently mutate runtime data in unsafe ways.
- Search, curation, reflections, reporting, and reproduction flows should remain project-aware when the product already models them that way.

## Runtime and Data Rules

- Repo development runtime data uses the canonical path `backend/data`.
- Installed desktop builds should use the user data directory injected by Tauri at runtime.
- Do not hardcode desktop-installed data paths into repo code or docs.
- Editable runtime provider settings are persisted in the desktop data directory under `config/ui_settings.json`.
- Local scratch notes and review artifacts should stay out of Git. Use ignored files such as `LOCAL_CHANGE_NOTES.md` for local memory.

## Provider Rules

- Supported LLM provider modes currently include:
  - `openai`
  - `deepseek`
  - `openai_compatible`
  - `fallback`
- OpenAI-compatible gateways should use the same request semantics as OpenAI-style chat/completions flows.
- Provider settings should remain editable from the desktop Settings UI when possible.

## Build and Run Commands

From the repo root:

- Desktop development:
  - `cd frontend`
  - `npm run desktop:dev`
- Desktop incremental build:
  - `cd frontend`
  - `npm run desktop:build`
- Desktop fresh build:
  - `cd frontend`
  - `npm run desktop:build:fresh`
- Rebundle backend sidecar only:
  - `cd frontend`
  - `npm run desktop:backend:bundle`
- Backend tests:
  - `pytest backend/app/tests -q`
- Frontend production build:
  - `cd frontend`
  - `npm run build`
- Frontend E2E:
  - `cd frontend`
  - `npx playwright test`

## Release and Packaging Notes

- `desktop:build` is the default path. Do not force clean rebuilds for routine work.
- Use `desktop:build:fresh` when you suspect stale artifacts, locked MSI files, or an outdated sidecar bundle.
- The main desktop build cache lives under `frontend/src-tauri/target`.
- The bundled backend sidecar lives under `frontend/src-tauri/resources/backend-sidecar`.

## Documentation Expectations

- Keep `README.md` user-facing and repo-facing.
- Put long design discussions, audits, and planning notes in `docs/`.
- Keep this file focused on contributor and agent guardrails, not product marketing.

## Avoid These Regressions

- Do not revert the product back to a web-first mental model.
- Do not make the main workspace look like multiple equal-weight products stacked on one screen.
- Do not let obviously off-topic papers rank highly for focused technical queries.
- Do not add tracked local logs, build artifacts, cached data, or desktop runtime data to Git.
