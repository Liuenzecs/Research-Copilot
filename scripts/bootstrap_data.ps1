$ErrorActionPreference = "Stop"
Push-Location "../backend"
python -m app.db.init_db
Pop-Location
Write-Host "Local data directories and database bootstrapped."
