import argparse
import json
import os
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import urlparse

import cv2
import torch

PROJECT_DIR = os.path.dirname(os.path.realpath(__file__))
WEB_DIR = os.path.join(PROJECT_DIR, "web")
HTML_PAGE_PATH = os.path.join(WEB_DIR, "icon_model_tracker.html")



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
MJPEG_BOUNDARY = b"--frame"
ZOOM_STEP_SECONDS = 0.25
TRACK_STALE_SECONDS = 2.5
RETICLE_HALF_GAP = 85
RETICLE_CORNER_LEN = 32
CENTER_TOLERANCE_PX = 8
CAMERA_SPEED_MIN = 0.2
CAMERA_SPEED_MAX = 3.0
CAMERA_SPEED_DEFAULT = 1.0
AUTO_ZOOM_MIN_FILL_RATIO = 0.18
AUTO_ZOOM_MAX_FILL_RATIO = 0.34
AUTO_ZOOM_CENTER_GATE_RATIO = 0.18
AUTO_ZOOM_COOLDOWN_SECONDS = 0.9

from model_registry import ensure_models_dir, load_model_index, model_index_needs_refresh
from siyi_sdk.siyi_sdk import SIYISDK
from siyi_sdk.stream import SIYIRTSP
from ultralytics import YOLO

CAMERA_IP = "192.168.144.25"
CAMERA_PORT = 37260
CAMERA_NAME = "A8 Mini"


def model_icon_key(model_name: str) -> str:
    lowered = model_name.lower()
    if any(token in lowered for token in ("aircraft", "plane", "jet", "fighter", "helicopter")):
        return "aircraft"
    if "drone" in lowered:
        return "drone"
    if "person" in lowered or "human" in lowered:
        return "person"
    if any(token in lowered for token in ("car", "vehicle", "tank", "apc", "ifv", "truck")):
        return "vehicle"
    if any(token in lowered for token in ("ship", "boat", "vessel", "submarine")):
        return "vessel"
    return "model"


class IconModelTrackerService:
    _model_cache: dict[str, YOLO] = {}

    def __init__(
        self,
        rtsp_url: str,
        refresh_index: bool,
        camera_ip: str = CAMERA_IP,
        camera_port: int = CAMERA_PORT,
        camera_name: str = CAMERA_NAME,
    ) -> None:
        self.rtsp_url = rtsp_url
        self.refresh_index = refresh_index
        self.camera_ip = camera_ip
        self.camera_port = camera_port
        self.camera_name = camera_name

        self.cam: Optional[SIYISDK] = None
        self.stream: Optional[SIYIRTSP] = None
        self.model = None
        self.model_name: Optional[str] = None
        self.model_path: Optional[str] = None
        self.use_cuda = torch.cuda.is_available()

        self.model_entries = load_model_index(refresh=refresh_index)

        self.tracking_enabled = False
        self.current_yaw = 0.0
        self.current_pitch = 0.0
        self.camera_speed_scale = CAMERA_SPEED_DEFAULT
        self.last_target = None
        self.target_center = None
        self.last_detection_time = 0.0
        self.last_zoom_action_time = 0.0

        self.selected_model_path: Optional[str] = None
        self.selected_model_name: Optional[str] = None
        self.selected_model_classes: list[str] = []
        self.enabled_classes: set[str] = set()
        self.selected_track_id: Optional[int] = None
        self.selected_track_class: Optional[str] = None

        self.status_text = "Connecting..."
        self.result_text = "Select a model icon to start detection."

        self.frame_lock = threading.Lock()
        self.target_lock = threading.Lock()
        self.zoom_lock = threading.Lock()
        self.stop_event = threading.Event()
        self.latest_frame = None
        self.latest_jpeg: Optional[bytes] = None
        self.frame_shape = {"width": VIDEO_WIDTH, "height": VIDEO_HEIGHT}

        self.active_detections: list[dict] = []
        self.track_memory: dict[int, dict] = {}
        self.next_track_id = 1

        self._connect()

        self.inference_thread = threading.Thread(target=self.inference_loop, daemon=True)
        self.render_thread = threading.Thread(target=self.render_loop, daemon=True)
        self.track_thread = threading.Thread(target=self.track_loop, daemon=True)
        self.attitude_thread = threading.Thread(target=self.attitude_loop, daemon=True)

        self.inference_thread.start()
        self.render_thread.start()
        self.track_thread.start()
        self.attitude_thread.start()

    def _connect(self) -> None:
        try:
            self.cam = SIYISDK(server_ip=self.camera_ip, port=self.camera_port)
            if not self.cam.connect():
                self.status_text = f"Failed to connect to gimbal control at {self.camera_ip}:{self.camera_port}."
                return

            self.cam.requestFollowMode()
            self.cam.requestHardwareID()
            self.cam.requestGimbalAttitude()
            self.stream = SIYIRTSP(rtsp_url=self.rtsp_url, cam_name=self.camera_name, debug=False)
            if self.stream is None or not self.stream.isOpened():
                self.status_text = f"Connected to gimbal, but RTSP failed. Check stream URL: {self.rtsp_url}"
                return
            device_name = "CUDA" if self.use_cuda else "CPU"
            self.status_text = f"Connected to {self.camera_ip}. Choose a model to begin ({device_name})."
        except Exception as exc:
            self.status_text = f"Connection error: {exc}"

    def _load_tracking_model(self, model_path: str) -> None:
        self.model_path = model_path
        if model_path not in self._model_cache:
            self._model_cache[model_path] = YOLO(model_path)
        self.model = self._model_cache[model_path]
        self.model_name = os.path.basename(model_path)

    def get_model_buttons(self) -> list[dict]:
        items = []
        for entry in self.model_entries:
            name = str(entry.get("name", "model"))
            path = str(entry.get("path", ""))
            classes = [str(item) for item in entry.get("classes", [])]
            items.append(
                {
                    "name": name,
                    "path": path,
                    "icon": model_icon_key(name),
                    "classes": classes,
                }
            )
        return items

    def clear_selected_model(self) -> None:
        self.model = None
        self.model_name = None
        self.model_path = None
        self.selected_model_path = None
        self.selected_model_name = None
        self.selected_model_classes = []
        self.enabled_classes = set()
        self.selected_track_id = None
        self.selected_track_class = None
        self.tracking_enabled = False
        self.active_detections = []
        self.track_memory = {}
        with self.target_lock:
            self.last_target = None
            self.last_detection_time = 0.0
        self.target_center = None
        self.result_text = "Model deselected. Detection stopped."
        self.status_text = "Detection stopped. Select a model to resume."

    def select_model(self, model_path: str) -> None:
        if self.selected_model_path == model_path:
            self.stop_motion()
            self.clear_selected_model()
            return

        matched = None
        for entry in self.model_entries:
            if str(entry.get("path")) == model_path:
                matched = entry
                break
        if matched is None:
            raise RuntimeError("Requested model was not found in model index.")

        self._load_tracking_model(model_path)
        self.selected_model_path = model_path
        self.selected_model_name = str(matched.get("name") or os.path.basename(model_path))
        self.selected_model_classes = sorted((str(item) for item in matched.get("classes", [])), key=str.lower)
        self.enabled_classes = set()
        self.selected_track_id = None
        self.selected_track_class = None
        self.tracking_enabled = False
        with self.target_lock:
            self.last_target = None
            self.last_detection_time = 0.0
        self.target_center = None
        self.active_detections = []
        self.track_memory = {}
        self.result_text = f'Model "{self.selected_model_name}" selected. Enable classes to start detection.'
        self.status_text = "Model selected. No classes enabled."

    def toggle_class_filter(self, class_name: str) -> None:
        if not self.selected_model_path:
            raise RuntimeError("Select a model first.")

        normalized = str(class_name).strip()
        if not normalized:
            raise RuntimeError("Class name is required.")
        if normalized not in self.selected_model_classes:
            raise RuntimeError(f'Class "{normalized}" is not part of the selected model.')

        if normalized in self.enabled_classes:
            self.enabled_classes.remove(normalized)
        else:
            self.enabled_classes.add(normalized)

        self.active_detections = [
            item for item in self.active_detections if str(item.get("class_name")) in self.enabled_classes
        ]
        self.track_memory = {
            tid: meta for tid, meta in self.track_memory.items() if str(meta.get("class_name")) in self.enabled_classes
        }

        if self.selected_track_class and self.selected_track_class not in self.enabled_classes:
            self.stop_tracking()
            self.selected_track_id = None
            self.selected_track_class = None
            with self.target_lock:
                self.last_target = None
                self.last_detection_time = 0.0
            self.target_center = None

        enabled_count = len(self.enabled_classes)
        if enabled_count == 0:
            self.result_text = f'No classes enabled for model "{self.selected_model_name}".'
            self.status_text = "Detection paused until at least one class is enabled."
        else:
            enabled_list = ", ".join(sorted(self.enabled_classes))
            self.result_text = f'Enabled classes for "{self.selected_model_name}": {enabled_list}.'
            self.status_text = f"Detecting {enabled_count} enabled class(es)."

    def rotate_camera(self, yaw_speed: int, pitch_speed: int) -> None:
        if self.cam is None:
            self.status_text = "Gimbal control is not connected."
            return
        self.cam.requestGimbalSpeed(yaw_speed, pitch_speed)
        self.status_text = f"Manual camera move: yaw={yaw_speed}, pitch={pitch_speed}"

    def stop_motion(self) -> None:
        if self.cam is not None:
            self.cam.requestGimbalSpeed(0, 0)

    def stop_tracking(self) -> None:
        self.tracking_enabled = False
        self.stop_motion()
        if self.selected_track_id is not None:
            self.status_text = f"Tracking stopped for ID {self.selected_track_id}."
        else:
            self.status_text = "Tracking stopped."

    def _stop_zoom_after_delay(self, delay_seconds: float) -> None:
        time.sleep(delay_seconds)
        with self.zoom_lock:
            if self.cam is None or self.stop_event.is_set():
                return
            self.cam.requestZoomHold()

    def _zoom_step(self, direction: str, hold_seconds: float = ZOOM_STEP_SECONDS) -> None:
        if self.cam is None:
            self.status_text = "Gimbal control is not connected."
            return

        with self.zoom_lock:
            if direction == "in":
                self.cam.requestZoomIn()
                self.status_text = "Zooming in."
            elif direction == "out":
                self.cam.requestZoomOut()
                self.status_text = "Zooming out."
            else:
                raise ValueError("Invalid zoom direction")

        threading.Thread(
            target=self._stop_zoom_after_delay,
            args=(hold_seconds,),
            daemon=True,
        ).start()

    def _target_fill_ratio(self, target: dict, frame) -> float:
        frame_w = max(1.0, float(frame.shape[1]))
        frame_h = max(1.0, float(frame.shape[0]))
        width_ratio = float(target.get("w", 0.0)) / frame_w
        height_ratio = float(target.get("h", 0.0)) / frame_h
        return max(width_ratio, height_ratio)

    def _maybe_auto_zoom(self, target: dict, frame, x_error_px: float, y_error_px: float) -> Optional[str]:
        if self.cam is None:
            return None

        now = time.time()
        if now - self.last_zoom_action_time < AUTO_ZOOM_COOLDOWN_SECONDS:
            return None

        center_gate_x = frame.shape[1] * AUTO_ZOOM_CENTER_GATE_RATIO
        center_gate_y = frame.shape[0] * AUTO_ZOOM_CENTER_GATE_RATIO
        if abs(x_error_px) > center_gate_x or abs(y_error_px) > center_gate_y:
            return None

        fill_ratio = self._target_fill_ratio(target, frame)
        if fill_ratio < AUTO_ZOOM_MIN_FILL_RATIO:
            self._zoom_step("in")
            self.last_zoom_action_time = now
            return f"in({fill_ratio:.2f})"
        if fill_ratio > AUTO_ZOOM_MAX_FILL_RATIO:
            self._zoom_step("out")
            self.last_zoom_action_time = now
            return f"out({fill_ratio:.2f})"
        return None

    def zoom_in(self) -> None:
        self._zoom_step("in")

    def zoom_out(self) -> None:
        self._zoom_step("out")

    def center_gimbal(self) -> None:
        if self.cam is None:
            self.status_text = "Gimbal control is not connected."
            return
        self.cam.requestCenterGimbal()
        with self.zoom_lock:
            self.cam.requestZoomHold()
            self.cam.requestAbsoluteZoom(1.0)
        self.last_zoom_action_time = time.time()
        self.current_yaw = 0.0
        self.current_pitch = 0.0
        self.target_center = None
        with self.target_lock:
            self.last_target = None
        self.status_text = "Center command sent. Zoom reset to wide."

    def toggle_tracking(self) -> None:
        if self.selected_track_id is None:
            self.status_text = "Select a detection first, then tracking can start."
            self.tracking_enabled = False
            return
        self.tracking_enabled = not self.tracking_enabled
        if self.tracking_enabled:
            self.status_text = f"Tracking enabled for ID {self.selected_track_id}."
        else:
            self.stop_motion()
            self.status_text = "Tracking stopped."

    def resize_for_detection(self, frame):
        height, width = frame.shape[:2]
        if width <= DETECTION_WIDTH:
            return frame
        scale = DETECTION_WIDTH / float(width)
        return cv2.resize(frame, (DETECTION_WIDTH, int(height * scale)))

    def class_name(self, cls_id: int, names) -> str:
        if isinstance(names, dict):
            return str(names.get(cls_id, cls_id))
        if isinstance(names, (list, tuple)) and 0 <= cls_id < len(names):
            return str(names[cls_id])
        return str(cls_id)

    def _assign_track_ids(self, candidates: list[dict]) -> list[dict]:
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

    def detect_objects(self, frame) -> list[dict]:
        model = self.model
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
            device=0 if self.use_cuda else "cpu",
            half=self.use_cuda,
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

    def select_track_target(self, track_id: int) -> None:
        chosen = None
        for item in self.active_detections:
            if int(item.get("track_id", -1)) == int(track_id):
                chosen = dict(item)
                break

        if chosen is None:
            raise RuntimeError(f"Track ID {track_id} is not currently visible.")

        self.selected_track_id = int(track_id)
        self.selected_track_class = str(chosen.get("class_name", "")).strip() or None
        self.target_center = (float(chosen["cx"]), float(chosen["cy"]))
        with self.target_lock:
            self.last_target = chosen
            self.last_detection_time = time.time()
        self.tracking_enabled = True
        self.result_text = (
            f'Selected ID {self.selected_track_id} ({chosen["class_name"]}) from model "{self.selected_model_name}".'
        )
        self.status_text = f"Tracking started for ID {self.selected_track_id}."

    def _reacquire_selected_target(self, detections: list[dict]) -> Optional[dict]:
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

    def set_camera_speed_scale(self, speed_scale: float) -> None:
        value = float(speed_scale)
        if value < CAMERA_SPEED_MIN or value > CAMERA_SPEED_MAX:
            raise ValueError(
                f"speed_scale must be between {CAMERA_SPEED_MIN:.1f} and {CAMERA_SPEED_MAX:.1f}"
            )
        self.camera_speed_scale = value
        self.status_text = f"Camera speed scale set to {self.camera_speed_scale:.2f}x."

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

    def inference_loop(self) -> None:
        while not self.stop_event.is_set():
            try:
                if self.stream is None or self.model is None:
                    time.sleep(INFERENCE_IDLE_MS)
                    continue

                frame = self.stream.getFrame()
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

                with self.target_lock:
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

    def render_loop(self) -> None:
        while not self.stop_event.is_set():
            frame = self.stream.getFrame() if self.stream is not None else None
            if frame is not None:
                with self.frame_lock:
                    self.latest_frame = frame.copy()
                    self.frame_shape = {"width": int(frame.shape[1]), "height": int(frame.shape[0])}
                display_frame = self.draw_overlay(frame)
                ok, encoded = cv2.imencode(".jpg", display_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                if ok:
                    with self.frame_lock:
                        self.latest_jpeg = encoded.tobytes()
            time.sleep(DISPLAY_INTERVAL_MS / 1000.0)

    def track_loop(self) -> None:
        while not self.stop_event.is_set():
            frame = self.stream.getFrame() if self.stream is not None else None
            target = None

            with self.target_lock:
                if self.last_target is not None:
                    target = dict(self.last_target)
                detection_age = time.time() - self.last_detection_time if self.last_detection_time else None

            if self.tracking_enabled and self.cam is not None and frame is not None:
                if target is None or (detection_age is not None and detection_age > 0.5):
                    self.stop_motion()
                else:
                    center_x = target["cx"]
                    center_y = target["cy"]
                    frame_center_x = frame.shape[1] / 2.0
                    frame_center_y = frame.shape[0] / 2.0

                    x_error_px = center_x - frame_center_x
                    y_error_px = center_y - frame_center_y
                    zoom_action = self._maybe_auto_zoom(target, frame, x_error_px, y_error_px)
                    if abs(x_error_px) <= CENTER_TOLERANCE_PX and abs(y_error_px) <= CENTER_TOLERANCE_PX:
                        self.stop_motion()
                        if zoom_action is not None:
                            self.status_text = (
                                f"Tracking ID {self.selected_track_id}. Target centered. auto_zoom={zoom_action}"
                            )
                        else:
                            self.status_text = f"Tracking ID {self.selected_track_id}. Target centered."
                        time.sleep(TRACK_INTERVAL_MS / 1000.0)
                        continue

                    x_error = x_error_px / frame.shape[1]
                    y_error = y_error_px / frame.shape[0]

                    yaw_speed = self.compute_speed(x_error, 0.0, YAW_GAIN, MAX_YAW_SPEED, min_speed=1) * YAW_SIGN
                    pitch_speed = self.compute_speed(y_error, 0.0, PITCH_GAIN, MAX_PITCH_SPEED, min_speed=1) * PITCH_SIGN
                    yaw_speed = int(yaw_speed * self.camera_speed_scale)
                    pitch_speed = int(pitch_speed * self.camera_speed_scale)

                    self.cam.requestGimbalSpeed(yaw_speed, pitch_speed)
                    status = (
                        f"Tracking ID {self.selected_track_id}. "
                        f"yaw_speed={yaw_speed}, pitch_speed={pitch_speed}, scale={self.camera_speed_scale:.2f}x"
                    )
                    if zoom_action is not None:
                        status += f", auto_zoom={zoom_action}"
                    self.status_text = status

            time.sleep(TRACK_INTERVAL_MS / 1000.0)

    def attitude_loop(self) -> None:
        while not self.stop_event.is_set():
            if self.cam is not None:
                try:
                    self.cam.requestGimbalAttitude()
                    yaw, pitch, _ = self.cam.getAttitude()
                    self.current_yaw = yaw
                    self.current_pitch = pitch
                except Exception:
                    pass
            time.sleep(ATTITUDE_INTERVAL_MS / 1000.0)

    def status_payload(self) -> dict:
        target = None
        with self.target_lock:
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
            "selected_model": self.selected_model_name,
            "selected_model_path": self.selected_model_path,
            "selected_model_classes": list(self.selected_model_classes),
            "enabled_classes": sorted(self.enabled_classes),
            "selected_track_id": self.selected_track_id,
            "camera_speed_scale": round(float(self.camera_speed_scale), 2),
            "yaw": round(self.current_yaw, 1),
            "pitch": round(self.current_pitch, 1),
            "frame": self.frame_shape,
            "target": target,
            "detections": detections,
            "models": self.get_model_buttons(),
        }

    def latest_mjpeg_frame(self) -> Optional[bytes]:
        with self.frame_lock:
            return self.latest_jpeg

    def shutdown(self) -> None:
        self.tracking_enabled = False
        self.stop_event.set()

        try:
            self.stop_motion()
        except Exception:
            pass
        try:
            if self.cam is not None:
                self.cam.requestZoomHold()
        except Exception:
            pass

        try:
            if self.stream is not None:
                self.stream.close()
        except Exception:
            pass

        try:
            if self.cam is not None:
                self.cam.disconnect()
        except Exception:
            pass


class IconModelTrackerRequestHandler(BaseHTTPRequestHandler):
    server_version = "IconModelTrackerHTTP/1.0"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self._serve_html()
            return
        if parsed.path == "/api/status":
            self._serve_json(self.server.app.status_payload())
            return
        if parsed.path == "/stream.mjpg":
            self._serve_mjpeg()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        payload = self._read_json_body()
        try:
            if parsed.path == "/api/select-model":
                self.server.app.select_model(str(payload.get("model_path", "")))
                self._serve_json({"ok": True, "status": self.server.app.status_payload()})
                return
            if parsed.path == "/api/select-target":
                self.server.app.select_track_target(int(payload["track_id"]))
                self._serve_json({"ok": True, "status": self.server.app.status_payload()})
                return
            if parsed.path == "/api/toggle-class":
                self.server.app.toggle_class_filter(str(payload.get("class_name", "")))
                self._serve_json({"ok": True, "status": self.server.app.status_payload()})
                return
            if parsed.path == "/api/toggle-tracking":
                self.server.app.toggle_tracking()
                self._serve_json({"ok": True, "status": self.server.app.status_payload()})
                return
            if parsed.path == "/api/center":
                self.server.app.center_gimbal()
                self._serve_json({"ok": True, "status": self.server.app.status_payload()})
                return
            if parsed.path == "/api/move":
                self.server.app.rotate_camera(int(payload.get("yaw", 0)), int(payload.get("pitch", 0)))
                self._serve_json({"ok": True, "status": self.server.app.status_payload()})
                return
            if parsed.path == "/api/stop-motion":
                self.server.app.stop_motion()
                self._serve_json({"ok": True, "status": self.server.app.status_payload()})
                return
            if parsed.path == "/api/stop-tracking":
                self.server.app.stop_tracking()
                self._serve_json({"ok": True, "status": self.server.app.status_payload()})
                return
            if parsed.path == "/api/zoom":
                direction = str(payload.get("direction", "")).lower()
                if direction == "in":
                    self.server.app.zoom_in()
                elif direction == "out":
                    self.server.app.zoom_out()
                else:
                    raise ValueError('direction must be "in" or "out"')
                self._serve_json({"ok": True, "status": self.server.app.status_payload()})
                return
            if parsed.path == "/api/set-camera-speed":
                self.server.app.set_camera_speed_scale(float(payload.get("speed_scale", CAMERA_SPEED_DEFAULT)))
                self._serve_json({"ok": True, "status": self.server.app.status_payload()})
                return
        except Exception as exc:
            self._serve_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def _serve_html(self) -> None:
        with open(HTML_PAGE_PATH, "rb") as handle:
            body = handle.read()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_mjpeg(self) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Pragma", "no-cache")
        self.send_header("Connection", "close")
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.end_headers()

        try:
            while not self.server.app.stop_event.is_set():
                frame = self.server.app.latest_mjpeg_frame()
                if frame is None:
                    time.sleep(0.05)
                    continue

                self.wfile.write(MJPEG_BOUNDARY + b"\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(frame)}\r\n\r\n".encode("ascii"))
                self.wfile.write(frame)
                self.wfile.write(b"\r\n")
                self.wfile.flush()
                time.sleep(DISPLAY_INTERVAL_MS / 1000.0)
        except (BrokenPipeError, ConnectionResetError):
            return

    def _read_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def log_message(self, format: str, *args) -> None:
        return


class IconModelTrackerHTTPServer(ThreadingHTTPServer):
    def __init__(self, server_address, app: IconModelTrackerService):
        super().__init__(server_address, IconModelTrackerRequestHandler)
        self.app = app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Icon-first model tracker with click-to-track by unique detection ID.")
    parser.add_argument("--camera-ip", default=CAMERA_IP, help="SIYI camera control IP address.")
    parser.add_argument("--camera-port", type=int, default=CAMERA_PORT, help="SIYI camera UDP control port.")
    parser.add_argument("--camera-name", default=CAMERA_NAME, help="Camera name used in logs/UI.")
    parser.add_argument("--rtsp-url", default=None, help="RTSP stream URL. Defaults to rtsp://<camera-ip>:8554/main.264.")
    parser.add_argument("--refresh-index", action="store_true", help="Rebuild the models index before serving UI.")
    parser.add_argument("--host", default="127.0.0.1", help="HTTP host to bind.")
    parser.add_argument("--port", type=int, default=8090, help="HTTP port to bind.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rtsp_url = args.rtsp_url or f"rtsp://{args.camera_ip}:8554/main.264"
    ensure_models_dir()
    refresh_index = args.refresh_index or model_index_needs_refresh()
    models = load_model_index(refresh=refresh_index)
    if refresh_index:
        print(f"[Model Index] Indexed {len(models)} model(s).", flush=True)
    else:
        print(f"[Model Index] No new model found. Using existing index for {len(models)} model(s).", flush=True)

    app = IconModelTrackerService(
        rtsp_url=rtsp_url,
        refresh_index=False,
        camera_ip=args.camera_ip,
        camera_port=args.camera_port,
        camera_name=args.camera_name,
    )
    server = IconModelTrackerHTTPServer((args.host, args.port), app)
    print("[Mode] Icon-driven model selection + click-to-track by ID.", flush=True)
    print(f"[Camera] Control {args.camera_ip}:{args.camera_port} | RTSP {rtsp_url}", flush=True)
    print(f"[Web UI] Open http://{args.host}:{args.port}", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        app.shutdown()


if __name__ == "__main__":
    main()
