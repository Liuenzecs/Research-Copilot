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

Push-Location (Join-Path $PSScriptRoot "..\\backend")
try {
    if (Test-Path .\.venv\Scripts\Activate.ps1) { .\.venv\Scripts\Activate.ps1 }

    python -m app.db.init_db

    $bindHost = if ($env:RESEARCH_COPILOT_HOST) { $env:RESEARCH_COPILOT_HOST } else { "127.0.0.1" }
    $port = if ($env:RESEARCH_COPILOT_PORT) { [int]$env:RESEARCH_COPILOT_PORT } else { 8000 }

    if (-not (Test-PortBindable -BindHost $bindHost -Port $port)) {
        if ($bindHost -eq "0.0.0.0" -and (Test-PortBindable -BindHost "127.0.0.1" -Port $port)) {
            Write-Warning "Cannot bind to 0.0.0.0:$port on this machine. Falling back to 127.0.0.1:$port."
            $bindHost = "127.0.0.1"
        } else {
            $found = $false
            for ($candidate = $port; $candidate -le ($port + 20); $candidate++) {
                if (Test-PortBindable -BindHost $bindHost -Port $candidate) {
                    $port = $candidate
                    $found = $true
                    break
                }
            }
            if (-not $found) {
                throw "No available bindable port found from $port to $($port + 20) on host $bindHost."
            }
            Write-Warning "Default port is not bindable. Using fallback port $port."
        }
    }

    $backendUrl = "http://${bindHost}:$port"
    $backendUrlFile = Join-Path $PSScriptRoot ".backend_url"
    Set-Content -Path $backendUrlFile -Value $backendUrl -Encoding ASCII

    Write-Host "Starting backend on $backendUrl"
    Write-Host "Backend URL saved to $backendUrlFile"
    uvicorn app.main:app --reload --host $bindHost --port $port
} finally {
    Pop-Location
}
