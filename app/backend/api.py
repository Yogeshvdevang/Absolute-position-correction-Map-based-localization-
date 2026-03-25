import asyncio
import base64
import os
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple

import httpx
import uvicorn
import websockets
import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .models import VehicleState, MissionPlan, MissionItem
from .system_profile import profile_hardware
from .execution_policy import select_profile
from .compute import init_router
from .ws_camera import camera_receiver
from .ws_camera import frame_buffer
from .maps.raster_manager import RasterManager
from .ai_engine.coarse_match import coarse_match
from .ai_engine.ekf import EKF
from .ai_engine.preprocess import preprocess_frame, Preprocessor
from .benchmark import BenchmarkRunner
from .benchmark.interfaces import BenchmarkRequest
from .vendor_visual_localization.service import VisualLocalizationConfig, VisualLocalizationService
from .icon_tracker_process import ManagedIconTrackerProcess
from .icon_tracker_fallback import IconTrackerFallbackService

# Configuration
BRIDGE_BASE = os.getenv("BRIDGE_BASE", "http://localhost:8000")
BRIDGE_WS = os.getenv("BRIDGE_WS", "ws://localhost:8000/ws")
VEHICLE_ID = os.getenv("VEHICLE_ID", "vehicle-1")
ICON_TRACKER_BASE = os.getenv("ICON_TRACKER_BASE", "http://127.0.0.1:8090").rstrip("/")


class Vehicle(BaseModel):
  id: str
  callsign: str
  link: str = Field(..., description="Upstream MAVLink URL or description")
  type: str = Field("UAV", description="Vehicle type (UAV/UGV/USV/UUV/Satellite/Vehicle)")
  domain: Optional[str] = Field(None, description="Vehicle domain (air/land/water/space)")
  created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MissionUpload(BaseModel):
  items: List[dict]


class TelemetryBatch(BaseModel):
  items: List[VehicleState]


class CommandRequest(BaseModel):
  vehicle_id: str
  command: str
  payload: Optional[dict] = None
  params: Optional[dict] = None


class APCFrame(BaseModel):
  frame_id: Optional[str] = None
  timestamp: Optional[str] = None
  lat: Optional[float] = None
  lon: Optional[float] = None
  alt: Optional[float] = None
  yaw: Optional[float] = None
  pitch: Optional[float] = None
  roll: Optional[float] = None
  image_b64: Optional[str] = None
  meta: Optional[Dict[str, Any]] = None


class APCResult(BaseModel):
  frame_id: Optional[str] = None
  timestamp: Optional[str] = None
  lat: Optional[float] = None
  lon: Optional[float] = None
  alt: Optional[float] = None
  yaw: Optional[float] = None
  confidence: Optional[float] = None
  error_radius_m: Optional[float] = None
  source: str = "apc"
  meta: Optional[Dict[str, Any]] = None


class APCConfig(BaseModel):
  mode: str = Field("dev", description="dev|realtime")
  ws_path: str = Field("/ws/apc", description="WebSocket path for APC frames")
  expect_binary: bool = Field(False, description="Whether WS sends binary JPEG frames")
  accept_base64: bool = Field(True, description="Whether WS/REST accepts base64 JPEG")
  frame_timeout_ms: int = Field(2000, description="Frame timeout for pipeline")
  max_queue: int = Field(4, description="Max queued frames")


class RCConfig(BaseModel):
  profile_id: str = "flysky-fsi6"
  stick_mode: int = 2
  reversed: Dict[str, bool] = Field(default_factory=lambda: {
    "roll": False,
    "pitch": False,
    "yaw": False,
    "throttle": False,
  })
  calibration: Dict[str, Dict[str, int]] = Field(default_factory=lambda: {
    "roll": {"min": 1000, "center": 1500, "max": 2000},
    "pitch": {"min": 1000, "center": 1500, "max": 2000},
    "yaw": {"min": 1000, "center": 1500, "max": 2000},
    "throttle": {"min": 1000, "center": 1000, "max": 2000},
  })


class RCStatus(BaseModel):
  connected: bool = False
  gamepad_id: Optional[str] = None
  axes: Dict[str, float] = Field(default_factory=dict)
  pwm: Dict[str, int] = Field(default_factory=dict)
  buttons: Dict[str, float] = Field(default_factory=dict)
  updated_at: Optional[str] = None


class IconTrackerTargetRequest(BaseModel):
  track_id: int


class IconTrackerModelRequest(BaseModel):
  model_path: str


class IconTrackerClassRequest(BaseModel):
  class_name: str


class IconTrackerMoveRequest(BaseModel):
  yaw: int = 0
  pitch: int = 0


class IconTrackerZoomRequest(BaseModel):
  direction: str


class IconTrackerSpeedRequest(BaseModel):
  speed_scale: float


app = FastAPI(title="C2 API", version="0.1.0")
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

# Resolve frontend build path for both dev and PyInstaller runtime.
_runtime_root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
_default_tracker_root = _runtime_root / "a18-mini-model-tracking"
if not _default_tracker_root.exists():
  _default_tracker_root = _runtime_root.parent / "a18-mini-model-tracking"
ICON_TRACKER_ROOT = Path(os.getenv("ICON_TRACKER_ROOT", _default_tracker_root))
ICON_TRACKER_CAMERA_IP = os.getenv("ICON_TRACKER_CAMERA_IP", "192.168.144.25")
ICON_TRACKER_CAMERA_PORT = int(os.getenv("ICON_TRACKER_CAMERA_PORT", "37260"))
ICON_TRACKER_RTSP_URL = os.getenv("ICON_TRACKER_RTSP_URL", f"rtsp://{ICON_TRACKER_CAMERA_IP}:8554/main.264")
ICON_TRACKER_CAMERA_NAME = os.getenv("ICON_TRACKER_CAMERA_NAME", "A8 Mini")
ICON_TRACKER_AUTOSTART = os.getenv("ICON_TRACKER_AUTOSTART", "0").strip().lower() in {"1", "true", "yes", "on"}
FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", _runtime_root / "frontend" / "build"))
if FRONTEND_DIR.exists():
  app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

  @app.get("/")
  async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")

  @app.get("/{path:path}")
  async def serve_spa(path: str):
    requested = FRONTEND_DIR / path
    if path and requested.exists() and requested.is_file():
      return FileResponse(requested)
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
      return FileResponse(index_path)
    return {"error": "frontend not found"}

# In-memory stores
vehicles: Dict[str, Vehicle] = {}
telemetry_store: Dict[str, VehicleState] = {}
mission_plan: List[MissionItem] = []
bridge_connected = False
apc_config = APCConfig()
apc_last_result: Optional[APCResult] = None
apc_last_frame: Optional[APCFrame] = None
apc_last_ts: Optional[float] = None
apc_raster: Optional[RasterManager] = None
apc_preprocessor: Optional[Preprocessor] = None
apc_init_alt: Optional[float] = None
apc_ekf = EKF()
apc_train_status: Dict[str, Any] = {
  "state": "idle",
  "progress": 0,
  "stage": "idle",
  "last_run": None
}
apc_train_config: Dict[str, Any] = {
  "dataset_path": "/data/apc",
  "batch_size": 16,
  "epochs": 30,
  "lr": 1e-4,
  "augmentations": "medium"
}
rc_config = RCConfig()
rc_status = RCStatus()
benchmark_runner = BenchmarkRunner()
visual_localization = VisualLocalizationService(
  VisualLocalizationConfig(
    map_db_path=None,
    device="cpu",
    resize_size=800,
    matcher_backend="superpoint_superglue",
    enabled=False,
  )
)
icon_tracker_process = ManagedIconTrackerProcess(
  tracker_root=ICON_TRACKER_ROOT,
  base_url=ICON_TRACKER_BASE,
  camera_ip=ICON_TRACKER_CAMERA_IP,
  camera_port=ICON_TRACKER_CAMERA_PORT,
  rtsp_url=ICON_TRACKER_RTSP_URL,
  camera_name=ICON_TRACKER_CAMERA_NAME,
  enabled=ICON_TRACKER_AUTOSTART,
)
icon_tracker_fallback = IconTrackerFallbackService(
  tracker_root=ICON_TRACKER_ROOT,
  camera_ip=ICON_TRACKER_CAMERA_IP,
  camera_port=ICON_TRACKER_CAMERA_PORT,
  rtsp_url=ICON_TRACKER_RTSP_URL,
)
ICON_TRACKER_STATUS_CACHE_TTL_SECONDS = float(os.getenv("ICON_TRACKER_STATUS_CACHE_TTL_SECONDS", "0.35"))
icon_tracker_status_cache: Dict[str, Any] = {"ts": 0.0, "payload": None}
icon_tracker_status_lock = asyncio.Lock()

# Fast-path: track whether the external subprocess tracker is reachable.
# When it's known to be down, all API calls skip the proxy entirely → instant fallback.
_external_tracker_state: Dict[str, Any] = {
  "available": False,
  "last_check_ts": 0.0,
  "recheck_interval": 15.0,  # seconds between re-probing a down tracker
}

# Offline tiles cache
TILE_CACHE_DIR = Path(os.getenv("TILE_CACHE_DIR", _runtime_root / "tile-cache"))
TILE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

TILE_TEMPLATES = {
  "streets": os.getenv("TILE_URL_STREETS", "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"),
  "dark": os.getenv("TILE_URL_DARK", "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png"),
  "satellite": os.getenv("TILE_URL_SATELLITE", "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"),
  "terrain": os.getenv("TILE_URL_TERRAIN", "https://a.tile.opentopomap.org/{z}/{x}/{y}.png"),
}

tiles_job: Dict[str, Any] = {
  "state": "idle",
  "progress": 0,
  "downloaded": 0,
  "total": 0,
  "current": None,
  "started_at": None,
  "stopped": False,
  "error": None,
}


class TileDownloadRequest(BaseModel):
  region_name: Optional[str] = None
  bbox: Optional[Dict[str, float]] = None  # {west, south, east, north}
  min_zoom: int = 0
  max_zoom: int = 12
  map_types: List[str] = Field(default_factory=lambda: ["streets"])
  provider: Optional[str] = None
  max_tiles: Optional[int] = None


class VisualLocalizationTileDbRequest(BaseModel):
  map_type: str = Field("satellite", description="Tile cache map type to export")
  zoom_level: Optional[int] = Field(None, description="Specific zoom level to flatten into the DB")
  output_name: Optional[str] = Field(None, description="Optional folder name for the exported DB")
  activate_for_visual_localization: bool = Field(True, description="Whether to set this DB as the active VL DB")


def _lonlat_to_tile(lon: float, lat: float, z: int) -> Tuple[int, int]:
  import math
  lat = max(min(lat, 85.05112878), -85.05112878)
  n = 2 ** z
  x = int((lon + 180.0) / 360.0 * n)
  y = int((1.0 - math.log(math.tan(math.radians(lat)) + (1 / math.cos(math.radians(lat)))) / math.pi) / 2.0 * n)
  x = max(0, min(n - 1, x))
  y = max(0, min(n - 1, y))
  return x, y


def _tile_ranges_for_bbox(bbox: Dict[str, float], z: int) -> Tuple[int, int, int, int]:
  x_min, y_max = _lonlat_to_tile(bbox["west"], bbox["south"], z)
  x_max, y_min = _lonlat_to_tile(bbox["east"], bbox["north"], z)
  return x_min, x_max, y_min, y_max


def _estimate_tiles(bbox: Dict[str, float], min_zoom: int, max_zoom: int) -> int:
  total = 0
  for z in range(min_zoom, max_zoom + 1):
    x_min, x_max, y_min, y_max = _tile_ranges_for_bbox(bbox, z)
    total += (x_max - x_min + 1) * (y_max - y_min + 1)
  return total


VISUAL_TILE_DB_DIR = Path(os.getenv("VISUAL_TILE_DB_DIR", _runtime_root / "visual-map-dbs"))
VISUAL_TILE_DB_DIR.mkdir(parents=True, exist_ok=True)


def _list_cached_zoom_levels(map_type: str) -> List[int]:
  map_root = TILE_CACHE_DIR / map_type
  if not map_root.exists():
    return []
  zoom_levels: List[int] = []
  for child in map_root.iterdir():
    if child.is_dir() and child.name.isdigit():
      zoom_levels.append(int(child.name))
  return sorted(zoom_levels)


def _export_tile_cache_to_visual_db(req: VisualLocalizationTileDbRequest) -> Dict[str, Any]:
  map_root = TILE_CACHE_DIR / req.map_type
  if not map_root.exists():
    raise FileNotFoundError(f"No cache found for map type: {req.map_type}")

  available_zoom_levels = _list_cached_zoom_levels(req.map_type)
  if not available_zoom_levels:
    raise FileNotFoundError(f"No cached zoom levels found for map type: {req.map_type}")

  zoom_level = req.zoom_level if req.zoom_level is not None else max(available_zoom_levels)
  if zoom_level not in available_zoom_levels:
    raise FileNotFoundError(f"Zoom level {zoom_level} is not cached for map type: {req.map_type}")

  source_zoom_dir = map_root / str(zoom_level)
  output_name = req.output_name or f"{req.map_type}-z{zoom_level}"
  output_dir = VISUAL_TILE_DB_DIR / output_name
  output_dir.mkdir(parents=True, exist_ok=True)

  exported = 0
  for x_dir in sorted(source_zoom_dir.iterdir()):
    if not x_dir.is_dir() or not x_dir.name.isdigit():
      continue
    x_value = int(x_dir.name)
    for tile_file in sorted(x_dir.glob("*.png")):
      try:
        y_value = int(tile_file.stem)
      except ValueError:
        continue
      target_file = output_dir / f"{x_value}_{y_value}_{zoom_level}.png"
      if not target_file.exists() or tile_file.stat().st_mtime > target_file.stat().st_mtime:
        target_file.write_bytes(tile_file.read_bytes())
      exported += 1

  if exported == 0:
    raise FileNotFoundError(f"No PNG tiles found in cache for map type {req.map_type} at zoom {zoom_level}")

  if req.activate_for_visual_localization:
    updated_config = visual_localization.config.model_copy(update={
      "map_db_path": str(output_dir),
      "tile_zoom_level": int(zoom_level),
    })
    visual_localization.update(updated_config)

  return {
    "status": "ready",
    "map_type": req.map_type,
    "zoom_level": int(zoom_level),
    "tile_count": exported,
    "output_dir": str(output_dir),
    "available_zoom_levels": available_zoom_levels,
    "activated": req.activate_for_visual_localization,
    "visual_localization_config": visual_localization.config.model_dump(),
  }


async def _download_tiles(req: TileDownloadRequest):
  tiles_job.update({
    "state": "running",
    "progress": 0,
    "downloaded": 0,
    "total": 0,
    "current": None,
    "started_at": datetime.now(timezone.utc).isoformat(),
    "stopped": False,
    "error": None,
  })

  bbox = req.bbox or {"west": 25.0, "south": -10.0, "east": 180.0, "north": 82.0}
  total = _estimate_tiles(bbox, req.min_zoom, req.max_zoom) * max(1, len(req.map_types))
  if req.max_tiles:
    total = min(total, req.max_tiles)
  tiles_job["total"] = total

  sem = asyncio.Semaphore(8)

  async def fetch_tile(client: httpx.AsyncClient, url: str, path: Path):
    async with sem:
      if tiles_job.get("stopped"):
        return
      if path.exists():
        return
      try:
        resp = await client.get(url, timeout=15)
        if resp.status_code == 200:
          path.parent.mkdir(parents=True, exist_ok=True)
          path.write_bytes(resp.content)
      except Exception:
        tiles_job["error"] = "download_error"

  async with httpx.AsyncClient() as client:
    downloaded = 0
    for map_type in req.map_types:
      template = TILE_TEMPLATES.get(map_type)
      if not template:
        continue
      for z in range(req.min_zoom, req.max_zoom + 1):
        x_min, x_max, y_min, y_max = _tile_ranges_for_bbox(bbox, z)
        for x in range(x_min, x_max + 1):
          for y in range(y_min, y_max + 1):
            if tiles_job.get("stopped"):
              tiles_job["state"] = "stopped"
              return
            url = template.format(z=z, x=x, y=y)
            path = TILE_CACHE_DIR / map_type / str(z) / str(x) / f"{y}.png"
            await fetch_tile(client, url, path)
            downloaded += 1
            tiles_job["downloaded"] = downloaded
            if tiles_job["total"]:
              tiles_job["progress"] = int((downloaded / tiles_job["total"]) * 100)
            if req.max_tiles and downloaded >= req.max_tiles:
              tiles_job["state"] = "complete"
              return

  tiles_job["state"] = "complete"



def _mock_apc_correction(frame: APCFrame) -> APCResult:
  # Placeholder for real model inference. Slightly nudges input coords if available.
  lat = frame.lat
  lon = frame.lon
  if lat is not None and lon is not None:
    lat = lat + 0.00005
    lon = lon - 0.00005
  return APCResult(
    frame_id=frame.frame_id,
    timestamp=frame.timestamp,
    lat=lat,
    lon=lon,
    alt=frame.alt,
    yaw=frame.yaw,
    confidence=0.92,
    error_radius_m=12.0,
    source="apc-dev",
    meta=frame.meta or {}
  )


def _decode_frame(image_b64: Optional[str]) -> Optional[np.ndarray]:
  if not image_b64:
    return None
  try:
    jpg_bytes = base64.b64decode(image_b64)
    np_arr = np.frombuffer(jpg_bytes, np.uint8)
    return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
  except Exception:
    return None


def _run_apc_pipeline(frame: APCFrame) -> APCResult:
  global apc_last_ts
  now = datetime.now(timezone.utc).timestamp()
  dt = 0.1 if apc_last_ts is None else max(0.01, now - apc_last_ts)
  apc_last_ts = now
  apc_ekf.predict(dt)

  img = _decode_frame(frame.image_b64)
  if img is None:
    img = frame_buffer.get()
  if img is not None and visual_localization.config.enabled:
    try:
      external_result = visual_localization.run_frame(
        image=img,
        frame_id=frame.frame_id,
        lat=frame.lat,
        lon=frame.lon,
        alt=frame.alt,
        yaw=frame.yaw,
        pitch=frame.pitch,
        roll=frame.roll,
      )
      if external_result.get("success"):
        fused_lat = external_result.get("predicted_lat")
        fused_lon = external_result.get("predicted_lon")
        if fused_lat is not None and fused_lon is not None:
          z = np.array([[fused_lon], [fused_lat]])
          apc_ekf.update(z)
          state = apc_ekf.state()
          fused_lon = float(state[0, 0])
          fused_lat = float(state[1, 0])
        return APCResult(
          frame_id=frame.frame_id,
          timestamp=frame.timestamp,
          lat=fused_lat,
          lon=fused_lon,
          alt=frame.alt,
          yaw=frame.yaw,
          confidence=0.88,
          error_radius_m=external_result.get("distance_m") or 25.0,
          source="visual_localization",
          meta={
            **(frame.meta or {}),
            "matched_image": external_result.get("matched_image"),
            "num_inliers": external_result.get("num_inliers"),
            "external_output_dir": external_result.get("output_dir"),
          },
        )
    except Exception as exc:
      if frame.meta is None:
        frame.meta = {}
      frame.meta["visual_localization_error"] = str(exc)

  if img is None or apc_raster is None or frame.lat is None or frame.lon is None:
    return _mock_apc_correction(frame)

  if apc_preprocessor is not None:
    global apc_init_alt
    if apc_init_alt is None and frame.alt is not None:
      apc_init_alt = frame.alt
    processed = apc_preprocessor.run(
      frame=img,
      yaw=frame.yaw,
      lat=frame.lat,
      lon=frame.lon,
      baro_alt=frame.alt,
      initial_alt=apc_init_alt
    )
    img = processed.get("frame") or img
  else:
    img = preprocess_frame(img, frame.yaw)

  gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
  h, w = gray.shape[:2]
  tile_size = max(32, min(h, w) // 4)
  y0 = (h - tile_size) // 2
  x0 = (w - tile_size) // 2
  tile = gray[y0:y0 + tile_size, x0:x0 + tile_size]

  map_patch, origin_px, origin_py = apc_raster.crop_patch(frame.lat, frame.lon, size_m=4000)
  score, max_loc = coarse_match(tile, map_patch)
  match_x = int(max_loc[0] * 4)
  match_y = int(max_loc[1] * 4)
  lat, lon = apc_raster.pixel_to_geo(origin_px + match_x, origin_py + match_y)

  z = np.array([[lon], [lat]])
  apc_ekf.update(z)
  state = apc_ekf.state()
  fused_lon = float(state[0, 0])
  fused_lat = float(state[1, 0])

  return APCResult(
    frame_id=frame.frame_id,
    timestamp=frame.timestamp,
    lat=fused_lat,
    lon=fused_lon,
    alt=frame.alt,
    yaw=frame.yaw,
    confidence=float(score),
    error_radius_m=max(5.0, (1.0 - float(score)) * 200),
    source="apc-coarse",
    meta=frame.meta or {}
  )


@app.on_event("startup")
async def startup_event():
  # seed default vehicle
  vehicles[VEHICLE_ID] = Vehicle(id=VEHICLE_ID, callsign="DRONE-1", link=BRIDGE_WS)
  hw_profile = profile_hardware()
  policy = select_profile(hw_profile)
  app.state.compute_router = init_router(policy)
  app.state.hardware_profile = hw_profile
  app.state.execution_profile = policy
  ortho_path = os.getenv("APC_ORTHO_PATH")
  dem_path = os.getenv("APC_DEM_PATH")
  if ortho_path and dem_path:
    try:
      global apc_raster
      global apc_preprocessor
      apc_raster = RasterManager(ortho_path, dem_path)
      apc_preprocessor = Preprocessor(apc_raster)
    except Exception:
      apc_raster = None
      apc_preprocessor = None
  asyncio.create_task(_bridge_telemetry_loop())
  asyncio.create_task(_tracker_availability_loop())
  # Disabled external tracker autostart to avoid port/socket conflicts. 
  # Using the internal IconTrackerFallbackService instead.
  # if ICON_TRACKER_AUTOSTART:
  #   asyncio.create_task(asyncio.to_thread(icon_tracker_process.ensure_running, 2.5))


@app.on_event("shutdown")
async def shutdown_event():
  try:
    icon_tracker_process.shutdown()
  except Exception:
    pass
  try:
    icon_tracker_fallback.shutdown()
  except Exception:
    pass


async def _bridge_telemetry_loop():
  global bridge_connected
  while True:
    try:
      async with websockets.connect(BRIDGE_WS) as ws:
        bridge_connected = True
        async for msg in ws:
          data = None
          try:
            import json
            data = json.loads(msg)
          except Exception:
            continue
          vehicle = vehicles.get(VEHICLE_ID)
          telemetry_store[VEHICLE_ID] = VehicleState(
            vehicle_id=VEHICLE_ID,
            type=vehicle.type if vehicle else "UAV",
            domain=vehicle.domain if vehicle else None,
            lat=data.get("lat", 0.0),
            lon=data.get("lon", 0.0),
            alt=data.get("alt", 0.0),
            roll=data.get("roll"),
            pitch=data.get("pitch"),
            yaw=data.get("yaw"),
            battery=data.get("battery"),
            mode=data.get("mode"),
            groundspeed=data.get("groundspeed"),
            link_quality=data.get("link_quality"),
          )
    except Exception:
      bridge_connected = False
      await asyncio.sleep(2.0)


async def _run_apc_training():
  apc_train_status["state"] = "running"
  apc_train_status["progress"] = 0
  apc_train_status["stage"] = "ingest"
  for stage in ["ingest", "preprocess", "train", "evaluate", "export"]:
    apc_train_status["stage"] = stage
    for i in range(0, 21):
      apc_train_status["progress"] = min(100, int((i / 20) * 100))
      await asyncio.sleep(0.1)
    await asyncio.sleep(0.2)
  apc_train_status["state"] = "complete"
  apc_train_status["progress"] = 100
  apc_train_status["last_run"] = datetime.now(timezone.utc).isoformat()


@app.get("/health")
async def health():
  return {
    "status": "ok",
    "bridge": bridge_connected,
    "bridge_base": BRIDGE_BASE,
    "bridge_ws": BRIDGE_WS,
    "vehicles": len(vehicles),
    "apc": {
      "mode": apc_config.mode,
      "ws_path": apc_config.ws_path
    }
  }


@app.get("/fleet")
async def list_fleet():
  return list(vehicles.values())


@app.post("/fleet")
async def register_vehicle(vehicle: Vehicle):
  vehicles[vehicle.id] = vehicle
  return vehicle


@app.get("/telemetry/{vehicle_id}")
async def get_telemetry(vehicle_id: str):
  return telemetry_store.get(vehicle_id, VehicleState(vehicle_id=vehicle_id, lat=0, lon=0, alt=0))


@app.post("/telemetry")
async def post_telemetry(state: VehicleState):
  telemetry_store[state.vehicle_id] = state
  return {"status": "ok"}


@app.post("/telemetry/batch")
async def post_telemetry_batch(batch: TelemetryBatch):
  for item in batch.items:
    telemetry_store[item.vehicle_id] = item
  return {"status": "ok", "count": len(batch.items)}


@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
  await ws.accept()
  try:
    while True:
      await asyncio.sleep(0.2)
      await ws.send_json([t.dict() for t in telemetry_store.values()])
      if mission_plan:
        await ws.send_json({
          "type": "mission_state",
          "items": [item.dict() for item in mission_plan]
        })
  except WebSocketDisconnect:
    return


@app.get("/mission")
async def mission_get():
  async with httpx.AsyncClient() as client:
    resp = await client.get(f"{BRIDGE_BASE}/mission", timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict) and "items" in data:
      global mission_plan
      mission_plan = []
      for it in data.get("items", []):
        mission_plan.append(MissionItem(
          seq=it.get("seq", 0),
          lat=it.get("lat", 0.0),
          lon=it.get("lon", 0.0),
          alt=it.get("alt", 0.0),
          command=it.get("command", 16),
          params=[
            it.get("param1", 0),
            it.get("param2", 0),
            it.get("param3", 0),
            it.get("param4", 0)
          ]
        ))
    return data


@app.post("/mission")
async def mission_upload(body: MissionUpload):
  async with httpx.AsyncClient() as client:
    resp = await client.post(f"{BRIDGE_BASE}/mission", json=body.dict(), timeout=10)
    resp.raise_for_status()
    # Cache mission plan for WS broadcast
    global mission_plan
    mission_plan = []
    for idx, it in enumerate(body.items):
      mission_plan.append(MissionItem(
        seq=it.get("seq", idx),
        lat=it.get("lat", 0.0),
        lon=it.get("lon", 0.0),
        alt=it.get("alt", 0.0),
        command=it.get("command", 16),
        params=[
          it.get("param1", 0),
          it.get("param2", 0),
          it.get("param3", 0),
          it.get("param4", 0)
        ]
      ))
    return resp.json()

@app.post("/mission/plan")
async def mission_plan_upload(plan: MissionPlan):
  # Convert to bridge payload
  items = []
  for it in plan.items:
    items.append({
      "seq": it.seq,
      "lat": it.lat,
      "lon": it.lon,
      "alt": it.alt,
      "command": it.command,
      "param1": (it.params or [0,0,0,0])[0] if it.params else 0,
      "param2": (it.params or [0,0,0,0])[1] if it.params else 0,
      "param3": (it.params or [0,0,0,0])[2] if it.params else 0,
      "param4": (it.params or [0,0,0,0])[3] if it.params else 0,
    })
  async with httpx.AsyncClient() as client:
    resp = await client.post(f"{BRIDGE_BASE}/mission", json={"items": items}, timeout=10)
    resp.raise_for_status()
    # Cache mission plan for WS broadcast
    global mission_plan
    mission_plan = [MissionItem(**it) if isinstance(it, dict) else it for it in plan.items]
    return resp.json()


@app.post("/mission/start")
async def mission_start():
  async with httpx.AsyncClient() as client:
    resp = await client.post(f"{BRIDGE_BASE}/mission/start", timeout=10)
    resp.raise_for_status()
    return resp.json()


@app.post("/mission/pause")
async def mission_pause():
  async with httpx.AsyncClient() as client:
    resp = await client.post(f"{BRIDGE_BASE}/mission/pause", timeout=10)
    resp.raise_for_status()
    return resp.json()


@app.post("/command")
async def command(body: CommandRequest):
  action = body.command.lower()
  endpoint = None
  if action == "arm":
    endpoint = "/command/arm"
  elif action == "takeoff":
    endpoint = "/command/takeoff"
  elif action == "land":
    endpoint = "/command/land"
  elif action in ("rtl", "return_to_launch"):
    endpoint = "/command/rtl"
  elif action in ("mode", "set_mode"):
    endpoint = "/command/mode"
  else:
    return {"error": f"unsupported command {body.command}"}, 400

  async with httpx.AsyncClient() as client:
    resp = await client.post(f"{BRIDGE_BASE}{endpoint}", json={"action": action, "params": body.params}, timeout=10)
    resp.raise_for_status()
    return resp.json()


@app.get("/apc/status")
async def apc_status():
  return {
    "config": apc_config.dict(),
    "last_result": apc_last_result.dict() if apc_last_result else None,
    "training": apc_train_status
  }


@app.get("/apc/config")
async def apc_get_config():
  return apc_config


@app.post("/apc/config")
async def apc_set_config(cfg: APCConfig):
  global apc_config
  apc_config = cfg
  return apc_config


@app.post("/apc/frame")
async def apc_frame(frame: APCFrame):
  global apc_last_frame, apc_last_result
  apc_last_frame = frame
  apc_last_result = _run_apc_pipeline(frame)
  return apc_last_result


@app.websocket("/ws/apc")
async def ws_apc(ws: WebSocket):
  await ws.accept()
  try:
    while True:
      msg = await ws.receive()
      if "text" in msg and msg["text"]:
        try:
          import json
          payload = json.loads(msg["text"])
          frame = APCFrame(**payload)
        except Exception:
          continue
      elif "bytes" in msg and msg["bytes"]:
        # Binary JPEG frame; wrap into APCFrame without metadata.
        frame = APCFrame(image_b64=None)
      else:
        continue

      global apc_last_frame, apc_last_result
      apc_last_frame = frame
      apc_last_result = _run_apc_pipeline(frame)
      await ws.send_json(apc_last_result.dict())
  except WebSocketDisconnect:
    return


@app.websocket("/camera")
async def camera_ws(websocket: WebSocket):
  await camera_receiver(websocket)


@app.get("/apc/train/status")
async def apc_train_status_get():
  return apc_train_status


@app.get("/apc/train/config")
async def apc_train_config_get():
  return apc_train_config


@app.post("/apc/train/config")
async def apc_train_config_set(payload: Dict[str, Any]):
  apc_train_config.update(payload)
  return apc_train_config


@app.post("/apc/train/start")
async def apc_train_start():
  if apc_train_status.get("state") == "running":
    return {"status": "already_running"}
  asyncio.create_task(_run_apc_training())
  return {"status": "started"}


@app.post("/apc/train/stop")
async def apc_train_stop():
  apc_train_status["state"] = "stopped"
  apc_train_status["stage"] = "idle"
  apc_train_status["progress"] = 0
  return {"status": "stopped"}


@app.get("/rc/config")
async def rc_config_get():
  return rc_config


@app.post("/rc/config")
async def rc_config_set(payload: RCConfig):
  global rc_config
  rc_config = payload
  return rc_config


@app.get("/rc/status")
async def rc_status_get():
  return rc_status


@app.post("/rc/status")
async def rc_status_set(payload: RCStatus):
  global rc_status
  rc_status = payload
  rc_status.updated_at = datetime.now(timezone.utc).isoformat()
  return {"status": "ok", "updated_at": rc_status.updated_at}


@app.get("/tiles/status")
async def tiles_status():
  return tiles_job


@app.post("/tiles/estimate")
async def tiles_estimate(req: TileDownloadRequest):
  bbox = req.bbox or {"west": 25.0, "south": -10.0, "east": 180.0, "north": 82.0}
  total = _estimate_tiles(bbox, req.min_zoom, req.max_zoom) * max(1, len(req.map_types))
  return {"tiles": total}


@app.post("/tiles/download")
async def tiles_download(req: TileDownloadRequest):
  if tiles_job.get("state") == "running":
    return {"status": "already_running"}
  asyncio.create_task(_download_tiles(req))
  return {"status": "started"}


@app.post("/tiles/cancel")
async def tiles_cancel():
  tiles_job["stopped"] = True
  return {"status": "stopping"}


@app.get("/tiles/visual-localization-db")
async def visual_localization_tile_db_status():
  return {
    "cache_root": str(TILE_CACHE_DIR),
    "db_root": str(VISUAL_TILE_DB_DIR),
    "cached_zoom_levels": {
      map_type: _list_cached_zoom_levels(map_type)
      for map_type in TILE_TEMPLATES.keys()
    },
    "active_map_db_path": visual_localization.config.map_db_path,
    "active_tile_zoom_level": visual_localization.config.tile_zoom_level,
  }


@app.post("/tiles/visual-localization-db")
async def visual_localization_tile_db_prepare(req: VisualLocalizationTileDbRequest):
  try:
    return _export_tile_cache_to_visual_db(req)
  except FileNotFoundError as exc:
    return JSONResponse(status_code=404, content={"status": "error", "reason": str(exc)})


@app.get("/tiles/{map_type}/{z}/{x}/{y}.png")
async def get_tile(map_type: str, z: int, x: int, y: str):
  try:
    y_int = int(y.split(".")[0])
  except ValueError:
    return {"error": "invalid tile"}, 400
  path = TILE_CACHE_DIR / map_type / str(z) / str(x) / f"{y_int}.png"
  if path.exists():
    return FileResponse(path)
  return {"error": "tile not found"}, 404


@app.get("/benchmark/methods")
async def benchmark_methods():
  return benchmark_runner.list_methods()


@app.post("/benchmark/run")
async def benchmark_run(request: BenchmarkRequest):
  return benchmark_runner.run(request)


def _external_tracker_is_up() -> bool:
  """Return True if the external tracker subprocess is believed to be reachable."""
  return bool(_external_tracker_state.get("available", False))


async def _tracker_availability_loop():
  """Background task: periodically probe the external tracker subprocess and
  update `_external_tracker_state` so that API calls can skip the slow proxy
  path when the tracker is down."""
  while True:
    try:
      async with httpx.AsyncClient(timeout=0.8) as client:
        resp = await client.get(f"{ICON_TRACKER_BASE}/api/status")
      up = resp.status_code < 500
    except Exception:
      up = False
    _external_tracker_state["available"] = up
    _external_tracker_state["last_check_ts"] = asyncio.get_running_loop().time()
    # If down, also eagerly start the fallback so frames are ready.
    if not up:
      icon_tracker_fallback.ensure_started()
    interval = 10.0 if up else _external_tracker_state.get("recheck_interval", 15.0)
    await asyncio.sleep(interval)


async def _icon_tracker_proxy(path: str, payload: Optional[Dict[str, Any]] = None, timeout_seconds: float = 1.0):
  # Fast path: if the external tracker is known to be down, return error
  # immediately so the caller can fall back without waiting.
  if not _external_tracker_is_up():
    return JSONResponse(
      status_code=502,
      content={"ok": False, "error": "External tracker is offline (fast-path)"},
    )

  url = f"{ICON_TRACKER_BASE}{path}"
  try:
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
      if payload is None:
        response = await client.get(url)
      else:
        response = await client.post(url, json=payload)
  except Exception as exc:
    _external_tracker_state["available"] = False
    return JSONResponse(
      status_code=502,
      content={
        "ok": False,
        "error": f"Icon tracker unreachable at {ICON_TRACKER_BASE}",
        "details": str(exc),
      },
    )

  try:
    data = response.json()
  except Exception:
    data = {"raw": response.text}

  if response.status_code >= 400:
    return JSONResponse(
      status_code=response.status_code,
      content={"ok": False, "error": "Icon tracker request failed", "upstream": data},
    )
  return data


def _is_tracker_error_response(result: Any) -> bool:
  return isinstance(result, JSONResponse)


def _invalidate_icon_tracker_status_cache() -> None:
  icon_tracker_status_cache["ts"] = 0.0
  icon_tracker_status_cache["payload"] = None


async def _fallback_mjpeg_generator():
  """Yield MJPEG frames from the fallback RTSP capture service."""
  icon_tracker_fallback.ensure_started()
  boundary = b"--frame"
  while True:
    jpeg = icon_tracker_fallback.latest_jpeg()
    if jpeg is None:
      await asyncio.sleep(0.02)
      continue
    yield boundary + b"\r\n"
    yield b"Content-Type: image/jpeg\r\n"
    yield f"Content-Length: {len(jpeg)}\r\n\r\n".encode("ascii")
    yield jpeg
    yield b"\r\n"
    await asyncio.sleep(0.033)


async def _external_stream_generator(stream_url: str):
  try:
    stream_timeout = httpx.Timeout(connect=4.0, read=None, write=4.0, pool=4.0)
    async with httpx.AsyncClient(timeout=stream_timeout) as client:
      async with client.stream("GET", stream_url) as response:
        if response.status_code >= 400:
          message = f"icon-tracker stream upstream error: {response.status_code}"
          yield f"--frame\r\nContent-Type: text/plain\r\n\r\n{message}\r\n".encode("utf-8")
          return
        async for chunk in response.aiter_bytes():
          if chunk:
            yield chunk
  except Exception as exc:
    message = f"icon-tracker stream unavailable: {exc}"
    yield f"--frame\r\nContent-Type: text/plain\r\n\r\n{message}\r\n".encode("utf-8")


@app.get("/integrations/icon-tracker/status")
async def icon_tracker_status():
  now = asyncio.get_running_loop().time()
  cached_payload = icon_tracker_status_cache.get("payload")
  cached_ts = float(icon_tracker_status_cache.get("ts", 0.0) or 0.0)
  if cached_payload is not None and (now - cached_ts) < ICON_TRACKER_STATUS_CACHE_TTL_SECONDS:
    return cached_payload

  async with icon_tracker_status_lock:
    now = asyncio.get_running_loop().time()
    cached_payload = icon_tracker_status_cache.get("payload")
    cached_ts = float(icon_tracker_status_cache.get("ts", 0.0) or 0.0)
    if cached_payload is not None and (now - cached_ts) < ICON_TRACKER_STATUS_CACHE_TTL_SECONDS:
      return cached_payload

    result = await _icon_tracker_proxy("/api/status", None, timeout_seconds=2.0)
    if _is_tracker_error_response(result):
      # Fallback: serve status from the in-process fallback service
      result = icon_tracker_fallback.status_payload()
    icon_tracker_status_cache["payload"] = result
    icon_tracker_status_cache["ts"] = asyncio.get_running_loop().time()
    return result


@app.post("/integrations/icon-tracker/select-target")
async def icon_tracker_select_target(req: IconTrackerTargetRequest):
  result = await _icon_tracker_proxy("/api/select-target", {"track_id": req.track_id}, timeout_seconds=2.0)
  if _is_tracker_error_response(result):
    result = icon_tracker_fallback.select_target(req.track_id)
  _invalidate_icon_tracker_status_cache()
  return result


@app.post("/integrations/icon-tracker/select-model")
async def icon_tracker_select_model(req: IconTrackerModelRequest):
  result = await _icon_tracker_proxy("/api/select-model", {"model_path": req.model_path}, timeout_seconds=2.0)
  if _is_tracker_error_response(result):
    result = icon_tracker_fallback.select_model(req.model_path)
  _invalidate_icon_tracker_status_cache()
  return result


@app.post("/integrations/icon-tracker/toggle-class")
async def icon_tracker_toggle_class(req: IconTrackerClassRequest):
  result = await _icon_tracker_proxy("/api/toggle-class", {"class_name": req.class_name}, timeout_seconds=2.0)
  if _is_tracker_error_response(result):
    result = icon_tracker_fallback.toggle_class(req.class_name)
  _invalidate_icon_tracker_status_cache()
  return result


@app.post("/integrations/icon-tracker/toggle-tracking")
async def icon_tracker_toggle_tracking():
  result = await _icon_tracker_proxy("/api/toggle-tracking", {}, timeout_seconds=2.0)
  if _is_tracker_error_response(result):
    result = icon_tracker_fallback.toggle_tracking()
  _invalidate_icon_tracker_status_cache()
  return result


@app.post("/integrations/icon-tracker/stop-tracking")
async def icon_tracker_stop_tracking():
  result = await _icon_tracker_proxy("/api/stop-tracking", {}, timeout_seconds=2.0)
  if _is_tracker_error_response(result):
    result = icon_tracker_fallback.stop_tracking()
  _invalidate_icon_tracker_status_cache()
  return result


@app.post("/integrations/icon-tracker/center")
async def icon_tracker_center():
  result = await _icon_tracker_proxy("/api/center", {}, timeout_seconds=2.0)
  if _is_tracker_error_response(result):
    result = icon_tracker_fallback.center()
  _invalidate_icon_tracker_status_cache()
  return result


@app.post("/integrations/icon-tracker/move")
async def icon_tracker_move(req: IconTrackerMoveRequest):
  result = await _icon_tracker_proxy("/api/move", {"yaw": req.yaw, "pitch": req.pitch}, timeout_seconds=2.0)
  if _is_tracker_error_response(result):
    result = icon_tracker_fallback.move(req.yaw, req.pitch)
  _invalidate_icon_tracker_status_cache()
  return result


@app.post("/integrations/icon-tracker/stop-motion")
async def icon_tracker_stop_motion():
  result = await _icon_tracker_proxy("/api/stop-motion", {}, timeout_seconds=2.0)
  if _is_tracker_error_response(result):
    result = icon_tracker_fallback.stop_motion()
  _invalidate_icon_tracker_status_cache()
  return result


@app.post("/integrations/icon-tracker/zoom")
async def icon_tracker_zoom(req: IconTrackerZoomRequest):
  result = await _icon_tracker_proxy("/api/zoom", {"direction": req.direction}, timeout_seconds=2.0)
  if _is_tracker_error_response(result):
    result = icon_tracker_fallback.zoom(req.direction)
  _invalidate_icon_tracker_status_cache()
  return result


@app.post("/integrations/icon-tracker/set-camera-speed")
async def icon_tracker_set_camera_speed(req: IconTrackerSpeedRequest):
  result = await _icon_tracker_proxy("/api/set-camera-speed", {"speed_scale": req.speed_scale}, timeout_seconds=2.0)
  if _is_tracker_error_response(result):
    result = icon_tracker_fallback.set_camera_speed(req.speed_scale)
  _invalidate_icon_tracker_status_cache()
  return result


@app.get("/integrations/icon-tracker/stream.mjpg")
async def icon_tracker_stream():
  # If the external tracker is known to be up, redirect instantly.
  if _external_tracker_is_up():
    stream_url = f"{ICON_TRACKER_BASE}/stream.mjpg"
    return RedirectResponse(url=stream_url, status_code=307)
  # Serve frames from fallback RTSP capture — no waiting for subprocess.
  icon_tracker_fallback.ensure_started()
  return StreamingResponse(
    _fallback_mjpeg_generator(),
    media_type="multipart/x-mixed-replace; boundary=frame",
  )


@app.get("/integrations/visual-localization")
async def visual_localization_get():
  return visual_localization.get_status()


@app.post("/integrations/visual-localization")
async def visual_localization_set(payload: VisualLocalizationConfig):
  return visual_localization.update(payload)


@app.post("/integrations/visual-localization/probe")
async def visual_localization_probe():
  return visual_localization.probe()


@app.post("/integrations/visual-localization/self-test")
async def visual_localization_self_test():
  return visual_localization.self_test()


if __name__ == "__main__":
  uvicorn.run("api:app", host="0.0.0.0", port=9000, reload=False)
