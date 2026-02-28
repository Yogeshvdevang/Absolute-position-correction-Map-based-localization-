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

## Run (Frontend)

```bash
npm install
npm run dev
```

## Run (Backend)

```bash
cd app/backend
python api.py
```

Default backend port is `9000`.

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

## Notes

- Coarse matching + EKF are wired; replace `coarse_match.py` with your real model later.
- WebSocket accepts JSON messages with `image_b64` (base64 JPEG) by default.
