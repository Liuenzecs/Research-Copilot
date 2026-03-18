$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendUrl = "http://127.0.0.1:3001"

$env:NEXT_PUBLIC_API_BASE = "http://127.0.0.1:8010"
$env:RESEARCH_COPILOT_FRONTEND_PORT = "3001"

Set-Content -Path (Join-Path $PSScriptRoot ".frontend_url") -Value $frontendUrl -Encoding ASCII

Push-Location (Join-Path $repoRoot "frontend")
try {
    if (Test-Path ".next") {
        Remove-Item -Recurse -Force ".next"
    }
    npm run dev -- --hostname 127.0.0.1 --port 3001
} finally {
    Pop-Location
}
