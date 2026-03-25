# Satellite Image Analysis for Drift Correction

GNSS-denied visual navigation using live imagery aligned to satellite maps for drift correction in visual odometry. The system receives camera frames, matches them against georeferenced rasters, and outputs corrected position estimates with confidence.

## What This Software Does

1. Visual control center for assets, missions, and map operations.
2. Map-based module UI for APC controls and diagnostics.
3. Training pipeline UI for dataset ingest, preprocessing, training, evaluation, and export.
4. Backend API for telemetry, commands, APC frame ingestion, and offline map tiles.

## Key Features

1. Map view with overlays and mission planning tools.
2. Asset management (Sky, Terra, Aqua, Space) with detailed series and specs.
3. APC control panel with configuration options for every stage.
4. Training pipeline panel (ingest -> preprocess -> train -> evaluate -> export).
5. Backend endpoints for APC frames and training workflow (development scaffold).

## Project Structure

- `src/` frontend React UI
- `app/backend/` FastAPI backend

## Setup

Windows note: if backend dependency installation fails in `app/backend/.venv` because the repo path is too long, use a short virtual environment path such as `C:\venvs\apc-gcs`.

### Frontend setup

```powershell
npm install
```

### Backend setup

```powershell
python -m venv C:\venvs\apc-gcs
C:\venvs\apc-gcs\Scripts\python.exe -m pip install --upgrade pip
C:\venvs\apc-gcs\Scripts\python.exe -m pip install -r app\backend\requirements.txt
```

## Run

### Run frontend and backend together

From the repo root:

```powershell
npm run dev:all
```

This starts:

- frontend on `http://localhost:8080`
- backend on `http://localhost:9000`

### Run frontend only

```powershell
npm run dev
```

### Run backend only

```powershell
C:\venvs\apc-gcs\Scripts\python.exe -m uvicorn app.backend.api:app --host 0.0.0.0 --port 9000
```

Default backend port is `9000`.

### If port 9000 is already in use

Stop the old backend process, then start again:

```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 9000).OwningProcess -Force
npm run dev:all
```

### Health check

```powershell
Invoke-WebRequest http://localhost:9000/health
```

## Environment

Set these in `.env.local` or your shell:

- `VITE_CHAOX_API_BASE`
- `VITE_CHAOX_WS_BASE`
- `APC_ORTHO_PATH` (orthomosaic GeoTIFF)
- `APC_DEM_PATH` (DEM GeoTIFF)

## APC (Absolute Position Correction) API

REST:

- `POST /apc/frame` submit a frame (JSON with `image_b64` + metadata)
- `GET /apc/status` last result + config
- `GET /apc/config` get APC config
- `POST /apc/config` set APC config

WebSocket:

- `ws://<host>:9000/ws/apc` send frame JSON and receive correction results
- `ws://<host>:9000/camera` send base64 JPEG frames (Pi camera ingest)

Default APC response:

```json
{
  "frame_id": "f-001",
  "timestamp": "2026-02-12T12:00:00Z",
  "lat": 28.61395,
  "lon": 77.20895,
  "alt": 120.5,
  "yaw": 45.0,
  "confidence": 0.92,
  "error_radius_m": 12.0,
  "source": "apc-dev"
}
```

## APC Training API (Scaffold)

- `GET /apc/train/status`
- `GET /apc/train/config`
- `POST /apc/train/config`
- `POST /apc/train/start`
- `POST /apc/train/stop`

These endpoints are wired for development and will be connected to the real training pipeline and model artifacts.

## Benchmark Pipeline

The backend now includes a manifest-driven benchmark scaffold for the APC matching stack. It is organized to compare:

- `template` for the existing NCC/template baseline
- `orb` for a classical geometric baseline
- `superpoint_lightglue` as a local matching extension point
- `loftr` as a dense local matching extension point
- `transgeo` as a coarse retrieval baseline interface
- `transgeo_loftr` as a hybrid retrieval-plus-refinement pipeline

The learned methods are scaffolded as adapters so you can plug in real backends later without changing the benchmark runner. The retrieval baseline currently uses a simple embedding fallback and is marked in the result metadata.

### Benchmark manifest

Use [`app/backend/benchmark/example_manifest.json`](app/backend/benchmark/example_manifest.json) as the template. Each sample includes:

- one drone frame path
- the ground-truth coordinate
- a list of satellite candidate tiles with center coordinates
- optional yaw/altitude metadata for preprocessing

### Run benchmark from CLI

```powershell
C:\venvs\apc-gcs\Scripts\python.exe -m app.backend.benchmark.cli app\backend\benchmark\example_manifest.json
```

### Optional ML matcher install

To enable learned local matchers:

```powershell
# Install PyTorch first using the command for your platform from pytorch.org
C:\venvs\apc-gcs\Scripts\python.exe -m pip install -r app\backend\requirements-ml.txt
```

For LightGlue, install the upstream project after PyTorch:

```powershell
git clone https://github.com/cvg/LightGlue.git
cd LightGlue
C:\venvs\apc-gcs\Scripts\python.exe -m pip install -e .
```

`LoFTR` will activate automatically once `torch` and `kornia` are installed. `SuperPoint + LightGlue` will activate automatically once the upstream `lightglue` package is installed.

### Internal Visual Localization Module

The backend now carries a vendored in-repo copy of the upstream `visual_localization` project under [`app/backend/vendor_visual_localization`](app/backend/vendor_visual_localization). The APC pipeline imports that duplicated source tree directly and runs `SuperPoint + SuperGlue` in-process.

To enable the internal module, install the extra runtime dependencies:

```powershell
C:\venvs\apc-gcs\Scripts\python.exe -m pip install -r app\backend\requirements-ml.txt
```

Then configure the following in the frontend APC panel:

- select `Visual Localization` in `Tile Matching Backend`
- set `Map DB path`
- save the config

If the vendored module is enabled and ready, APC will try it first during frame matching and fall back to the native matcher if it fails.

### Run benchmark from API

```powershell
Invoke-RestMethod `
  -Uri http://localhost:9000/benchmark/run `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{
    manifest_path = "app/backend/benchmark/example_manifest.json"
    methods = @("template", "orb", "transgeo", "transgeo_loftr")
  } | ConvertTo-Json)
```

### List available benchmark methods

```powershell
Invoke-RestMethod http://localhost:9000/benchmark/methods
```

## Notes

- Coarse matching + EKF are wired; replace `coarse_match.py` with your real model later.
- WebSocket accepts JSON messages with `image_b64` (base64 JPEG) by default.
