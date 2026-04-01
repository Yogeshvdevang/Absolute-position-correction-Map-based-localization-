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

## NAVISAR Embedded Dashboard Section

The app now includes a dedicated `navisar` section in the left vertical toolbar (below Tracking).

To use it:

1. Start NAVISAR from `/home/yogesh/Documents/navsar-a-pi5` so its web dashboard is running.
2. Open the new `navisar` section in this app.

Default embedded URL:

```text
http://127.0.0.1:8765/
```

Optional override (frontend `.env`):

```text
VITE_NAVISAR_URL=http://127.0.0.1:8765/
```

Backend env override (optional):

```text
NAVISAR_BASE=http://127.0.0.1:8765
NAVISAR_ROOT=/home/yogesh/Documents/navsar-a-pi5
NAVISAR_AUTOSTART=1
```

## Dependency Sources

- Frontend exact dependency tree: `package-lock.json`
- Frontend declared packages: `package.json`
- Backend Python packages: `requirements.txt`
- Human-readable dependency summary: `DEPENDENCIES.md`
