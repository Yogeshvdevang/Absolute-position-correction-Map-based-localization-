#!/usr/bin/env python3
"""Save raw GPS serial bytes directly to a .txt file."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import serial

ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from navisar.sensors.gps_serial import find_gps_port_and_baud

DEFAULT_PORT = "/dev/ttyAMA5"
DEFAULT_BAUD = 230400
DEFAULT_CHUNK_SIZE = 4096
DEFAULT_IDLE_SLEEP_S = 0.01
DEFAULT_PROBE_SECONDS = 3.0
DEFAULT_OUTPUT_DIR = ROOT_DIR / "data" / "raw_gps_logs"


def _lock_serial(port: str | None, baud: str | int | None, probe_seconds: float) -> tuple[str, int]:
    port_is_auto = port is None or str(port).lower() == "auto"
    baud_is_auto = baud is None or str(baud).lower() == "auto"
    if not port_is_auto and not baud_is_auto:
        return str(port), int(baud)
    choice = find_gps_port_and_baud(
        port=None if port_is_auto else str(port),
        bauds=None if baud_is_auto else [int(baud)],
        probe_seconds=probe_seconds,
        verbose=True,
    )
    if not choice:
        raise RuntimeError("No GPS data detected while probing serial ports.")
    return choice


def _build_output_path(output: str | None) -> Path:
    if output:
        return Path(output).expanduser().resolve()
    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    path = DEFAULT_OUTPUT_DIR / f"gps_raw_{stamp}.txt"
    index = 1
    while path.exists():
        index += 1
        path = DEFAULT_OUTPUT_DIR / f"gps_raw_{stamp}_{index}.txt"
    return path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Read raw GPS serial data and save the exact incoming bytes to a .txt file."
    )
    parser.add_argument("--port", default=DEFAULT_PORT, help="GPS serial port, or 'auto'.")
    parser.add_argument("--baud", default=DEFAULT_BAUD, help="Baud rate, or 'auto'.")
    parser.add_argument(
        "--output",
        help="Output .txt file path. If omitted, a timestamped file is created in data/raw_gps_logs/.",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=DEFAULT_CHUNK_SIZE,
        help="Maximum bytes to read per loop iteration.",
    )
    parser.add_argument(
        "--idle-sleep",
        type=float,
        default=DEFAULT_IDLE_SLEEP_S,
        help="Sleep duration when no data is available.",
    )
    parser.add_argument(
        "--probe-seconds",
        type=float,
        default=DEFAULT_PROBE_SECONDS,
        help="Probe duration used when port or baud is set to 'auto'.",
    )
    args = parser.parse_args()

    try:
        port, baud = _lock_serial(args.port, args.baud, args.probe_seconds)
        output_path = _build_output_path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        print(f"Setup failed: {exc}", file=sys.stderr)
        return 1

    total_bytes = 0
    print(f"Reading raw GPS data from {port} @ {baud}")
    print(f"Saving exact bytes to {output_path}")
    print("Press Ctrl+C to stop.")

    try:
        with serial.Serial(port, baud, timeout=0) as ser, output_path.open("wb") as out_file:
            while True:
                available = max(1, min(int(getattr(ser, "in_waiting", 0)), int(args.chunk_size)))
                raw = ser.read(available)
                if raw:
                    out_file.write(raw)
                    out_file.flush()
                    total_bytes += len(raw)
                    continue
                time.sleep(max(0.0, float(args.idle_sleep)))
    except KeyboardInterrupt:
        print(f"\nStopped. Saved {total_bytes} bytes to {output_path}")
        return 0
    except Exception as exc:
        print(f"\nLogging failed: {exc}", file=sys.stderr)
        print(f"Partial file: {output_path}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
