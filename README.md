# Research Copilot

Research Copilot is a local-first, single-user research workbench (not chatbot-style) for:
- paper search (arXiv + Semantic Scholar default)
- arXiv PDF download
- quick/deep summaries
- optional Chinese translation overlays
- brainstorm/proposal drafting
- repo finding (GitHub with optional token, rate-limit awareness)
- reproduction planning (plan-first, manual confirmation)
- long-term memory + semantic retrieval
- structured reflections / 研究心得 with timeline
- workflow/task audit history

## Stack
- Backend: FastAPI + SQLAlchemy + SQLite + Chroma
- Frontend: Next.js + TypeScript
- CLI: Typer

## Project Layout
Top-level structure follows the fixed baseline in the planning instructions.

## Local Setup (Windows)

### 1) Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m app.db.init_db
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend
```powershell
cd frontend
npm install
npm run dev
```

### 3) CLI
```powershell
cd cli
python -m pip install -e .
research-cli --help
```

### 4) Helper scripts
```powershell
cd scripts
./setup_dev.ps1
./run_backend.ps1
./run_frontend.ps1
./run_cli.ps1
```

## Environment
Copy `.env.example` to `.env` at project root and set keys if needed.

## MVP Notes
- English paper content is canonical.
- Chinese translation is optional and non-destructive.
- Reflection lifecycle: `draft | finalized | archived`.
- Tasks are audit-oriented and archived via status updates (no hard delete API).
