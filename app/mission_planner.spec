# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules
from pathlib import Path

app_dir = Path(__file__).resolve().parent
frontend_dir = app_dir / "frontend" / "build"

# Collect dynamic imports used by FastAPI/Uvicorn and runtime imports in launcher.
hiddenimports = []
hiddenimports += collect_submodules("fastapi")
hiddenimports += collect_submodules("uvicorn")
hiddenimports += collect_submodules("pydantic")
hiddenimports += collect_submodules("httpx")
hiddenimports += collect_submodules("websockets")
hiddenimports += collect_submodules("mavsdk")
hiddenimports += [
    "backend.api",
    "backend.models",
    "backend.bridge",
    "backend.system_profile",
    "backend.execution_policy",
    "backend.compute.router",
    "backend.compute.native",
    "mission_planner_cpu",
    "mission_planner_simd",
    "mission_planner_cuda",
]

datas = []
if frontend_dir.exists():
    # Bundle the built frontend so the backend can serve it offline.
    datas.append((str(frontend_dir), "frontend/build"))

block_cipher = None

a = Analysis(
    [str(app_dir / "launcher.py")],
    pathex=[str(app_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="mission_planner",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=True,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    onefile=True,
)
