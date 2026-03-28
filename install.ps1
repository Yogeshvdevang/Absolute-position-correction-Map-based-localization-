Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

param(
  [switch]$UseNpmInstall
)

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

Write-Host "Validating prerequisites..."
Require-Command "python"
Require-Command "node"
Require-Command "npm"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$venvPath = Join-Path $repoRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts\\python.exe"

if (-not (Test-Path $venvPython)) {
  Write-Host "Creating Python virtual environment at .venv ..."
  python -m venv $venvPath
}

if (-not (Test-Path $venvPython)) {
  throw "Failed to create/access virtual environment at $venvPath"
}

Write-Host "Installing backend dependencies from requirements.txt ..."
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r requirements.txt

if ($UseNpmInstall) {
  Write-Host "Installing frontend dependencies using npm install ..."
  npm install
} else {
  Write-Host "Installing frontend dependencies using npm ci ..."
  npm ci
}

Write-Host ""
Write-Host "Installation complete."
Write-Host "Start backend: npm run dev:backend"
Write-Host "Start frontend: npm run dev"
Write-Host "Start both: npm run dev:all"
