import atexit
import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path


def _runtime_root() -> Path:
    # Use PyInstaller extraction dir when bundled, otherwise project root.
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


def _app_dirs() -> tuple[Path, Path]:
    # Store user data outside install dir for enterprise lockdowns.
    base = Path(os.getenv("APPDATA") or Path.home() / ".config") / "MissionPlanner"
    config_dir = base / "config"
    log_dir = base / "logs"
    config_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)
    return config_dir, log_dir


def _show_error(message: str) -> None:
    # GUI-safe error messaging when no console is available.
    try:
        import tkinter  # noqa: PLC0415
        from tkinter import messagebox  # noqa: PLC0415

        root = tkinter.Tk()
        root.withdraw()
        messagebox.showerror("Mission Planner", message)
        root.destroy()
    except Exception:
        # Final fallback if GUI stack is unavailable.
        print(message, file=sys.stderr)


def _port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def _wait_for_health(url: str, timeout_s: float = 20.0) -> bool:
    start = time.time()
    while time.time() - start < timeout_s:
        try:
            import urllib.request  # noqa: PLC0415

            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def _run_backend() -> None:
    # Backend mode runs in a separate process to keep lifecycle isolated.
    runtime_root = _runtime_root()
    sys.path.insert(0, str(runtime_root))

    host = os.getenv("APP_HOST", "127.0.0.1")
    port = int(os.getenv("APP_PORT", "8000"))

    import uvicorn  # noqa: PLC0415

    uvicorn.run(
        "backend.api:app",
        host=host,
        port=port,
        log_level=os.getenv("APP_LOG_LEVEL", "info"),
        access_log=False,
        reload=False,
    )


def main() -> int:
    if "--backend" in sys.argv:
        _run_backend()
        return 0

    host = os.getenv("APP_HOST", "127.0.0.1")
    port = int(os.getenv("APP_PORT", "8000"))
    health_url = f"http://{host}:{port}/health"

    if not _port_available(host, port):
        _show_error(f"Port {port} is already in use. Close the other app and try again.")
        return 1

    runtime_root = _runtime_root()
    config_dir, log_dir = _app_dirs()

    env = os.environ.copy()
    env["FRONTEND_DIR"] = str(runtime_root / "frontend" / "build")
    env["APP_CONFIG_DIR"] = str(config_dir)
    env["APP_LOG_DIR"] = str(log_dir)

    log_path = log_dir / "backend.log"
    log_file = open(log_path, "a", encoding="utf-8")

    # Spawn backend as a child process to allow clean shutdown.
    proc = subprocess.Popen(
        [sys.executable, "--backend"],
        cwd=str(runtime_root),
        env=env,
        stdout=log_file,
        stderr=log_file,
    )

    def _shutdown() -> None:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
        log_file.close()

    atexit.register(_shutdown)

    if not _wait_for_health(health_url, timeout_s=25.0):
        _shutdown()
        _show_error(f"Backend failed to start. See log: {log_path}")
        return 1

    webbrowser.open(f"http://{host}:{port}")

    try:
        while True:
            if proc.poll() is not None:
                _show_error(f"Backend exited unexpectedly. See log: {log_path}")
                return 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
