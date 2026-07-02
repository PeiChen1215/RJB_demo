$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot ".conda\python.exe"
$backend = Join-Path $repoRoot "backend"

if (-not (Test-Path $python)) {
  throw "Project conda environment not found at $python. Create it with: conda env create -p .\.conda -f environment.yml"
}

Push-Location $backend
try {
  & $python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
}
finally {
  Pop-Location
}
