import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, urlunparse

import cv2
import torch
from ultralytics import YOLO

# Critical FFMPEG low-latency options used by SIYIRTSP — the proven working approach.
# Without these, OpenCV FFMPEG defaults to 30s RTSP connection timeout.
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
  "rtsp_transport;udp|fflags;nobuffer|flags;low_delay|max_delay;0"
  "|probesize;32|analyzeduration;0"
  "|stimeout;2000000|rw_timeout;2000000|timeout;2000000"
)

SUPPORTED_MODEL_EXTENSIONS = {".pt", ".onnx", ".engine", ".torchscript"}

VIDEO_WIDTH = 640
VIDEO_HEIGHT = 360
DETECTION_WIDTH = 320
TRACK_INTERVAL_MS = 40
ATTITUDE_INTERVAL_MS = 300
DISPLAY_INTERVAL_MS = 40
MAX_YAW_SPEED = 25
MAX_PITCH_SPEED = 20
X_DEADBAND = 0.08
Y_DEADBAND = 0.10
YAW_GAIN = 70
PITCH_GAIN = 55
CONF_THRESHOLD = 0.35
TARGET_MATCH_DISTANCE = 160
INFERENCE_IDLE_MS = 0.01
YAW_SIGN = 1
PITCH_SIGN = -1
TRACK_STALE_SECONDS = 2.5
RETICLE_HALF_GAP = 85
RETICLE_CORNER_LEN = 32
CENTER_TOLERANCE_PX = 8
CAMERA_SPEED_MIN = 0.2
CAMERA_SPEED_MAX = 3.0
CAMERA_SPEED_DEFAULT = 1.0
ZOOM_STEP_SECONDS = 0.5


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
    self.selected_track_class: Optional[str] = None
    self.camera_speed_scale = CAMERA_SPEED_DEFAULT
    self.current_yaw = 0.0
    self.current_pitch = 0.0
    
    self.last_target = None
    self.target_center = None
    self.last_detection_time = 0.0
    
    self.active_detections: List[Dict[str, Any]] = []
    self.track_memory: Dict[int, Dict[str, Any]] = {}
    self.next_track_id = 1
    self.models: List[Dict[str, Any]] = []

    self._cam = None
    self._stream = None  # SIYIRTSP instance
    self._model = None
    self._model_cache: Dict[str, YOLO] = {}
    self._use_cuda = torch.cuda.is_available()

    self._frame_lock = threading.Lock()
    self._target_lock = threading.Lock()
    self._latest_frame = None
    self.frame_shape = {"width": VIDEO_WIDTH, "height": VIDEO_HEIGHT}
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
    """Connect to the SIYI gimbal using SIYISDK."""
    try:
      if str(self.tracker_root) not in sys.path:
        sys.path.insert(0, str(self.tracker_root))
      from siyi_sdk.siyi_sdk import SIYISDK  # type: ignore

      print(f"[Fallback SDK] Connecting to gimbal at {self.camera_ip}:{self.camera_port}...")
      cam = SIYISDK(server_ip=self.camera_ip, port=self.camera_port)
      
      # The .connect() call spawns threads and binds UDP sockets.
      # If another process (like an orphan tracker) is using the ports, this may fail.
      if cam.connect():
        self._cam = cam
        try:
          self._cam.requestFollowMode()
          self._cam.requestHardwareID()
          self._cam.requestGimbalAttitude()
        except Exception:
          pass
        self.status_text = f"Fallback: Connected to SIYI gimbal at {self.camera_ip}"
      else:
        self.status_text = f"Fallback: Failed to connect to SIYI gimbal at {self.camera_ip}:{self.camera_port}"
    except Exception as e:
      self.status_text = f"Fallback: SIYI SDK error: {e}"
      # Log but don't crash; might be a temporary socket conflict (WSAEADDRINUSE)
      print(f"[Fallback SDK Error] SIYI connection failed: {e}")

  def _connect_rtsp_stream(self) -> None:
    """Open the RTSP video stream using SIYIRTSP (the proven working approach)."""
    max_retries = 3
    retry_delay = 2.0
    
    for attempt in range(max_retries):
      if self._stop_event.is_set():
        return
        
      try:
        if str(self.tracker_root) not in sys.path:
          sys.path.insert(0, str(self.tracker_root))
        from siyi_sdk.stream import SIYIRTSP  # type: ignore

        # SIYIRTSP will try multiple candidates internally (/main.264, /main, etc.)
        stream = SIYIRTSP(
          rtsp_url=self.rtsp_url,
          cam_name="A8 Mini Fallback",
          debug=False,
          use_udp=True,
        )
        if stream.isOpened():
          self._stream = stream
          self.status_text = f"Fallback RTSP stream connected: {self.rtsp_url}"
          return
        else:
          self.status_text = f"Fallback: SIYIRTSP failed to open {self.rtsp_url} (attempt {attempt+1}/{max_retries})"
          stream.close()
      except Exception as exc:
        self.status_text = f"Fallback: RTSP stream error {exc} (attempt {attempt+1}/{max_retries})"
      
      if attempt < max_retries - 1:
        time.sleep(retry_delay)
    
    self.status_text = f"Fallback: Failed to connect RTSP stream after {max_retries} attempts."

  def draw_overlay(self, frame):
      output = cv2.resize(frame, (VIDEO_WIDTH, VIDEO_HEIGHT))
      h, w = output.shape[:2]
      scale_x = VIDEO_WIDTH / frame.shape[1]
      scale_y = VIDEO_HEIGHT / frame.shape[0]

      def draw_corner_box(img, x1: int, y1: int, x2: int, y2: int, color: tuple[int, int, int], thickness: int = 2) -> None:
          corner = max(6, min(RETICLE_CORNER_LEN, (x2 - x1) // 2, (y2 - y1) // 2))
          cv2.line(img, (x1, y1), (x1 + corner, y1), color, thickness)
          cv2.line(img, (x1, y1), (x1, y1 + corner), color, thickness)
          cv2.line(img, (x2, y1), (x2 - corner, y1), color, thickness)
          cv2.line(img, (x2, y1), (x2, y1 + corner), color, thickness)
          cv2.line(img, (x1, y2), (x1 + corner, y2), color, thickness)
          cv2.line(img, (x1, y2), (x1, y2 - corner), color, thickness)
          cv2.line(img, (x2, y2), (x2 - corner, y2), color, thickness)
          cv2.line(img, (x2, y2), (x2, y2 - corner), color, thickness)

      selected = None
      if self.selected_track_id is not None:
          for det in self.active_detections:
              if int(det.get("track_id", -1)) == int(self.selected_track_id):
                  selected = det
                  break

      if selected is not None:
          left = int(selected["x"] * scale_x)
          top = int(selected["y"] * scale_y)
          right = int((selected["x"] + selected["w"]) * scale_x)
          bottom = int((selected["y"] + selected["h"]) * scale_y)
          left = max(0, min(w - 1, left))
          right = max(0, min(w - 1, right))
          top = max(0, min(h - 1, top))
          bottom = max(0, min(h - 1, bottom))
          if right <= left:
              right = min(w - 1, left + 1)
          if bottom <= top:
              bottom = min(h - 1, top + 1)
          cx = (left + right) // 2
          cy = (top + bottom) // 2

          # Yellow split crosshair lines
          cv2.line(output, (cx, 0), (cx, top), (0, 255, 255), 2)
          cv2.line(output, (cx, bottom), (cx, h), (0, 255, 255), 2)
          cv2.line(output, (0, cy), (left, cy), (0, 255, 255), 2)
          cv2.line(output, (right, cy), (w, cy), (0, 255, 255), 2)

          # Green corner target box
          c = RETICLE_CORNER_LEN
          g = (0, 255, 0)
          t = 2
          cv2.line(output, (left, top), (left + c, top), g, t)
          cv2.line(output, (left, top), (left, top + c), g, t)
          cv2.line(output, (right, top), (right - c, top), g, t)
          cv2.line(output, (right, top), (right, top + c), g, t)
          cv2.line(output, (left, bottom), (left + c, bottom), g, t)
          cv2.line(output, (left, bottom), (left, bottom - c), g, t)
          cv2.line(output, (right, bottom), (right - c, bottom), g, t)
          cv2.line(output, (right, bottom), (right, bottom - c), g, t)

      for det in self.active_detections:
          x1 = int(det["x"] * scale_x)
          y1 = int(det["y"] * scale_y)
          x2 = int((det["x"] + det["w"]) * scale_x)
          y2 = int((det["y"] + det["h"]) * scale_y)
          track_id = int(det.get("track_id", -1))

          is_selected = self.selected_track_id is not None and track_id == int(self.selected_track_id)
          color = (0, 255, 0) if is_selected else (255, 190, 40)
          if is_selected:
              draw_corner_box(output, x1, y1, x2, y2, color, 2)
          else:
              cv2.rectangle(output, (x1, y1), (x2, y2), color, 2)
          cv2.putText(
              output,
              f'ID {track_id} {det["class_name"]} {det["confidence"]:.2f}',
              (x1, max(20, y1 - 8)),
              cv2.FONT_HERSHEY_SIMPLEX,
              0.5,
              color,
              2,
              cv2.LINE_AA,
          )

      if self.tracking_enabled and self.selected_track_id is not None:
          cv2.putText(
              output,
              f"TRACKING ID {self.selected_track_id}",
              (12, 28),
              cv2.FONT_HERSHEY_SIMPLEX,
              0.7,
              (0, 0, 255),
              2,
              cv2.LINE_AA,
          )

      return output

  def _frame_loop(self) -> None:
    """Grab frames from SIYIRTSP."""
    reconnect_delay = 1.0
    while not self._stop_event.is_set():
      # Wait for stream to be available
      if self._stream is None or not self._stream.isOpened():
        self.status_text = f"Fallback: waiting for RTSP stream {self.rtsp_url}"
        time.sleep(reconnect_delay)
        # Try to reconnect if stream died
        if self._stream is None:
          self._connect_rtsp_stream()
        continue

      frame = self._stream.getFrame()
      if frame is None:
        time.sleep(0.005)
        continue

      with self._frame_lock:
        self._latest_frame = frame

      time.sleep(0.005)

  def render_loop(self) -> None:
    while not self._stop_event.is_set():
      with self._frame_lock:
        frame = self._latest_frame.copy() if self._latest_frame is not None else None
        
      if frame is not None:
        display_frame = self.draw_overlay(frame)
        ok, encoded = cv2.imencode(".jpg", display_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if ok:
          with self._frame_lock:
            self._latest_jpeg = encoded.tobytes()
            self._latest_jpeg_ts = time.time()
      time.sleep(DISPLAY_INTERVAL_MS / 1000.0)

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
      time.sleep(ATTITUDE_INTERVAL_MS / 1000.0)

  def resize_for_detection(self, frame, width: int = DETECTION_WIDTH):
      h, w = frame.shape[:2]
      if w == width:
          return frame
      scale = width / float(w)
      new_h = int(h * scale)
      return cv2.resize(frame, (width, new_h), interpolation=cv2.INTER_AREA)

  def class_name(self, cls_id: int, names: dict) -> str:
      if isinstance(names, dict):
          return str(names.get(cls_id, str(cls_id)))
      if isinstance(names, (list, tuple)) and 0 <= cls_id < len(names):
          return str(names[cls_id])
      return str(cls_id)

  def _assign_track_ids(self, candidates: List[Dict]) -> List[Dict]:
      now = time.time()
      fresh_memory = {
          tid: meta
          for tid, meta in self.track_memory.items()
          if now - float(meta.get("seen_at", 0.0)) <= TRACK_STALE_SECONDS
      }
      self.track_memory = fresh_memory

      used_track_ids = set()
      for item in candidates:
          best_id = None
          best_dist = None
          for track_id, meta in self.track_memory.items():
              if track_id in used_track_ids:
                  continue
              if str(meta.get("class_name")) != str(item.get("class_name")):
                  continue
              dx = float(item["cx"]) - float(meta.get("cx", 0.0))
              dy = float(item["cy"]) - float(meta.get("cy", 0.0))
              dist = (dx * dx + dy * dy) ** 0.5
              if dist > TARGET_MATCH_DISTANCE:
                  continue
              if best_id is None or dist < best_dist:
                  best_id = track_id
                  best_dist = dist

          if best_id is None:
              best_id = self.next_track_id
              self.next_track_id += 1

          item["track_id"] = best_id
          used_track_ids.add(best_id)

      for item in candidates:
          self.track_memory[int(item["track_id"])] = {
              "cx": float(item["cx"]),
              "cy": float(item["cy"]),
              "class_name": str(item["class_name"]),
              "seen_at": now,
          }
      return candidates

  def detect_objects(self, frame) -> List[Dict]:
      model = self._model
      if model is None:
          return []
      enabled_classes = set(self.enabled_classes)
      if not enabled_classes:
          return []
      names = model.names

      resized = self.resize_for_detection(frame)
      results = model.predict(
          source=resized,
          conf=CONF_THRESHOLD,
          imgsz=DETECTION_WIDTH,
          device=0 if self._use_cuda else "cpu",
          half=self._use_cuda,
          max_det=30,
          verbose=False,
      )
      if not results:
          return []

      boxes = results[0].boxes
      if boxes is None or len(boxes) == 0:
          return []

      scale_x = frame.shape[1] / resized.shape[1]
      scale_y = frame.shape[0] / resized.shape[0]

      xyxy_list = boxes.xyxy.cpu().tolist()
      conf_list = boxes.conf.cpu().tolist()
      cls_list = boxes.cls.cpu().tolist() if boxes.cls is not None else [0.0] * len(xyxy_list)

      detections = []
      for xyxy, confidence, cls_id in zip(xyxy_list, conf_list, cls_list):
          x1, y1, x2, y2 = xyxy
          x = int(x1 * scale_x)
          y = int(y1 * scale_y)
          w = int((x2 - x1) * scale_x)
          h = int((y2 - y1) * scale_y)
          if w <= 1 or h <= 1:
              continue
          cx = x + (w / 2.0)
          cy = y + (h / 2.0)
          class_name = self.class_name(int(cls_id), names)
          if class_name not in enabled_classes:
              continue
          detections.append(
              {
                  "x": x,
                  "y": y,
                  "w": w,
                  "h": h,
                  "confidence": float(confidence),
                  "cls_id": int(cls_id),
                  "class_name": class_name,
                  "cx": cx,
                  "cy": cy,
              }
          )

      return self._assign_track_ids(detections)

  def _reacquire_selected_target(self, detections: List[Dict]) -> Optional[Dict]:
      if not detections or not self.selected_track_class:
          return None

      same_class = [item for item in detections if str(item.get("class_name")) == self.selected_track_class]
      if not same_class:
          return None

      anchor = self.target_center
      if anchor is None and self.last_target is not None:
          anchor = (float(self.last_target.get("cx", 0.0)), float(self.last_target.get("cy", 0.0)))

      if anchor is None:
          return max(same_class, key=lambda item: float(item.get("confidence", 0.0)))

      ax, ay = float(anchor[0]), float(anchor[1])
      best = None
      best_score = None
      for item in same_class:
          dx = float(item.get("cx", 0.0)) - ax
          dy = float(item.get("cy", 0.0)) - ay
          distance = (dx * dx + dy * dy) ** 0.5
          score = distance - (float(item.get("confidence", 0.0)) * 50.0)
          if best is None or score < best_score:
              best = item
              best_score = score
      return best

  def inference_loop(self) -> None:
      while not self._stop_event.is_set():
          try:
              if self._model is None:
                  time.sleep(INFERENCE_IDLE_MS)
                  continue

              with self._frame_lock:
                  frame = self._latest_frame.copy() if self._latest_frame is not None else None

              if frame is None:
                  time.sleep(INFERENCE_IDLE_MS)
                  continue

              detections = self.detect_objects(frame)
              self.active_detections = detections

              selected = None
              if self.selected_track_id is not None:
                  for item in detections:
                      if int(item.get("track_id", -1)) == int(self.selected_track_id):
                          selected = dict(item)
                          break

              if selected is None and self.tracking_enabled and self.selected_track_id is not None:
                  reacquired = self._reacquire_selected_target(detections)
                  if reacquired is not None:
                      selected_id = int(self.selected_track_id)
                      reacquired_local = dict(reacquired)
                      new_detected_id = int(reacquired_local.get("track_id", selected_id))
                      reacquired_local["track_id"] = selected_id
                      selected = reacquired_local

                      for item in detections:
                          if int(item.get("track_id", -1)) == new_detected_id:
                              item["track_id"] = selected_id
                              break

                      self.track_memory[selected_id] = {
                          "cx": float(reacquired_local.get("cx", 0.0)),
                          "cy": float(reacquired_local.get("cy", 0.0)),
                          "class_name": str(reacquired_local.get("class_name", "")),
                          "seen_at": time.time(),
                      }

                      if new_detected_id != selected_id:
                          self.track_memory.pop(new_detected_id, None)
                      self.status_text = f"Reacquired target with stable ID {selected_id}."

              with self._target_lock:
                  self.last_target = selected
                  self.last_detection_time = time.time() if selected is not None else self.last_detection_time

              if selected is not None:
                  self.target_center = (float(selected["cx"]), float(selected["cy"]))
              elif self.tracking_enabled and self.selected_track_id is not None:
                  self.status_text = f"Selected ID {self.selected_track_id} lost. Waiting to reacquire."
          except Exception as exc:
              self.active_detections = []
              self.status_text = f"Detection loop recovered from error: {exc}"

          time.sleep(INFERENCE_IDLE_MS)

  def compute_speed(
      self,
      normalized_error: float,
      deadband: float,
      gain: float,
      max_speed: int,
      min_speed: int = 1,
  ) -> int:
      if abs(normalized_error) < deadband:
          return 0
      raw_speed = gain * normalized_error
      if 0.0 < abs(raw_speed) < float(min_speed):
          raw_speed = float(min_speed) if raw_speed > 0 else -float(min_speed)
      speed = int(round(raw_speed))
      if speed > max_speed:
          return max_speed
      if speed < -max_speed:
          return -max_speed
      return speed

  def track_loop(self) -> None:
      while not self._stop_event.is_set():
          target = None

          with self._target_lock:
              if self.last_target is not None:
                  target = dict(self.last_target)
              detection_age = time.time() - self.last_detection_time if self.last_detection_time else None

          with self._frame_lock:
              frame = self._latest_frame.copy() if self._latest_frame is not None else None

          if self.tracking_enabled and self._cam is not None and frame is not None:
              if target is None or (detection_age is not None and detection_age > 0.5):
                  self.stop_motion()
              else:
                  center_x = target["cx"]
                  center_y = target["cy"]
                  frame_center_x = frame.shape[1] / 2.0
                  frame_center_y = frame.shape[0] / 2.0

                  x_error_px = center_x - frame_center_x
                  y_error_px = center_y - frame_center_y
                  
                  if abs(x_error_px) <= CENTER_TOLERANCE_PX and abs(y_error_px) <= CENTER_TOLERANCE_PX:
                      self.stop_motion()
                      self.status_text = f"Tracking ID {self.selected_track_id}. Target centered."
                      time.sleep(TRACK_INTERVAL_MS / 1000.0)
                      continue

                  x_error = x_error_px / frame.shape[1]
                  y_error = y_error_px / frame.shape[0]

                  yaw_speed = self.compute_speed(x_error, 0.0, YAW_GAIN, MAX_YAW_SPEED, min_speed=1) * YAW_SIGN
                  pitch_speed = self.compute_speed(y_error, 0.0, PITCH_GAIN, MAX_PITCH_SPEED, min_speed=1) * PITCH_SIGN
                  yaw_speed = int(yaw_speed * self.camera_speed_scale)
                  pitch_speed = int(pitch_speed * self.camera_speed_scale)

                  self._cam.requestGimbalSpeed(yaw_speed, pitch_speed)
                  self.status_text = (
                      f"Tracking ID {self.selected_track_id}. "
                      f"yaw_speed={yaw_speed}, pitch_speed={pitch_speed}, scale={self.camera_speed_scale:.2f}x"
                  )

          time.sleep(TRACK_INTERVAL_MS / 1000.0)

  def ensure_started(self) -> None:
    if self._started:
      return
    self._started = True
    threading.Thread(target=self._connect_siyi, daemon=True).start()
    threading.Thread(target=self._connect_rtsp_stream, daemon=True).start()
    threading.Thread(target=self._frame_loop, daemon=True).start()
    threading.Thread(target=self._attitude_loop, daemon=True).start()
    threading.Thread(target=self.inference_loop, daemon=True).start()
    threading.Thread(target=self.render_loop, daemon=True).start()
    threading.Thread(target=self.track_loop, daemon=True).start()

  def shutdown(self) -> None:
    self.tracking_enabled = False
    self._stop_event.set()
    try:
      self.stop_motion()
    except Exception:
      pass
    if self._stream is not None:
      try:
        self._stream.close()
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
    """Legacy fallback: open RTSP via raw cv2.VideoCapture if SIYIRTSP is unavailable."""
    for candidate in self._rtsp_candidates():
      cap = cv2.VideoCapture(candidate, cv2.CAP_FFMPEG)
      cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
      cap.set(cv2.CAP_PROP_FPS, 25)
      if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 3000)
      if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 3000)
      if cap.isOpened():
        return cap, candidate
      cap.release()
    return None, None

  def status_payload(self) -> Dict[str, Any]:
    self.ensure_started()
    target = None
    with self._target_lock:
        if self.last_target is not None:
            target = dict(self.last_target)

    detections = []
    for item in self.active_detections:
        detections.append(
            {
                "track_id": int(item.get("track_id", -1)),
                "class_name": item.get("class_name"),
                "confidence": round(float(item.get("confidence", 0.0)), 3),
                "x": int(item.get("x", 0)),
                "y": int(item.get("y", 0)),
                "w": int(item.get("w", 0)),
                "h": int(item.get("h", 0)),
                "cx": float(item.get("cx", 0.0)),
                "cy": float(item.get("cy", 0.0)),
            }
        )
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
      "target": target,
      "detections": detections,
      "models": list(self.models),
      "source": "backend_fallback",
    }

  def select_model(self, model_path: str) -> Dict[str, Any]:
    self.ensure_started()
    
    if not model_path:
      self._model = None
      self.selected_model = None
      self.selected_model_path = None
      self.selected_model_classes = []
      self.enabled_classes = set()
      self.active_detections = []
      self.track_memory = {}
      self.selected_track_id = None
      self.selected_track_class = None
      self.tracking_enabled = False
      with self._target_lock:
          self.last_target = None
      self.status_text = "Detection disabled."
      self.result_text = "Select a model icon to start detection."
      return self.status_payload()
      
    matched = next((item for item in self.models if item.get("path") == model_path), None)
    if matched is None:
      raise RuntimeError("Model not found in fallback tracker index.")
      
    try:
      if model_path not in self._model_cache:
        self._model_cache[model_path] = YOLO(model_path)
      self._model = self._model_cache[model_path]
      self.selected_model_path = str(matched["path"])
      self.selected_model = str(matched["name"])
      
      names = self._model.names
      self.selected_model_classes = list(names.values()) if isinstance(names, dict) else list(names)
      self.enabled_classes = set(self.selected_model_classes)
      
      self.active_detections = []
      self.track_memory = {}
      self.selected_track_id = None
      self.selected_track_class = None
      self.tracking_enabled = False
      with self._target_lock:
          self.last_target = None
      
      icon = _icon_from_model_name(self.selected_model)
      self.status_text = f"Loaded {self.selected_model}"
      self.result_text = f"Loaded model {icon} / {self.selected_model}. Ready to detect object."
    except Exception as e:
      self.status_text = f"Failed to load model: {e}"
      self.result_text = self.status_text
    return self.status_payload()

  def toggle_class(self, class_name: str) -> Dict[str, Any]:
    self.ensure_started()
    normalized = str(class_name).strip()
    if not normalized:
      return self.status_payload()
    if normalized in self.enabled_classes:
      self.enabled_classes.remove(normalized)
      self.status_text = f"Disabled filtering for '{normalized}'"
    else:
      self.enabled_classes.add(normalized)
      self.status_text = f"Enabled filtering for '{normalized}'"
    return self.status_payload()

  def select_target(self, track_id: int) -> Dict[str, Any]:
    self.ensure_started()
    chosen = None
    for item in self.active_detections:
        if int(item.get("track_id", -1)) == int(track_id):
            chosen = dict(item)
            break

    if chosen is None:
        self.status_text = f"Track ID {track_id} is not currently visible."
        return self.status_payload()

    self.selected_track_id = int(track_id)
    self.selected_track_class = str(chosen.get("class_name", "")).strip() or None
    self.target_center = (float(chosen["cx"]), float(chosen["cy"]))
    with self._target_lock:
        self.last_target = chosen
        self.last_detection_time = time.time()
    self.tracking_enabled = True
    self.result_text = f'Selected ID {self.selected_track_id} ({chosen["class_name"]}) from model "{self.selected_model}".'
    self.status_text = f"Tracking started for ID {self.selected_track_id}."
    return self.status_payload()

  def toggle_tracking(self) -> Dict[str, Any]:
    self.ensure_started()
    if not self.tracking_enabled and self.selected_track_id is not None:
      self.tracking_enabled = True
      self.status_text = f"Tracking resumed for ID {self.selected_track_id}"
    else:
      self.tracking_enabled = False
      self.stop_motion()
      self.status_text = "Tracking disabled/paused."
    return self.status_payload()

  def stop_tracking(self) -> Dict[str, Any]:
    self.ensure_started()
    self.tracking_enabled = False
    self.selected_track_id = None
    self.selected_track_class = None
    self.stop_motion()
    with self._target_lock:
        self.last_target = None
        self.target_center = None
    self.status_text = "Tracking cleared."
    self.result_text = "Tracking cleared."
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
