$ErrorActionPreference = "Stop"
Push-Location "../backend"
if (Test-Path .\.venv\Scripts\Activate.ps1) { .\.venv\Scripts\Activate.ps1 }
python -m app.db.init_db
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
Pop-Location
