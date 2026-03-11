$ErrorActionPreference = "Stop"

function Test-PortBindable {
    param(
        [Parameter(Mandatory = $true)][string]$BindHost,
        [Parameter(Mandatory = $true)][int]$Port
    )

    try {
        if ($BindHost -eq "localhost") {
            $BindHost = "127.0.0.1"
        }

        $ip = [System.Net.IPAddress]::Parse($BindHost)
        $listener = [System.Net.Sockets.TcpListener]::new($ip, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

$backendUrlFile = Join-Path $PSScriptRoot ".backend_url"
if (Test-Path $backendUrlFile) {
    $backendUrl = (Get-Content -Path $backendUrlFile -Raw).Trim()
    if ($backendUrl) {
        $env:NEXT_PUBLIC_API_BASE = $backendUrl
        Write-Host "Using backend API base: $backendUrl"
    }
}

$bindHost = "127.0.0.1"
$port = if ($env:RESEARCH_COPILOT_FRONTEND_PORT) { [int]$env:RESEARCH_COPILOT_FRONTEND_PORT } else { 3000 }

if (-not (Test-PortBindable -BindHost $bindHost -Port $port)) {
    $found = $false
    for ($candidate = $port; $candidate -le ($port + 20); $candidate++) {
        if (Test-PortBindable -BindHost $bindHost -Port $candidate) {
            $port = $candidate
            $found = $true
            break
        }
    }
    if (-not $found) {
        throw "No available frontend port from $port to $($port + 20) on host $bindHost."
    }
    Write-Warning "Frontend default port unavailable. Using fallback port $port."
}

$frontendUrl = "http://${bindHost}:$port"
$frontendUrlFile = Join-Path $PSScriptRoot ".frontend_url"
Set-Content -Path $frontendUrlFile -Value $frontendUrl -Encoding ASCII

$frontendDir = Join-Path $PSScriptRoot "..\\frontend"
Push-Location $frontendDir
try {
    if (Test-Path ".next") {
        Write-Host "Cleaning .next cache"
        Remove-Item -Recurse -Force ".next"
    }

    Write-Host "Starting frontend on $frontendUrl"
    npm run dev -- --hostname $bindHost --port $port
} finally {
    Pop-Location
}
