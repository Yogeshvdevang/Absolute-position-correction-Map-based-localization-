# Implementation and Deployment Guide - Cross-Device Setup

This project uses a React frontend and a FastAPI backend designed for real-time SIYI camera tracking and absolute position correction (APC). To implement this project on another device (e.g., a server, a dedicated controller, or a different laptop), follow these steps.

## Related Setup Files

- `install.ps1` for one-command Windows installation
- `INSTALL.md` for concise installation and run commands
- `DEPENDENCIES.md` for current dependency listing

## System Requirements

- **Python**: 3.10 to 3.12 (Check with `python --version`)
- **Node.js**: 20.x or higher (Check with `node --version`)
- **NPM**: 10.x or higher
- **Network**: The "another device" must be on the same local network (LAN) as the SIYI camera and any other telemetry sources.

## Connectivity Setup (Crucial for Cross-Device Support)

If you are running the backend on a different device than the one you use to view the frontend, you must configure the IP addresses correctly.

1.  **Identify the Backend Device IP**:
    *   On Windows: `ipconfig` (find the IPv4 address).
    *   On Linux: `hostname -I` or `ip addr`.
    *   Example: `192.168.1.50`

2.  **Environment Configuration**: Create a `.env.local` file in the project root of the **frontend** machine:
    ```env
    VITE_CHAOX_API_BASE=http://192.168.1.50:9000
    VITE_CHAOX_WS_BASE=ws://192.168.1.50:9000/ws
    ```

3.  **Firewall**: Ensure port **9000** (backend) and port **5173** (if running frontend dev server) are open on the backend device's firewall.

---

## Installation via Root Requirements

### 1. Backend Implementation

We provide a root `requirements.txt` that includes all necessary base and ML dependencies for the SIYI tracker and APC pipeline.

```powershell
# Create a virtual environment (recommended)
python -m venv .venv
.\.venv\Scripts\activate

# Install all dependencies (Backend + ML + Tracker)
pip install -r requirements.txt
```

### 2. Frontend Implementation

```powershell
npm install
```

---

## Implementation on the New Device

### Scenario A: Running Both Backend and Frontend on the Same New Device

```powershell
npm run dev:all
```
Your UI will be available at `http://localhost:5173`.

### Scenario B: Dedicated Backend Device (Recommended for Performance)

If you want to run the backend as a central server:

1.  **Run the Backend**:
    ```powershell
    # Bind to 0.0.0.0 to allow incoming connections from other devices
    .\.venv\Scripts\uvicorn app.backend.api:app --host 0.0.0.0 --port 9000
    ```

2.  **Access from Another Device**: Open your browser on the second device and go to `http://<backend-ip>:5173` (if frontend is also hosted there) or host the frontend separately.

---

## Troubleshooting Guide

- **Connection Refused**: Ensure the backend is listening on `0.0.0.0`, not just `127.0.0.1`. In `package.json`, the `dev:backend` script is already configured to use `--host 0.0.0.0`.
- **SIYI Camera Offline**: Verify the camera IP is reachable from the new device using `ping 192.168.144.25`.
- **Long Repo Paths (Windows)**: If installation fails because of long paths, create your virtual environment in a shorter path like `C:\v\gcs`.
- **Port Conflict**: If port 9000 is occupied, use `Stop-Process -Id (Get-NetTCPConnection -LocalPort 9000).OwningProcess -Force` to clear it.

## Key Backend Components

- **`app/backend/api.py`**: The core FastAPI server.
- **`app/backend/icon_tracker_fallback.py`**: The SIYI object tracker logic (Fallback/Main).
- **`app/backend/models.py`**: Pydantic data schemas.
