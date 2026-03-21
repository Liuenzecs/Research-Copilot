$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$backendRoot = Join-Path $repoRoot "backend"
$frontendRoot = Join-Path $repoRoot "frontend"
$resourcesRoot = Join-Path $frontendRoot "src-tauri\\resources\\backend-sidecar"
$workRoot = Join-Path $frontendRoot ".pyinstaller-desktop"
$entryScript = Join-Path $backendRoot "run_desktop_backend.py"
$specFile = Join-Path $frontendRoot "scripts\\research-copilot-backend.spec"

if (-not (Test-Path $entryScript)) {
    throw "Desktop backend entry script not found: $entryScript"
}

if (-not (Test-Path $specFile)) {
    throw "Desktop backend spec file not found: $specFile"
}

if (Test-Path $resourcesRoot) {
    Remove-Item -Recurse -Force $resourcesRoot
}

if (Test-Path $workRoot) {
    Remove-Item -Recurse -Force $workRoot
}

New-Item -ItemType Directory -Force -Path $resourcesRoot | Out-Null
New-Item -ItemType Directory -Force -Path $workRoot | Out-Null

Push-Location $backendRoot
try {
    if (Test-Path ".\\.venv\\Scripts\\Activate.ps1") {
        . .\\.venv\\Scripts\\Activate.ps1
    }

    python -m pip install -r requirements.txt | Out-Null

    python -m PyInstaller `
        --noconfirm `
        --clean `
        --distpath $resourcesRoot `
        --workpath (Join-Path $workRoot "build") `
        $specFile
} finally {
    Pop-Location
}
