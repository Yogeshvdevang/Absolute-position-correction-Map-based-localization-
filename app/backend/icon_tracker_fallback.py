import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, urlunparse

import cv2

SUPPORTED_MODEL_EXTENSIONS = {".pt", ".onnx", ".engine", ".torchscript"}
DISPLAY_INTERVAL_SECONDS = 0.04
ATTITUDE_INTERVAL_SECONDS = 0.30
ZOOM_STEP_SECONDS = 0.25
CAMERA_SPEED_MIN = 0.2
CAMERA_SPEED_MAX = 3.0


def _icon_from_model_name(name: str) -> str:
  lowered = name.lower()
  if any(token in lowered for token in ("aircraft", "plane", "jet", "fighter", "helicopter")):
    return "aircraft"
  if "drone" in lowered or "uav" in lowered:
    return "drone"
  if "person" in lowered or "human" in lowered:
    return "person"
  if any(token in lowered for token in ("car", "vehicle", "tank", "apc", "ifv", "truck")):
    return "vehicle"
  if any(token in lowered for token in ("ship", "boat", "vessel", "submarine")):
    return "vessel"
  return "model"


class IconTrackerFallbackService:
  def __init__(
    self,
    tracker_root: Path,
    camera_ip: str,
    camera_port: int,
    rtsp_url: str,
  ) -> None:
    self.tracker_root = tracker_root
    self.camera_ip = camera_ip
    self.camera_port = camera_port
    self.rtsp_url = rtsp_url

    self.status_text = "Initializing fallback tracker service..."
    self.result_text = "Fallback mode active."
    self.tracking_enabled = False
    self.selected_track_id: Optional[int] = None
    self.selected_model: Optional[str] = None
    self.selected_model_path: Optional[str] = None
    self.selected_model_classes: List[str] = []
    self.enabled_classes: set[str] = set()
    self.camera_speed_scale = 1.0
    self.current_yaw = 0.0
    self.current_pitch = 0.0
    self.detections: List[Dict[str, Any]] = []
    self.models: List[Dict[str, Any]] = []

    self._cam = None
    self._capture = None
    self._frame_lock = threading.Lock()
    self._latest_jpeg: Optional[bytes] = None
    self._latest_jpeg_ts = 0.0
    self._stop_event = threading.Event()
    self._started = False

    self._load_models()

  def _load_models(self) -> None:
    models_dir = self.tracker_root / "models"
    index_path = models_dir / "model_index.json"
    models: List[Dict[str, Any]] = []

    if index_path.exists():
      try:
        payload = json.loads(index_path.read_text(encoding="utf-8"))
        for entry in payload.get("models", []):
          name = str(entry.get("name", "model"))
          path = str(entry.get("path", ""))
          resolved_path = self._resolve_model_path(models_dir, name, path)
          if resolved_path is None:
            continue
          classes = [str(item) for item in entry.get("classes", [])]
          models.append(
            {
              "name": name,
              "path": str(resolved_path),
              "icon": _icon_from_model_name(name),
              "classes": classes,
            }
          )
      except Exception as exc:
        self.status_text = f"Failed reading model_index.json: {exc}"

    if not models and models_dir.exists():
      for item in sorted(models_dir.iterdir()):
        if item.is_file() and item.suffix.lower() in SUPPORTED_MODEL_EXTENSIONS:
          models.append(
            {
              "name": item.name,
              "path": str(item),
              "icon": _icon_from_model_name(item.name),
              "classes": [],
            }
          )

    self.models = models
    if models:
      self.result_text = f"Loaded {len(models)} model(s) from tracker folder."
    else:
      self.result_text = "No local models found in tracker folder."

  def _resolve_model_path(self, models_dir: Path, name: str, raw_path: str) -> Optional[Path]:
    candidates: List[Path] = []
    if raw_path:
      candidates.append(Path(raw_path))
      candidates.append(models_dir / Path(raw_path).name)
    if name:
      candidates.append(models_dir / name)
      stem = Path(name).stem
      base = stem.split("_")[0]
      for ext in SUPPORTED_MODEL_EXTENSIONS:
        candidates.append(models_dir / f"{base}{ext}")

    for candidate in candidates:
      if candidate.exists() and candidate.is_file():
        return candidate
    return None

  def _connect_siyi(self) -> None:
    try:
      if str(self.tracker_root) not in sys.path:
        sys.path.append(str(self.tracker_root))
      from siyi_sdk.siyi_sdk import SIYISDK  # type: ignore

      cam = SIYISDK(server_ip=self.camera_ip, port=self.camera_port)
      if cam.connect():
        self._cam = cam
        try:
          self._cam.requestFollowMode()
          self._cam.requestHardwareID()
          self._cam.requestGimbalAttitude()
        except Exception:
          pass
      else:
        self.status_text = f"Fallback: unable to connect SIYI control at {self.camera_ip}:{self.camera_port}."
    except Exception as exc:
      self.status_text = f"Fallback: SIYI SDK unavailable ({exc})."

  def _frame_loop(self) -> None:
    failures = 0
    active_url: Optional[str] = None
    while not self._stop_event.is_set():
      if self._capture is None or not self._capture.isOpened():
        self._capture, active_url = self._open_capture()
        if self._capture is None:
          self.status_text = f"Fallback: waiting for RTSP feed {self.rtsp_url}"
          time.sleep(1.0)
          continue
        failures = 0
      ok, frame = self._capture.read()
      if not ok or frame is None:
        failures += 1
        # Reconnect if stream stalls so we don't stay on a stale frame forever.
        if failures >= 20:
          try:
            self._capture.release()
          except Exception:
            pass
          self._capture = None
          self.status_text = f"Fallback: reconnecting RTSP stream ({active_url or self.rtsp_url})"
          failures = 0
        time.sleep(0.05)
        continue
      failures = 0
      ok, encoded = cv2.imencode(".jpg", frame)
      if ok:
        with self._frame_lock:
          self._latest_jpeg = encoded.tobytes()
          self._latest_jpeg_ts = time.time()
        self.status_text = f"Fallback tracker live on RTSP {active_url or self.rtsp_url}"
      time.sleep(DISPLAY_INTERVAL_SECONDS)

  def _attitude_loop(self) -> None:
    while not self._stop_event.is_set():
      if self._cam is not None:
        try:
          self._cam.requestGimbalAttitude()
          yaw, pitch, _ = self._cam.getAttitude()
          self.current_yaw = float(yaw)
          self.current_pitch = float(pitch)
        except Exception:
          pass
      time.sleep(ATTITUDE_INTERVAL_SECONDS)

  def ensure_started(self) -> None:
    if self._started:
      return
    self._started = True
    threading.Thread(target=self._connect_siyi, daemon=True).start()
    threading.Thread(target=self._frame_loop, daemon=True).start()
    threading.Thread(target=self._attitude_loop, daemon=True).start()

  def shutdown(self) -> None:
    self._stop_event.set()
    if self._capture is not None:
      try:
        self._capture.release()
      except Exception:
        pass
    if self._cam is not None:
      try:
        self._cam.disconnect()
      except Exception:
        pass

  def latest_jpeg(self) -> Optional[bytes]:
    with self._frame_lock:
      return self._latest_jpeg

  def has_stream(self) -> bool:
    with self._frame_lock:
      if self._latest_jpeg is None:
        return False
      return (time.time() - self._latest_jpeg_ts) < 2.5

  def frame_age_ms(self) -> int:
    with self._frame_lock:
      if self._latest_jpeg is None or self._latest_jpeg_ts <= 0:
        return -1
      return int(max(0.0, (time.time() - self._latest_jpeg_ts) * 1000.0))

  def _rtsp_candidates(self) -> List[str]:
    candidates: List[str] = []
    seen: set[str] = set()

    def add(url: str) -> None:
      if url and url not in seen:
        seen.add(url)
        candidates.append(url)

    add(self.rtsp_url)
    if "rtsp_transport=udp" not in self.rtsp_url:
      sep = "&" if "?" in self.rtsp_url else "?"
      add(f"{self.rtsp_url}{sep}rtsp_transport=udp")

    parsed = urlparse(self.rtsp_url)
    if parsed.scheme == "rtsp" and parsed.netloc:
      for path in ("/main.264", "/main", "/live.264", "/live"):
        if parsed.path != path:
          add(urlunparse((parsed.scheme, parsed.netloc, path, "", parsed.query, "")))

    return candidates

  def _open_capture(self):
    for candidate in self._rtsp_candidates():
      cap = cv2.VideoCapture(candidate, cv2.CAP_FFMPEG)
      cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
      cap.set(cv2.CAP_PROP_FPS, 20)
      if cap.isOpened():
        return cap, candidate
      cap.release()
    return None, None

  def status_payload(self) -> Dict[str, Any]:
    self.ensure_started()
    return {
      "status": self.status_text,
      "result": self.result_text,
      "tracking_enabled": self.tracking_enabled,
      "selected_model": self.selected_model,
      "selected_model_path": self.selected_model_path,
      "selected_model_classes": list(self.selected_model_classes),
      "enabled_classes": sorted(self.enabled_classes),
      "selected_track_id": self.selected_track_id,
      "camera_speed_scale": round(float(self.camera_speed_scale), 2),
      "yaw": round(float(self.current_yaw), 1),
      "pitch": round(float(self.current_pitch), 1),
      "stream_live": self.has_stream(),
      "frame_age_ms": self.frame_age_ms(),
      "target": None,
      "detections": list(self.detections),
      "models": list(self.models),
      "source": "backend_fallback",
    }

  def select_target(self, track_id: int) -> Dict[str, Any]:
    self.selected_track_id = int(track_id)
    self.result_text = f"Fallback selected target ID {self.selected_track_id}."
    return self.status_payload()

  def select_model(self, model_path: str) -> Dict[str, Any]:
    matched = next((item for item in self.models if item.get("path") == model_path), None)
    if matched is None:
      raise RuntimeError("Model not found in fallback tracker index.")
    self.selected_model_path = str(matched["path"])
    self.selected_model = str(matched["name"])
    self.selected_model_classes = [str(item) for item in matched.get("classes", [])]
    self.enabled_classes = set()
    self.result_text = f'Fallback selected model "{self.selected_model}".'
    return self.status_payload()

  def toggle_class(self, class_name: str) -> Dict[str, Any]:
    normalized = str(class_name).strip()
    if not normalized:
      raise RuntimeError("class_name is required")
    if normalized in self.enabled_classes:
      self.enabled_classes.remove(normalized)
    else:
      self.enabled_classes.add(normalized)
    self.result_text = f"Fallback class filter updated: {', '.join(sorted(self.enabled_classes)) or 'none'}"
    return self.status_payload()

  def toggle_tracking(self) -> Dict[str, Any]:
    self.tracking_enabled = not self.tracking_enabled
    self.result_text = "Fallback tracking enabled." if self.tracking_enabled else "Fallback tracking stopped."
    return self.status_payload()

  def stop_tracking(self) -> Dict[str, Any]:
    self.tracking_enabled = False
    self.result_text = "Fallback tracking stopped."
    return self.status_payload()

  def _safe_cam_call(self, fn_name: str, *args) -> None:
    if self._cam is None:
      return
    fn = getattr(self._cam, fn_name, None)
    if fn is None:
      return
    try:
      fn(*args)
    except Exception:
      pass

  def center(self) -> Dict[str, Any]:
    self._safe_cam_call("requestCenterGimbal")
    self.result_text = "Fallback center gimbal requested."
    return self.status_payload()

  def move(self, yaw: int, pitch: int) -> Dict[str, Any]:
    yaw_cmd = int(yaw)
    pitch_cmd = int(pitch)
    self._safe_cam_call("requestGimbalSpeed", yaw_cmd, pitch_cmd)
    self.result_text = f"Fallback move yaw={yaw_cmd}, pitch={pitch_cmd}"
    return self.status_payload()

  def stop_motion(self) -> Dict[str, Any]:
    self._safe_cam_call("requestGimbalSpeed", 0, 0)
    self.result_text = "Fallback stop motion."
    return self.status_payload()

  def zoom(self, direction: str) -> Dict[str, Any]:
    direction = str(direction).lower().strip()
    if direction == "in":
      self._safe_cam_call("requestZoomIn")
      self.result_text = "Fallback zoom in."
    elif direction == "out":
      self._safe_cam_call("requestZoomOut")
      self.result_text = "Fallback zoom out."
    else:
      raise RuntimeError('direction must be "in" or "out"')
    threading.Thread(target=self._stop_zoom_after_delay, args=(ZOOM_STEP_SECONDS,), daemon=True).start()
    return self.status_payload()

  def _stop_zoom_after_delay(self, delay_seconds: float) -> None:
    time.sleep(delay_seconds)
    self._safe_cam_call("requestZoomHold")

  def set_camera_speed(self, speed_scale: float) -> Dict[str, Any]:
    speed = float(speed_scale)
    if speed < CAMERA_SPEED_MIN:
      speed = CAMERA_SPEED_MIN
    if speed > CAMERA_SPEED_MAX:
      speed = CAMERA_SPEED_MAX
    self.camera_speed_scale = speed
    self.result_text = f"Fallback camera speed set to {speed:.2f}x."
    return self.status_payload()
