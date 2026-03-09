$ErrorActionPreference = "Stop"

Write-Host "[1/3] Backend setup"
Push-Location "../backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.db.init_db
Pop-Location

Write-Host "[2/3] Frontend setup"
Push-Location "../frontend"
npm install
Pop-Location

Write-Host "[3/3] CLI setup"
Push-Location "../cli"
python -m pip install -e .
Pop-Location

Write-Host "Setup complete"
