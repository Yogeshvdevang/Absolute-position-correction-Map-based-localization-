Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "== APC GCS: one-step dev runner ==" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$backendDir = Join-Path $repoRoot "app/backend"
$repoVenvPy = Join-Path $backendDir ".venv/Scripts/python.exe"
$fallbackVenvPy = "C:\venvs\apc-gcs\Scripts\python.exe"
$venvDir = Split-Path -Parent (Split-Path -Parent $fallbackVenvPy)

if (-not (Test-Path $backendDir)) {
  Write-Error "Backend folder not found: $backendDir"
}

if (-not (Test-Path $repoVenvPy) -and -not (Test-Path $fallbackVenvPy)) {
  Write-Host "Creating backend venv at $venvDir..." -ForegroundColor Yellow
  python -m venv $venvDir
}

$venvPy = if ((Test-Path $repoVenvPy) -and (& $repoVenvPy -m pip show uvicorn *> $null; $LASTEXITCODE -eq 0)) {
  $repoVenvPy
} else {
  $fallbackVenvPy
}

Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
& $venvPy -m pip install --upgrade pip
& $venvPy -m pip install -r (Join-Path $backendDir "requirements.txt")

Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Starting frontend + backend..." -ForegroundColor Green
npm run dev:all
