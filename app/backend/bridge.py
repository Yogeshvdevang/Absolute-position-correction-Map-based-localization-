import asyncio
import json
import os
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from mavsdk import System
from mavsdk.mission_raw import MissionItem
from pydantic import BaseModel
from enum import Enum

# Configure MAVSDK server target: e.g. grpc://127.0.0.1:50051 (from mavsdk_server -p 50051 udp://:14540)
MAVSDK_GRPC_URL = os.getenv("MAVSDK_GRPC_URL", "grpc://127.0.0.1:50051")


class MissionUpload(BaseModel):
    items: List[dict]

class FlightMode(str, Enum):
    HOLD = "hold"
    MISSION = "mission"
    RETURN_TO_LAUNCH = "rtl"
    LAND = "land"
    TAKEOFF = "takeoff"
    LOITER = "loiter"
    FOLLOW_ME = "follow_me"

class CommandRequest(BaseModel):
    action: str
    params: Optional[dict] = None

app = FastAPI(title="MAVSDK Bridge", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

drone: Optional[System] = None
connected = False


async def ensure_connected():
    """Connect to MAVSDK server if not already connected."""
    global drone, connected
    if connected:
        return
    drone = System()
    await drone.connect(system_address=MAVSDK_GRPC_URL)
    # Wait for connection state
    async for state in drone.core.connection_state():
        if state.is_connected:
            connected = True
            break


@app.on_event("startup")
async def on_startup():
    try:
        await ensure_connected()
    except Exception as exc:  # noqa: BLE001
        # We keep the app up so you can start mavsdk_server later
        print(f"[bridge] Unable to connect on startup: {exc}")


@app.get("/health")
async def health():
    return {"status": "ok", "connected": connected, "grpc_url": MAVSDK_GRPC_URL}


@app.get("/mission")
async def get_mission():
    await ensure_connected()
    mission = await drone.mission_raw.download_mission()
    items = []
    for item in mission:
        items.append(
            {
                "seq": item.seq,
                "frame": item.frame,
                "command": item.command,
                "lat": item.x,
                "lon": item.y,
                "alt": item.z,
                "autocontinue": item.autocontinue,
            }
        )
    return {"count": len(items), "items": items}


@app.post("/mission")
async def upload_mission(body: MissionUpload):
    await ensure_connected()
    mission_items = []
    for idx, it in enumerate(body.items):
        mission_items.append(
            MissionItem(
                seq=idx,
                frame=it.get("frame", 3),
                command=it.get("command", 16),  # NAV_WAYPOINT
                current=1 if idx == 0 else 0,
                autocontinue=it.get("autocontinue", 1),
                param1=it.get("param1", 0),
                param2=it.get("param2", 0),
                param3=it.get("param3", 0),
                param4=it.get("param4", 0),
                x=it["lat"],
                y=it["lon"],
                z=it.get("alt", 30),
                mission_type=it.get("mission_type", 0),
            )
        )
    await drone.mission_raw.upload_mission(mission_items)
    return {"status": "uploaded", "count": len(mission_items)}


@app.post("/mission/start")
async def start_mission():
    await ensure_connected()
    await drone.mission_raw.start_mission()
    return {"status": "started"}


@app.post("/mission/pause")
async def pause_mission():
    await ensure_connected()
    await drone.mission_raw.pause_mission()
    return {"status": "paused"}


@app.websocket("/ws")
async def telemetry(ws: WebSocket):
    await ws.accept()
    try:
        await ensure_connected()
        pos_stream = drone.telemetry.position()
        att_stream = drone.telemetry.attitude_euler()
        batt_stream = drone.telemetry.battery()
        async for pos, att, batt in asyncio.zip(pos_stream, att_stream, batt_stream):
            await ws.send_text(
                json.dumps(
                    {
                        "lat": pos.latitude_deg,
                        "lon": pos.longitude_deg,
                        "alt": pos.relative_altitude_m,
                        "roll": att.roll_deg,
                        "pitch": att.pitch_deg,
                        "yaw": att.yaw_deg,
                        "battery": batt.remaining_percent,
                    }
                )
            )
    except WebSocketDisconnect:
        return
    except Exception as exc:  # noqa: BLE001
        await ws.send_text(json.dumps({"error": str(exc)}))
        await ws.close()


@app.post("/command/arm")
async def command_arm():
    await ensure_connected()
    await drone.action.arm()
    return {"status": "armed"}


@app.post("/command/takeoff")
async def command_takeoff(body: CommandRequest = CommandRequest(action="takeoff", params={"alt": 30})):
    await ensure_connected()
    alt = 30
    if body.params and isinstance(body.params.get("alt"), (int, float)):
        alt = float(body.params["alt"])
    await drone.action.set_takeoff_altitude(alt)
    await drone.action.takeoff()
    return {"status": "taking_off", "altitude": alt}


@app.post("/command/land")
async def command_land():
    await ensure_connected()
    await drone.action.land()
    return {"status": "landing"}


@app.post("/command/rtl")
async def command_rtl():
    await ensure_connected()
    await drone.action.return_to_launch()
    return {"status": "rtl"}


@app.post("/command/mode")
async def command_mode(body: CommandRequest):
    await ensure_connected()
    mode = (body.params or {}).get("mode")
    if not mode:
        return {"error": "mode required"}, 400
    # map simple aliases
    m = str(mode).lower()
    if m in ("mission", "auto"):
        await drone.action.set_flight_mode(drone.action.FlightMode.MISSION)
    elif m in ("hold", "loiter"):
        await drone.action.set_flight_mode(drone.action.FlightMode.HOLD)
    elif m in ("rtl", "return"):
        await drone.action.set_flight_mode(drone.action.FlightMode.RTL)
    elif m in ("land",):
        await drone.action.set_flight_mode(drone.action.FlightMode.LAND)
    else:
        return {"error": f"unsupported mode {mode}"}, 400
    return {"status": "mode_set", "mode": m}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("bridge:app", host="0.0.0.0", port=8000, reload=False)
