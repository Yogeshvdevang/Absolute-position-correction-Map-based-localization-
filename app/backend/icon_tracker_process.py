import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx


class ManagedIconTrackerProcess:
  def __init__(
    self,
    tracker_root: Path,
    base_url: str,
    camera_ip: str,
    camera_port: int,
    rtsp_url: str,
    camera_name: str,
    enabled: bool = True,
  ) -> None:
    self.tracker_root = Path(tracker_root)
    self.base_url = base_url.rstrip("/")
    self.camera_ip = camera_ip
    self.camera_port = int(camera_port)
    self.rtsp_url = rtsp_url
    self.camera_name = camera_name
    self.enabled = enabled

    self._proc: Optional[subprocess.Popen] = None
    self._lock = threading.Lock()
    self._last_start_attempt_ts = 0.0

    parsed = urlparse(self.base_url)
    self._host = parsed.hostname or "127.0.0.1"
    self._port = int(parsed.port or (443 if parsed.scheme == "https" else 80))

  def _script_path(self) -> Path:
    return (self.tracker_root / "icon_model_tracker.py").resolve()

  def _can_manage_local(self) -> bool:
    return self._host in {"127.0.0.1", "localhost", "0.0.0.0"}

  def _health(self, timeout_seconds: float = 0.8) -> bool:
    try:
      with httpx.Client(timeout=timeout_seconds) as client:
        response = client.get(f"{self.base_url}/api/status")
      return response.status_code < 500
    except Exception:
      return False

  def _spawn(self) -> bool:
    script = self._script_path()
    if not script.exists():
      return False

    command = [
      sys.executable,
      str(script),
      "--host",
      self._host,
      "--port",
      str(self._port),
      "--camera-ip",
      self.camera_ip,
      "--camera-port",
      str(self.camera_port),
      "--camera-name",
      self.camera_name,
      "--rtsp-url",
      self.rtsp_url,
    ]

    creation_flags = 0
    if hasattr(subprocess, "CREATE_NO_WINDOW"):
      creation_flags = getattr(subprocess, "CREATE_NO_WINDOW")

    self._proc = subprocess.Popen(
      command,
      cwd=str(self.tracker_root.resolve()),
      stdout=subprocess.DEVNULL,
      stderr=subprocess.DEVNULL,
      creationflags=creation_flags,
    )
    return True

  def ensure_running(self, wait_seconds: float = 3.5) -> bool:
    if not self.enabled:
      return self._health(timeout_seconds=0.5)
    if self._health(timeout_seconds=0.5):
      return True
    if not self._can_manage_local():
      return False

    with self._lock:
      if self._health(timeout_seconds=0.5):
        return True
      now = time.time()
      if now - self._last_start_attempt_ts < 1.0:
        return False
      self._last_start_attempt_ts = now
      if self._proc is not None and self._proc.poll() is None:
        return False
      self._spawn()

    deadline = time.time() + max(0.2, wait_seconds)
    while time.time() < deadline:
      if self._health(timeout_seconds=0.7):
        return True
      time.sleep(0.25)
    return False

  def shutdown(self) -> None:
    with self._lock:
      if self._proc is None:
        return
      if self._proc.poll() is not None:
        self._proc = None
        return
      try:
        self._proc.terminate()
        self._proc.wait(timeout=2.0)
      except Exception:
        try:
          self._proc.kill()
        except Exception:
          pass
      finally:
        self._proc = None
