# Absolute Position Correction - Map-Based Localization

A command-and-control UI plus a backend scaffold for absolute position correction (APC) using map-based localization. The system receives camera frames, aligns them to georeferenced map tiles, and outputs corrected position estimates with confidence.

## What This Software Does

1. Visual control center for assets, missions, and map operations.
2. Map-based module UI for APC controls and diagnostics.
3. Training pipeline UI for dataset ingest, preprocessing, training, evaluation, and export.
4. Backend API for telemetry, commands, and APC frame ingestion over REST or WebSocket.

## Key Features

1. Map view with overlays and mission planning tools.
2. Asset management (Sky, Terra, Aqua, Space) with detailed series and specs.
3. APC control panel with configuration options for every stage.
4. Training pipeline panel (ingest -> preprocess -> train -> evaluate -> export).
5. Backend endpoints for APC frames and training workflow (development scaffold).

## Project Structure

- `src/` frontend React UI
- `app/backend/` FastAPI backend
- `app/frontend/` packaged frontend build (when bundled)

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

Copy `.env.example` to `.env` and configure:

- `VITE_CHAOX_API_BASE`
- `VITE_CHAOX_WS_BASE`

## APC (Absolute Position Correction) API

REST:

- `POST /apc/frame` submit a frame (JSON with `image_b64` + metadata)
- `GET /apc/status` last result + config
- `GET /apc/config` get APC config
- `POST /apc/config` set APC config

WebSocket:

- `ws://<host>:9000/ws/apc` send frame JSON and receive correction results

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

- APC model inference is currently stubbed; plug in the real model in `app/backend/api.py`.
- WebSocket accepts JSON messages with `image_b64` (base64 JPEG) by default.
