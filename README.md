# Satellite Image Analysis and SIYI GCS Implementation Guide

This project provides a comprehensive Ground Control Station (GCS) for absolute position correction (APC) using live SIYI camera feeds and satellite map alignment.

## Implementation Overview

- **Frontend**: React-based UI for mission planning, targeting, and diagnostics.
- **Backend**: FastAPI-based server for telemetry, APC frames, and autonomous SIYI tracking.
- **Tracking**: Integrated SIYI A8 Mini model tracking with auto-reacquisition and bulk class filtering.

---

## Deployment on Another Device

To implement this project on a new device (laptop, server, or edge controller), follow these steps.

### 1. Prerequisites (on the New Device)

- **Python**: 3.10+ (Check with `python --version`)
- **Node.js**: 20.x or higher (Check with `node --version`)
- **Network**: The machine must have a direct network path to the SIYI camera (default: `192.168.144.25`).

### 2. Dependency Installation

**Backend Setup:**
We provide a root `requirements.txt` for one-click setup of all core and ML modules.
```powershell
# Create virtual environment
python -m venv .venv
.\.venv\Scripts\activate

# Install all backend requirements (including YOLO/Torch)
pip install -r requirements.txt
```

**Frontend Setup:**
```powershell
npm install
```

### 3. Cross-Device Connectivity Configuration

If you want to access the GCS UI from a different device than the one running the backend:

1.  **Identify Terminal IP**: Find the IPv4 address of the machine running the backend (e.g., `192.168.1.50`).
2.  **Frontend Config**: On your machine, create a `.env.local` file pointing to that IP:
    ```env
    VITE_CHAOX_API_BASE=http://192.168.1.50:9000
    VITE_CHAOX_WS_BASE=ws://192.168.1.50:9000/ws
    ```
3.  **Backend Config**: The backend is already set to bind to `0.0.0.0` (all network interfaces), ensuring it can accept external connections on port **9000**.

---

## Running the Project

### Start Everything (Frontend + Backend)
```powershell
npm run dev:all
```

### Backend Only (for Edge Deployment)
```powershell
.\.venv\Scripts\uvicorn app.backend.api:app --host 0.0.0.0 --port 9000 --reload
```

---

## Troubleshooting Implementation

- **Port Conflict (9000)**: If port 9000 is occupied, kill the process with:
  `Stop-Process -Id (Get-NetTCPConnection -LocalPort 9000).OwningProcess -Force`
- **Missing YOLO Models**: Ensure model weights (e.g., `person.pt`) are placed in the `a18-mini-model-tracking/models/` directory.
- **Long Path Error**: On Windows, keep the repository path short (e.g., `C:\repo\apc`) to avoid file path length limitations during pip install.

## Project Structure

- `src/` - React frontend source code.
- `app/backend/` - FastAPI backend and logic modules.
- `a18-mini-model-tracking/` - Logic for SIYI camera integration and YOLO inference.
- `requirements.txt` - Complete Python dependency manifest.
