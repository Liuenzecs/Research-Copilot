$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeRoot = Join-Path $repoRoot ".e2e-runtime"
$dataDir = Join-Path $runtimeRoot "backend-data"
$dbPath = Join-Path $dataDir "research_copilot_e2e.db"
$fixturePath = Join-Path $repoRoot "backend\app\tests\e2e\search_fixtures.json"

if (Test-Path $runtimeRoot) {
    Remove-Item -Recurse -Force $runtimeRoot
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$dbUrlPath = $dbPath -replace "\\", "/"
$env:RESEARCH_COPILOT_ENV = "e2e"
$env:RESEARCH_COPILOT_HOST = "127.0.0.1"
$env:RESEARCH_COPILOT_PORT = "8010"
$env:RESEARCH_COPILOT_DATA_DIR = $dataDir
$env:RESEARCH_COPILOT_DB_URL = "sqlite:///$dbUrlPath"
$env:RESEARCH_COPILOT_SEARCH_FIXTURE_PATH = $fixturePath
$env:RESEARCH_COPILOT_PROJECT_TASK_STEP_DELAY_MS = "250"

$backendUrl = "http://127.0.0.1:8010"
Set-Content -Path (Join-Path $PSScriptRoot ".backend_url") -Value $backendUrl -Encoding ASCII

Push-Location (Join-Path $repoRoot "backend")
try {
    if (Test-Path .\.venv\Scripts\Activate.ps1) {
        . .\.venv\Scripts\Activate.ps1
    }

    python -m app.db.init_db
    if ($LASTEXITCODE -ne 0) {
        throw "E2E backend database initialization failed."
    }

    python -m app.tests.e2e_seed
    if ($LASTEXITCODE -ne 0) {
        throw "E2E backend seed failed."
    }

    uvicorn app.main:app --host 127.0.0.1 --port 8010
} finally {
    Pop-Location
}
