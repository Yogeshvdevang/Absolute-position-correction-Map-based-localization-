Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "== APC GCS: one-step dev runner ==" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$backendDir = Join-Path $repoRoot "app/backend"
$venvPy = Join-Path $backendDir ".venv/Scripts/python.exe"

if (-not (Test-Path $backendDir)) {
  Write-Error "Backend folder not found: $backendDir"
}

if (-not (Test-Path $venvPy)) {
  Write-Host "Creating backend venv..." -ForegroundColor Yellow
  python -m venv $venvPy.Replace("\Scripts\python.exe","")
}

Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
& $venvPy -m pip install --upgrade pip
& $venvPy -m pip install -r (Join-Path $backendDir "requirements.txt")

Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Starting frontend + backend..." -ForegroundColor Green
npm run dev:all
