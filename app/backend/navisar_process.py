import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx


class ManagedNavisarProcess:
  def __init__(self, navisar_root: Path, base_url: str, enabled: bool = True) -> None:
    self.navisar_root = Path(navisar_root)
    self.base_url = base_url.rstrip("/")
    self.enabled = enabled

    self._proc: Optional[subprocess.Popen] = None
    self._lock = threading.Lock()
    self._last_start_attempt_ts = 0.0

    parsed = urlparse(self.base_url)
    self._host = parsed.hostname or "127.0.0.1"
    self._port = int(parsed.port or (443 if parsed.scheme == "https" else 80))

  def _can_manage_local(self) -> bool:
    return self._host in {"127.0.0.1", "localhost", "0.0.0.0"}

  def _health(self, timeout_seconds: float = 0.8) -> bool:
    try:
      with httpx.Client(timeout=timeout_seconds) as client:
        response = client.get(f"{self.base_url}/data")
      return response.status_code < 500
    except Exception:
      return False

  def _python_bin(self) -> str:
    candidate = self.navisar_root / "venv" / "bin" / "python"
    if candidate.exists():
      return str(candidate)
    return sys.executable or "python3"

  def _spawn(self) -> bool:
    if not self.navisar_root.exists():
      return False

    env = os.environ.copy()
    env.setdefault("NAVISAR_DASHBOARD_OPEN", "0")
    env.setdefault("NAVISAR_DASHBOARD_HOST", "127.0.0.1")
    env.setdefault("NAVISAR_DASHBOARD_PORT", str(self._port))
    existing_pythonpath = env.get("PYTHONPATH", "").strip()
    navisar_src = str((self.navisar_root / "src").resolve())
    env["PYTHONPATH"] = navisar_src if not existing_pythonpath else f"{navisar_src}{os.pathsep}{existing_pythonpath}"

    command = [self._python_bin(), "-m", "navisar.main"]

    creation_flags = 0
    if hasattr(subprocess, "CREATE_NO_WINDOW"):
      creation_flags = getattr(subprocess, "CREATE_NO_WINDOW")

    log_path = self.navisar_root / "navisar-integration.log"
    log_handle = log_path.open("a", encoding="utf-8")
    self._proc = subprocess.Popen(
      command,
      cwd=str(self.navisar_root.resolve()),
      stdout=log_handle,
      stderr=log_handle,
      env=env,
      creationflags=creation_flags,
    )
    log_handle.close()
    return True

  def ensure_running(self, wait_seconds: float = 4.0) -> bool:
    if self._health(timeout_seconds=0.6):
      return True
    if not self.enabled:
      return False
    if not self._can_manage_local():
      return False

    with self._lock:
      if self._health(timeout_seconds=0.6):
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
      if self._health(timeout_seconds=0.6):
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
