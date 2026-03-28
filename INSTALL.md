# Installation Guide

Use this guide when setting up the project on another system.

## Prerequisites

- Python `3.10+`
- Node.js `20+`
- npm `10+`

Check versions:

```powershell
python --version
node -v
npm -v
```

## Quick Install (Windows)

Run from repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

This will:

1. Create `.venv` if missing
2. Install backend dependencies from `requirements.txt`
3. Install frontend dependencies using `npm ci`

If you intentionally want `npm install` instead of `npm ci`:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -UseNpmInstall
```

## Manual Install

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
```

## Run

```powershell
npm run dev:backend
npm run dev
```

Or both:

```powershell
npm run dev:all
```

## Dependency Sources

- Frontend exact dependency tree: `package-lock.json`
- Frontend declared packages: `package.json`
- Backend Python packages: `requirements.txt`
- Human-readable dependency summary: `DEPENDENCIES.md`
