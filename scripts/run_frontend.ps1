$ErrorActionPreference = "Stop"

$frontendDir = Join-Path $PSScriptRoot "..\\frontend"
Push-Location $frontendDir
try {
    Write-Host "Starting desktop development shell"
    npm run desktop:dev
} finally {
    Pop-Location
}
