$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendUrl = "http://127.0.0.1:3101"

$env:VITE_API_BASE = "http://127.0.0.1:8010"

Set-Content -Path (Join-Path $PSScriptRoot ".frontend_url") -Value $frontendUrl -Encoding ASCII

Push-Location (Join-Path $repoRoot "frontend")
try {
    npm run dev -- --host 127.0.0.1 --port 3101
} finally {
    Pop-Location
}
