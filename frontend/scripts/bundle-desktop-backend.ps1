$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendRoot = Join-Path $repoRoot "backend"
$frontendRoot = Join-Path $repoRoot "frontend"
$resourcesRoot = Join-Path $frontendRoot "src-tauri\resources\backend-sidecar"
$bundleOutputRoot = Join-Path $resourcesRoot "research-copilot-backend"
$workRoot = Join-Path $frontendRoot ".pyinstaller-desktop"
$stampRoot = Join-Path $workRoot "stamps"
$entryScript = Join-Path $backendRoot "run_desktop_backend.py"
$specFile = Join-Path $frontendRoot "scripts\research-copilot-backend.spec"
$requirementsFile = Join-Path $backendRoot "requirements.txt"
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"
$depsStamp = Join-Path $stampRoot "desktop-backend-deps.sha256"
$bundleStamp = Join-Path $stampRoot "desktop-backend-bundle.sha256"

function Get-FileSetHash {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Paths
    )

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $builder = New-Object System.Text.StringBuilder
        foreach ($path in ($Paths | Sort-Object -Unique)) {
            if (-not (Test-Path $path)) {
                continue
            }
            $fileHash = (Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLowerInvariant()
            [void]$builder.AppendLine("$path|$fileHash")
        }

        $bytes = [System.Text.Encoding]::UTF8.GetBytes($builder.ToString())
        $hashBytes = $sha.ComputeHash($bytes)
        return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Read-Stamp {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return ""
    }

    return (Get-Content -Raw -Path $Path).Trim()
}

function Write-Stamp {
    param(
        [string]$Path,
        [string]$Value
    )

    $directory = Split-Path -Parent $Path
    if (-not (Test-Path $directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
    Set-Content -Path $Path -Value $Value -NoNewline
}

if (-not (Test-Path $entryScript)) {
    throw "Desktop backend entry script not found: $entryScript"
}

if (-not (Test-Path $specFile)) {
    throw "Desktop backend spec file not found: $specFile"
}

if (-not (Test-Path $requirementsFile)) {
    throw "Backend requirements file not found: $requirementsFile"
}

$dependencyHash = Get-FileSetHash -Paths @($requirementsFile)
$bundleFiles = @(
    $requirementsFile,
    $specFile,
    $entryScript
) + @(
    Get-ChildItem -Path (Join-Path $backendRoot "app") -Recurse -File | Select-Object -ExpandProperty FullName
)
$bundleHash = Get-FileSetHash -Paths $bundleFiles

$existingDepsHash = Read-Stamp -Path $depsStamp
$existingBundleHash = Read-Stamp -Path $bundleStamp
$hasExistingBundle = (Test-Path $bundleOutputRoot) -and (Test-Path (Join-Path $bundleOutputRoot "research-copilot-backend.exe"))

if (-not (Test-Path $workRoot)) {
    New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
}

Push-Location $backendRoot
try {
    if (Test-Path ".\.venv\Scripts\Activate.ps1") {
        . .\.venv\Scripts\Activate.ps1
    }

    $needsDependencyInstall = (-not (Test-Path $venvPython)) -or ($existingDepsHash -ne $dependencyHash)
    if ($needsDependencyInstall) {
        Write-Host "[desktop-backend] Installing backend dependencies..."
        python -m pip install -r requirements.txt | Out-Null
        Write-Stamp -Path $depsStamp -Value $dependencyHash
    } else {
        Write-Host "[desktop-backend] Dependencies unchanged, skipping pip install."
    }

    $needsBundle = (-not $hasExistingBundle) -or ($existingBundleHash -ne $bundleHash)
    if (-not $needsBundle) {
        Write-Host "[desktop-backend] Sidecar bundle unchanged, skipping PyInstaller."
        return
    }

    if (Test-Path $bundleOutputRoot) {
        Remove-Item -Recurse -Force $bundleOutputRoot
    }

    if (Test-Path $workRoot) {
        Get-ChildItem -Path $workRoot -Force |
            Where-Object { $_.Name -ne "stamps" } |
            Remove-Item -Recurse -Force
    }

    if (-not (Test-Path $resourcesRoot)) {
        New-Item -ItemType Directory -Force -Path $resourcesRoot | Out-Null
    }

    Write-Host "[desktop-backend] Bundling desktop backend sidecar..."
    python -m PyInstaller `
        --noconfirm `
        --clean `
        --distpath $resourcesRoot `
        --workpath (Join-Path $workRoot "build") `
        $specFile

    Write-Stamp -Path $bundleStamp -Value $bundleHash
} finally {
    Pop-Location
}
