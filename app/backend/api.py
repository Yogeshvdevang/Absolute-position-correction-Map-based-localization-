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
from fastapi.responses import FileResponse
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

# Configuration
BRIDGE_BASE = os.getenv("BRIDGE_BASE", "http://localhost:8000")
BRIDGE_WS = os.getenv("BRIDGE_WS", "ws://localhost:8000/ws")
VEHICLE_ID = os.getenv("VEHICLE_ID", "vehicle-1")


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

  img = _decode_frame(frame.image_b64) or frame_buffer.get()
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


if __name__ == "__main__":
  uvicorn.run("api:app", host="0.0.0.0", port=9000, reload=False)
