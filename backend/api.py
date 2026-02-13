import asyncio
import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import httpx
import uvicorn
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .models import VehicleState, MissionPlan, MissionItem
from .system_profile import profile_hardware
from .execution_policy import select_profile
from .compute import init_router

# Configuration
BRIDGE_BASE = os.getenv("BRIDGE_BASE", "http://localhost:8000")
BRIDGE_WS = os.getenv("BRIDGE_WS", "ws://localhost:8000/ws")
VEHICLE_ID = os.getenv("VEHICLE_ID", "vehicle-1")
DB_PATH = os.getenv("CHAOX_DB_PATH", os.path.join(os.path.dirname(__file__), "chaox.db"))
DB_LOCK = threading.Lock()


def _utc_now() -> str:
  return datetime.now(timezone.utc).isoformat()


def _get_db() -> sqlite3.Connection:
  conn = sqlite3.connect(DB_PATH, check_same_thread=False)
  conn.row_factory = sqlite3.Row
  conn.execute("PRAGMA foreign_keys = ON")
  return conn


def _init_db() -> None:
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("""
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TEXT,
        updated_at TEXT
      )
    """)
    cur.execute("""
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        type_id TEXT NOT NULL,
        status TEXT NOT NULL,
        asset TEXT DEFAULT '',
        cruise_speed REAL DEFAULT 15,
        pattern_config TEXT,
        pattern_boundary TEXT,
        assigned_assets TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY(operation_id) REFERENCES operations(id) ON DELETE CASCADE
      )
    """)
    cur.execute("""
      CREATE TABLE IF NOT EXISTS waypoints (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        name TEXT,
        lat REAL,
        lon REAL,
        alt REAL,
        speed REAL,
        hold REAL,
        FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
      )
    """)
    cur.execute("""
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        domain TEXT,
        status TEXT,
        metadata TEXT
      )
    """)
    cur.execute("""
      CREATE TABLE IF NOT EXISTS optimization_results (
        id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT,
        FOREIGN KEY(operation_id) REFERENCES operations(id) ON DELETE CASCADE
      )
    """)
    conn.commit()
    conn.close()


def _seed_data() -> None:
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS count FROM operations")
    if cur.fetchone()["count"] > 0:
      conn.close()
      return
    now = _utc_now()
    ops = [
      ("op-1", "Border ISR Sector 3"),
      ("op-2", "Maritime Surveillance"),
    ]
    for op_id, name in ops:
      cur.execute(
        "INSERT INTO operations (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (op_id, name, "", now, now),
      )
    missions = [
      ("mission-1", "op-1", "Northern Perimeter Scan", "perimeter-patrol", "Ready", "UAV-001", 15, "Patrol northern border segment"),
      ("mission-2", "op-1", "Grid Search Alpha", "area-search", "Draft", "UAV-002", 15, "Systematic area coverage"),
      ("mission-3", "op-2", "Harbor Watch", "loiter-observe", "Ready", "USV-001", 12, "Monitor harbor entrance"),
    ]
    for mid, op_id, name, type_id, status, asset, cruise, desc in missions:
      cur.execute(
        """INSERT INTO missions
           (id, operation_id, name, description, type_id, status, asset, cruise_speed, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (mid, op_id, name, desc, type_id, status, asset, cruise, now, now),
      )
    conn.commit()
    conn.close()


def _row_to_waypoint(row: sqlite3.Row) -> dict:
  return {
    "id": row["id"],
    "seq": row["seq"],
    "name": row["name"],
    "lat": row["lat"],
    "lon": row["lon"],
    "alt": row["alt"],
    "speed": row["speed"],
    "hold": row["hold"],
  }


def _row_to_mission(row: sqlite3.Row, waypoints: List[dict]) -> dict:
  return {
    "id": row["id"],
    "operation_id": row["operation_id"],
    "name": row["name"],
    "description": row["description"],
    "typeId": row["type_id"],
    "status": row["status"],
    "asset": row["asset"],
    "cruiseSpeed": row["cruise_speed"],
    "patternConfig": json.loads(row["pattern_config"]) if row["pattern_config"] else None,
    "patternBoundary": json.loads(row["pattern_boundary"]) if row["pattern_boundary"] else None,
    "assignedAssets": json.loads(row["assigned_assets"]) if row["assigned_assets"] else [],
    "waypoints": waypoints,
    "createdAt": row["created_at"],
    "updatedAt": row["updated_at"],
  }


def _row_to_operation(row: sqlite3.Row, missions: List[dict]) -> dict:
  return {
    "id": row["id"],
    "name": row["name"],
    "description": row["description"],
    "missions": missions,
    "createdAt": row["created_at"],
    "updatedAt": row["updated_at"],
  }


def _fetch_waypoints(conn: sqlite3.Connection, mission_id: str) -> List[dict]:
  cur = conn.cursor()
  cur.execute("SELECT * FROM waypoints WHERE mission_id = ? ORDER BY seq ASC", (mission_id,))
  return [_row_to_waypoint(row) for row in cur.fetchall()]


def _fetch_missions(conn: sqlite3.Connection, operation_id: str) -> List[dict]:
  cur = conn.cursor()
  cur.execute("SELECT * FROM missions WHERE operation_id = ? ORDER BY created_at ASC", (operation_id,))
  missions = []
  for row in cur.fetchall():
    waypoints = _fetch_waypoints(conn, row["id"])
    missions.append(_row_to_mission(row, waypoints))
  return missions


def _fetch_operations(conn: sqlite3.Connection) -> List[dict]:
  cur = conn.cursor()
  cur.execute("SELECT * FROM operations ORDER BY created_at ASC")
  operations = []
  for row in cur.fetchall():
    missions = _fetch_missions(conn, row["id"])
    operations.append(_row_to_operation(row, missions))
  return operations


class Vehicle(BaseModel):
  id: str
  callsign: str
  link: str = Field(..., description="Upstream MAVLink URL or description")
  type: str = Field("UAV", description="Vehicle type (UAV/UGV/USV/UUV/Satellite/Vehicle)")
  domain: Optional[str] = Field(None, description="Vehicle domain (air/land/water/space)")
  created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MissionUpload(BaseModel):
  items: List[dict]


class OperationCreate(BaseModel):
  name: str
  description: Optional[str] = ""


class OperationUpdate(BaseModel):
  name: Optional[str] = None
  description: Optional[str] = None


class MissionCreate(BaseModel):
  name: str
  description: Optional[str] = ""
  type_id: str = Field("area-search", alias="typeId")
  status: str = "Draft"
  asset: str = "Unassigned"
  cruise_speed: float = Field(15, alias="cruiseSpeed")
  pattern_config: Optional[dict] = Field(None, alias="patternConfig")
  pattern_boundary: Optional[list] = Field(None, alias="patternBoundary")
  assigned_assets: Optional[list] = Field(default_factory=list, alias="assignedAssets")


class MissionUpdate(BaseModel):
  name: Optional[str] = None
  description: Optional[str] = None
  type_id: Optional[str] = Field(None, alias="typeId")
  status: Optional[str] = None
  asset: Optional[str] = None
  cruise_speed: Optional[float] = Field(None, alias="cruiseSpeed")
  pattern_config: Optional[dict] = Field(None, alias="patternConfig")
  pattern_boundary: Optional[list] = Field(None, alias="patternBoundary")
  assigned_assets: Optional[list] = Field(None, alias="assignedAssets")


class WaypointInput(BaseModel):
  id: Optional[str] = None
  seq: Optional[int] = None
  name: Optional[str] = None
  lat: float
  lon: float
  alt: float
  speed: Optional[float] = None
  hold: Optional[float] = None


class WaypointList(BaseModel):
  items: List[WaypointInput]


class AssetCreate(BaseModel):
  id: str
  name: Optional[str] = None
  type: Optional[str] = None
  domain: Optional[str] = None
  status: Optional[str] = None
  metadata: Optional[dict] = None


class TelemetryBatch(BaseModel):
  items: List[VehicleState]


class CommandRequest(BaseModel):
  vehicle_id: str
  command: str
  payload: Optional[dict] = None
  params: Optional[dict] = None


app = FastAPI(title="C2 API", version="0.1.0")
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

# Resolve frontend build path for local container or packaged runtime.
FRONTEND_DIR = os.getenv("FRONTEND_DIR")
if FRONTEND_DIR:
  app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")

  @app.get("/")
  async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

  @app.get("/{path:path}")
  async def serve_spa(path: str):
    requested = os.path.join(FRONTEND_DIR, path)
    if path and os.path.isfile(requested):
      return FileResponse(requested)
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

# In-memory stores
vehicles: Dict[str, Vehicle] = {}
telemetry_store: Dict[str, VehicleState] = {}
mission_plan: List[MissionItem] = []
bridge_connected = False


@app.on_event("startup")
async def startup_event():
  # seed default vehicle
  vehicles[VEHICLE_ID] = Vehicle(id=VEHICLE_ID, callsign="DRONE-1", link=BRIDGE_WS)
  _init_db()
  _seed_data()
  hw_profile = profile_hardware()
  policy = select_profile(hw_profile)
  app.state.compute_router = init_router(policy)
  app.state.hardware_profile = hw_profile
  app.state.execution_profile = policy
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


@app.get("/health")
async def health():
  return {
    "status": "ok",
    "bridge": bridge_connected,
    "bridge_base": BRIDGE_BASE,
    "bridge_ws": BRIDGE_WS,
    "vehicles": len(vehicles),
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


@app.get("/planner/state")
async def get_planner_state():
  with DB_LOCK:
    conn = _get_db()
    operations = _fetch_operations(conn)
    conn.close()
  return {"operations": operations}


@app.get("/operations")
async def list_operations():
  with DB_LOCK:
    conn = _get_db()
    operations = _fetch_operations(conn)
    conn.close()
  return operations


@app.post("/operations")
async def create_operation(body: OperationCreate):
  now = _utc_now()
  op_id = str(uuid.uuid4())
  with DB_LOCK:
    conn = _get_db()
    conn.execute(
      "INSERT INTO operations (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      (op_id, body.name, body.description or "", now, now),
    )
    conn.commit()
    conn.close()
  return {"id": op_id, "name": body.name, "description": body.description or "", "missions": []}


@app.put("/operations/{operation_id}")
async def update_operation(operation_id: str, body: OperationUpdate):
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM operations WHERE id = ?", (operation_id,))
    row = cur.fetchone()
    if not row:
      conn.close()
      raise HTTPException(status_code=404, detail="Operation not found")
    name = body.name if body.name is not None else row["name"]
    description = body.description if body.description is not None else row["description"]
    now = _utc_now()
    cur.execute(
      "UPDATE operations SET name = ?, description = ?, updated_at = ? WHERE id = ?",
      (name, description, now, operation_id),
    )
    conn.commit()
    missions = _fetch_missions(conn, operation_id)
    op_row = {
      "id": row["id"],
      "name": name,
      "description": description,
      "created_at": row["created_at"],
      "updated_at": now,
    }
    conn.close()
  return _row_to_operation(op_row, missions)


@app.delete("/operations/{operation_id}")
async def delete_operation(operation_id: str):
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM operations WHERE id = ?", (operation_id,))
    conn.commit()
    conn.close()
  return {"status": "deleted", "id": operation_id}


@app.post("/operations/{operation_id}/missions")
async def create_mission(operation_id: str, body: MissionCreate):
  mission_id = str(uuid.uuid4())
  now = _utc_now()
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM operations WHERE id = ?", (operation_id,))
    if not cur.fetchone():
      conn.close()
      raise HTTPException(status_code=404, detail="Operation not found")
    cur.execute(
      """INSERT INTO missions
         (id, operation_id, name, description, type_id, status, asset, cruise_speed, pattern_config, pattern_boundary, assigned_assets, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
      (
        mission_id,
        operation_id,
        body.name,
        body.description or "",
        body.type_id,
        body.status,
        body.asset,
        body.cruise_speed,
        json.dumps(body.pattern_config) if body.pattern_config else None,
        json.dumps(body.pattern_boundary) if body.pattern_boundary else None,
        json.dumps(body.assigned_assets) if body.assigned_assets is not None else json.dumps([]),
        now,
        now,
      ),
    )
    conn.commit()
    waypoints: List[dict] = []
    mission_row = {
      "id": mission_id,
      "operation_id": operation_id,
      "name": body.name,
      "description": body.description or "",
      "type_id": body.type_id,
      "status": body.status,
      "asset": body.asset,
      "cruise_speed": body.cruise_speed,
      "pattern_config": json.dumps(body.pattern_config) if body.pattern_config else None,
      "pattern_boundary": json.dumps(body.pattern_boundary) if body.pattern_boundary else None,
      "assigned_assets": json.dumps(body.assigned_assets) if body.assigned_assets is not None else json.dumps([]),
      "created_at": now,
      "updated_at": now,
    }
    conn.close()
  return _row_to_mission(mission_row, waypoints)


@app.put("/missions/{mission_id}")
async def update_mission(mission_id: str, body: MissionUpdate):
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM missions WHERE id = ?", (mission_id,))
    row = cur.fetchone()
    if not row:
      conn.close()
      raise HTTPException(status_code=404, detail="Mission not found")
    now = _utc_now()
    updates = {
      "name": body.name if body.name is not None else row["name"],
      "description": body.description if body.description is not None else row["description"],
      "type_id": body.type_id if body.type_id is not None else row["type_id"],
      "status": body.status if body.status is not None else row["status"],
      "asset": body.asset if body.asset is not None else row["asset"],
      "cruise_speed": body.cruise_speed if body.cruise_speed is not None else row["cruise_speed"],
      "pattern_config": json.dumps(body.pattern_config) if body.pattern_config is not None else row["pattern_config"],
      "pattern_boundary": json.dumps(body.pattern_boundary) if body.pattern_boundary is not None else row["pattern_boundary"],
      "assigned_assets": json.dumps(body.assigned_assets) if body.assigned_assets is not None else row["assigned_assets"],
    }
    cur.execute(
      """UPDATE missions
         SET name = ?, description = ?, type_id = ?, status = ?, asset = ?, cruise_speed = ?, pattern_config = ?, pattern_boundary = ?, assigned_assets = ?, updated_at = ?
         WHERE id = ?""",
      (
        updates["name"],
        updates["description"],
        updates["type_id"],
        updates["status"],
        updates["asset"],
        updates["cruise_speed"],
        updates["pattern_config"],
        updates["pattern_boundary"],
        updates["assigned_assets"],
        now,
        mission_id,
      ),
    )
    conn.commit()
    waypoints = _fetch_waypoints(conn, mission_id)
    mission_row = dict(row)
    mission_row.update(updates)
    mission_row["updated_at"] = now
    conn.close()
  return _row_to_mission(mission_row, waypoints)


@app.delete("/missions/{mission_id}")
async def delete_mission(mission_id: str):
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM missions WHERE id = ?", (mission_id,))
    conn.commit()
    conn.close()
  return {"status": "deleted", "id": mission_id}


@app.get("/missions/{mission_id}/waypoints")
async def get_waypoints(mission_id: str):
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM missions WHERE id = ?", (mission_id,))
    if not cur.fetchone():
      conn.close()
      raise HTTPException(status_code=404, detail="Mission not found")
    waypoints = _fetch_waypoints(conn, mission_id)
    conn.close()
  return {"items": waypoints}


@app.put("/missions/{mission_id}/waypoints")
async def replace_waypoints(mission_id: str, body: WaypointList):
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM missions WHERE id = ?", (mission_id,))
    if not cur.fetchone():
      conn.close()
      raise HTTPException(status_code=404, detail="Mission not found")
    cur.execute("DELETE FROM waypoints WHERE mission_id = ?", (mission_id,))
    for idx, wp in enumerate(body.items):
      wp_id = wp.id or str(uuid.uuid4())
      seq = wp.seq if wp.seq is not None else idx
      cur.execute(
        """INSERT INTO waypoints (id, mission_id, seq, name, lat, lon, alt, speed, hold)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
          wp_id,
          mission_id,
          seq,
          wp.name,
          wp.lat,
          wp.lon,
          wp.alt,
          wp.speed,
          wp.hold,
        ),
      )
    conn.commit()
    waypoints = _fetch_waypoints(conn, mission_id)
    conn.close()
  return {"items": waypoints}


@app.get("/assets")
async def list_assets():
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM assets")
    assets = [dict(row) for row in cur.fetchall()]
    conn.close()
  for asset in assets:
    asset["metadata"] = json.loads(asset["metadata"]) if asset.get("metadata") else None
  return assets


@app.post("/assets")
async def create_asset(body: AssetCreate):
  with DB_LOCK:
    conn = _get_db()
    conn.execute(
      "INSERT INTO assets (id, name, type, domain, status, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      (
        body.id,
        body.name,
        body.type,
        body.domain,
        body.status,
        json.dumps(body.metadata) if body.metadata else None,
      ),
    )
    conn.commit()
    conn.close()
  return body


@app.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str):
  with DB_LOCK:
    conn = _get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
    conn.commit()
    conn.close()
  return {"status": "deleted", "id": asset_id}


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


if __name__ == "__main__":
  uvicorn.run("api:app", host="0.0.0.0", port=9000, reload=False)
