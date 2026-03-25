from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


TrackType = Literal["local", "retrieval", "hybrid"]


class TileCandidateModel(BaseModel):
  tile_id: str
  image_path: str
  center_lat: float
  center_lon: float


class BenchmarkSampleModel(BaseModel):
  sample_id: str
  frame_path: str
  ground_truth_lat: float
  ground_truth_lon: float
  yaw_deg: Optional[float] = None
  altitude_m: Optional[float] = None
  candidate_tiles: List[TileCandidateModel] = Field(default_factory=list)
  metadata: Dict[str, Any] = Field(default_factory=dict)


class BenchmarkManifest(BaseModel):
  name: str = "apc-benchmark"
  description: Optional[str] = None
  reference_height_m: float = 100.0
  tile_overlap: float = 0.25
  top_k: int = 5
  samples: List[BenchmarkSampleModel] = Field(default_factory=list)


class BenchmarkRequest(BaseModel):
  manifest_path: str
  methods: List[str] = Field(default_factory=lambda: [
    "template",
    "orb",
    "superpoint_lightglue",
    "loftr",
    "transgeo",
    "transgeo_loftr",
  ])
  output_path: Optional[str] = None
  fail_on_unavailable: bool = False


@dataclass
class TileCandidate:
  tile_id: str
  image_path: Path
  center_lat: float
  center_lon: float


@dataclass
class BenchmarkSample:
  sample_id: str
  frame_path: Path
  ground_truth_lat: float
  ground_truth_lon: float
  yaw_deg: Optional[float] = None
  altitude_m: Optional[float] = None
  candidate_tiles: List[TileCandidate] = field(default_factory=list)
  metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CandidateScore:
  tile_id: str
  score: float
  runtime_ms: float
  center_lat: float
  center_lon: float
  metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MethodResult:
  method: str
  track: TrackType
  sample_id: str
  success: bool
  predicted_lat: Optional[float] = None
  predicted_lon: Optional[float] = None
  confidence: float = 0.0
  runtime_ms: float = 0.0
  error_m: Optional[float] = None
  selected_tile_id: Optional[str] = None
  top_k_tile_ids: List[str] = field(default_factory=list)
  scores: List[CandidateScore] = field(default_factory=list)
  metadata: Dict[str, Any] = field(default_factory=dict)
  error: Optional[str] = None


class MethodSummary(BaseModel):
  name: str
  track: TrackType
  available: bool
  reason: Optional[str] = None
