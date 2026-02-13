from pydantic import BaseModel
from typing import List, Optional


class VehicleState(BaseModel):
    vehicle_id: str
    type: Optional[str] = None
    domain: Optional[str] = None
    lat: float
    lon: float
    alt: float
    roll: Optional[float] = None
    pitch: Optional[float] = None
    yaw: Optional[float] = None
    groundspeed: Optional[float] = None
    battery: Optional[float] = None
    mode: Optional[str] = None
    link_quality: Optional[float] = None


class MissionItem(BaseModel):
    seq: int
    lat: float
    lon: float
    alt: float
    command: int = 16
    params: Optional[List[float]] = None


class MissionPlan(BaseModel):
    mission_id: str
    name: str
    items: List[MissionItem]
