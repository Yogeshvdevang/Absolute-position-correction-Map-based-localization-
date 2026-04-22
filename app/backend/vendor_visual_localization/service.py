from __future__ import annotations

import base64
import importlib.util
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np
from pydantic import BaseModel, Field


def _to_builtin_number(value: Any) -> Any:
  if isinstance(value, np.generic):
    return value.item()
  return value


def _encode_jpeg_base64(image: Any, max_side: int = 640) -> Optional[str]:
  if image is None:
    return None
  frame = np.asarray(image)
  if frame.size == 0:
    return None

  if frame.ndim == 2:
    frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
  elif frame.ndim == 3 and frame.shape[2] == 4:
    frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)

  height, width = frame.shape[:2]
  longest = max(height, width)
  if longest > max_side:
    scale = max_side / float(longest)
    frame = cv2.resize(frame, (max(1, int(width * scale)), max(1, int(height * scale))), interpolation=cv2.INTER_AREA)

  success, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
  if not success:
    return None
  return base64.b64encode(encoded.tobytes()).decode("ascii")


class VisualLocalizationConfig(BaseModel):
  map_db_path: Optional[str] = Field(None, description="Path to the satellite map database")
  device: str = Field("cpu", description="cpu or cuda")
  resize_size: int = Field(800, description="Resize size passed into the internal pipeline")
  matcher_backend: str = Field("superpoint_superglue", description="Internal matcher backend name")
  enabled: bool = Field(False, description="Whether the provider is selected for APC")
  tile_zoom_level: Optional[int] = Field(None, description="Optional zoom level for tile-based map DBs")
  camera_focal_length_mm: float = Field(4.5, description="Camera focal length in mm")
  camera_hfov_deg: float = Field(82.9, description="Camera horizontal FOV in degrees")


class VisualLocalizationService:
  def __init__(self, config: Optional[VisualLocalizationConfig] = None):
    self.config = config or VisualLocalizationConfig()
    self.vendor_root = Path(__file__).resolve().parent
    self.source_root = self.vendor_root / "src"
    self._runtime_cache: Optional[Dict[str, Any]] = None
    self._runtime_key: Optional[Tuple[Any, ...]] = None

  def get_status(self) -> Dict[str, Any]:
    return {
      "config": self.config.model_dump(),
      "probe": self.probe(),
    }

  def update(self, config: VisualLocalizationConfig) -> Dict[str, Any]:
    self.config = config
    self._runtime_cache = None
    self._runtime_key = None
    return self.get_status()

  def self_test(self) -> Dict[str, Any]:
    probe = self.probe()
    if not probe.get("valid"):
      return {
        "ok": False,
        "stage": "probe",
        "probe": probe,
        "reason": probe.get("reason"),
      }
    if not self.config.map_db_path:
      return {
        "ok": False,
        "stage": "config",
        "probe": probe,
        "reason": "Map DB path is not configured",
      }

    try:
      runtime = self._get_runtime()
      map_reader = runtime["map_reader"]
      return {
        "ok": True,
        "stage": "runtime",
        "probe": probe,
        "map_mode": runtime["map_mode"],
        "map_db_path": self.config.map_db_path,
        "num_map_images": len(map_reader),
        "device": self.config.device,
        "resize_size": self.config.resize_size,
      }
    except Exception as exc:
      return {
        "ok": False,
        "stage": "runtime",
        "probe": probe,
        "reason": str(exc),
      }

  def _ensure_vendor_path(self) -> None:
    for path in (self.source_root, self.vendor_root):
      path_str = str(path)
      if path_str not in sys.path:
        sys.path.insert(0, path_str)

  def _missing_dependencies(self) -> list[str]:
    required = ["torch", "pandas", "scipy", "tqdm", "matplotlib", "yaml"]
    return [name for name in required if importlib.util.find_spec(name) is None]

  def _infer_map_mode(self, map_db_path: Path) -> str:
    if any(map_db_path.glob("*.csv")):
      return "geo"
    return "tile"

  def _infer_tile_zoom(self, map_db_path: Path) -> int:
    for suffix in ("*.png", "*.jpg"):
      for image_path in map_db_path.glob(suffix):
        parts = image_path.stem.split("_")
        if len(parts) == 3 and all(part.lstrip("-").isdigit() for part in parts):
          return int(parts[2])
    raise ValueError("Could not infer tile zoom level from tile file names")

  def _runtime_cache_key(self) -> Tuple[Any, ...]:
    return (
      self.config.map_db_path,
      self.config.device,
      self.config.resize_size,
      self.config.tile_zoom_level,
      self.config.matcher_backend,
    )

  def _build_runtime(self) -> Dict[str, Any]:
    self._ensure_vendor_path()

    import logging

    from svl.keypoint_pipeline.detection_and_description import SuperPointAlgorithm
    from svl.keypoint_pipeline.matcher import SuperGlueMatcher
    from svl.keypoint_pipeline.typing import SuperGlueConfig, SuperPointConfig
    from svl.localization.base import PipelineConfig
    from svl.localization.map_reader import SatelliteMapReader, TileSatelliteMapReader
    from svl.localization.pipeline import Pipeline
    from svl.localization.preprocessing import QueryProcessor
    from svl.localization.tile_pipeline import TilePipeline

    map_db_path = Path(self.config.map_db_path or "")
    if not map_db_path.exists():
      raise FileNotFoundError(f"Map DB path not found: {map_db_path}")

    logger = logging.getLogger("apc.visual_localization")
    logger.setLevel(logging.INFO)

    detector = SuperPointAlgorithm(SuperPointConfig(
      device=self.config.device,
      nms_radius=4,
      keypoint_threshold=0.01,
      max_keypoints=-1,
    ))
    matcher = SuperGlueMatcher(SuperGlueConfig(
      device=self.config.device,
      weights="outdoor",
      sinkhorn_iterations=20,
      match_threshold=0.5,
    ))
    query_processor = QueryProcessor(
      processings=["resize"],
      camera_model=None,
      satellite_resolution=None,
      size=(self.config.resize_size,),
    )

    map_mode = self._infer_map_mode(map_db_path)
    if map_mode == "geo":
      map_reader = SatelliteMapReader(
        db_path=map_db_path,
        resize_size=(self.config.resize_size,),
        logger=logging.getLogger("apc.visual_localization.map_reader"),
      )
      map_reader.initialize_db()
      map_reader.setup_db()
      map_reader.resize_db_images()
      map_reader.describe_db_images(detector)
      pipeline = Pipeline(
        map_reader=map_reader,
        drone_streamer=None,
        detector=detector,
        matcher=matcher,
        query_processor=query_processor,
        config=PipelineConfig(),
        logger=logging.getLogger("apc.visual_localization.pipeline"),
      )
    else:
      zoom_level = self.config.tile_zoom_level or self._infer_tile_zoom(map_db_path)
      map_reader = TileSatelliteMapReader(
        db_path=map_db_path,
        zoom_level=int(zoom_level),
        logger=logging.getLogger("apc.visual_localization.map_reader"),
      )
      map_reader.initialize_db()
      map_reader.setup_db()
      map_reader.describe_db_images(detector)
      pipeline = TilePipeline(
        map_reader=map_reader,
        drone_streamer=None,
        detector=detector,
        matcher=matcher,
        query_processor=query_processor,
        config=PipelineConfig(),
        logger=logging.getLogger("apc.visual_localization.pipeline"),
      )

    return {
      "map_mode": map_mode,
      "map_reader": map_reader,
      "detector": detector,
      "matcher": matcher,
      "query_processor": query_processor,
      "pipeline": pipeline,
    }

  def _get_runtime(self) -> Dict[str, Any]:
    key = self._runtime_cache_key()
    if self._runtime_cache is not None and self._runtime_key == key:
      return self._runtime_cache
    self._runtime_cache = self._build_runtime()
    self._runtime_key = key
    return self._runtime_cache

  def run_frame(
    self,
    image: np.ndarray,
    frame_id: Optional[str],
    lat: Optional[float],
    lon: Optional[float],
    alt: Optional[float],
    yaw: Optional[float],
    pitch: Optional[float],
    roll: Optional[float],
  ) -> Dict[str, Any]:
    probe = self.probe()
    if not probe.get("valid"):
      raise RuntimeError(probe.get("reason") or "visual_localization internal module is not ready")
    if not self.config.enabled:
      raise RuntimeError("visual_localization provider is not enabled")
    if image is None:
      raise RuntimeError("No frame image available for visual_localization provider")
    if lat is None or lon is None:
      raise RuntimeError("visual_localization provider requires approximate lat/lon")
    if not self.config.map_db_path:
      raise RuntimeError("visual_localization provider requires a map DB path")

    self._ensure_vendor_path()
    from svl.tms.data_structures import CameraModel, DroneImage
    from svl.tms.schemas import GeoPoint, Orientation

    runtime = self._get_runtime()
    pipeline = runtime["pipeline"]
    query_processor = runtime["query_processor"]

    gray = image
    if image.ndim == 3:
      gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = np.squeeze(gray)

    height, width = gray.shape[:2]
    query_processor.camera_model = CameraModel(
      focal_length=self.config.camera_focal_length_mm / 1000.0,
      resolution_width=width,
      resolution_height=height,
      hfov_deg=self.config.camera_hfov_deg,
    )

    drone_image = DroneImage(
      image_path=Path(f"{frame_id or 'frame'}.png"),
      geo_point=GeoPoint(
        latitude=lat,
        longitude=lon,
        altitude=alt or 0.0,
      ),
      camera_orientation=Orientation(
        pitch=pitch or 0.0,
        roll=roll or 0.0,
        yaw=yaw or 0.0,
      ),
      drone_orientation=Orientation(
        pitch=pitch or 0.0,
        roll=roll or 0.0,
        yaw=yaw or 0.0,
      ),
      camera_model=query_processor.camera_model,
      image=gray,
    )

    processed_query = query_processor(drone_image)
    result = pipeline.run_on_image(processed_query, output_path=None)
    predicted = result.get("predicted_coordinate")
    matched_image = result.get("matched_image")
    query_preview = result.get("query_preview") or getattr(processed_query, "image", None)
    reference_preview = result.get("reference_preview") or getattr(matched_image, "image", None)
    match_visualization = result.get("match_visualization")

    return {
      "success": bool(result.get("is_match")),
      "predicted_lat": getattr(predicted, "lat", None) if predicted else None,
      "predicted_lon": getattr(predicted, "long", None) if predicted else None,
      "distance_m": _to_builtin_number(result.get("distance")),
      "matched_image": getattr(matched_image, "name", None) if matched_image else None,
      "num_inliers": _to_builtin_number(result.get("num_inliers")),
      "source": "visual_localization_internal",
      "map_mode": runtime["map_mode"],
      "query_image_b64": _encode_jpeg_base64(query_preview),
      "reference_image_b64": _encode_jpeg_base64(reference_preview),
      "match_image_b64": _encode_jpeg_base64(match_visualization),
    }

  def probe(self) -> Dict[str, Any]:
    missing = self._missing_dependencies()
    upstream_src = self.source_root / "svl"
    upstream_superglue = self.source_root / "superglue_lib"
    valid = upstream_src.exists() and upstream_superglue.exists() and not missing

    return {
      "valid": valid,
      "reason": None if valid else (
        f"Missing ML/runtime dependencies: {', '.join(missing)}" if missing else "Vendored visual_localization source tree not found"
      ),
      "repo_name": "vendor_visual_localization",
      "package_name": "svl",
      "module_root": str(self.vendor_root),
      "source_root": str(self.source_root),
      "readme_path": str(self.vendor_root / "README.upstream.md"),
      "pyproject_path": str(self.vendor_root / "pyproject.toml"),
      "has_upstream_layout": (self.vendor_root / "pyproject.toml").exists() and upstream_src.exists(),
      "has_superglue_submodule": upstream_superglue.exists(),
      "supports": {
        "tile_matching": True,
        "superpoint_superglue": True,
        "tms_downloader": True,
        "query_preprocessing": True,
        "vendored_internal_module": True,
      },
      "missing_dependencies": missing,
    }
