# Dependencies

This file lists the dependency sources used by this project.

## Frontend (Node)

- Declared dependencies and scripts: `package.json`
- Locked, reproducible dependency graph: `package-lock.json`

Use:

```powershell
npm ci
```

## Backend (Python)

Backend install list (top-level):

- `fastapi==0.115.5`
- `uvicorn[standard]==0.32.1`
- `mavsdk==2.8.0`
- `websockets==12.0`
- `httpx==0.27.2`
- `numpy==1.26.4`
- `opencv-python==4.10.0.84`
- `rasterio==1.3.10`
- `ultralytics>=8.3.0`
- `torch>=2.0.0`
- `torchvision>=0.15.0`
- `kornia>=0.7`
- `pandas>=2.0`
- `scipy>=1.10`
- `tqdm>=4.66`
- `matplotlib>=3.7`
- `pyyaml>=6.0`
- `pydantic>=2.0`

Source file:

- `requirements.txt`

Install with:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```
