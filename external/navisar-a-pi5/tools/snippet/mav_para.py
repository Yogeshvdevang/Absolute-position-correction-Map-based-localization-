#!/usr/bin/env python3
import argparse
import sys
import time

from pymavlink import mavutil


def parse_args():
    parser = argparse.ArgumentParser(
        description="Set an ArduPilot/PX4 parameter over MAVLink."
    )
    parser.add_argument("--port", default="/dev/ttyACM0", help="MAVLink serial port")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baud rate")
    parser.add_argument("--param", default="FLOW_TYPE", help="Parameter name")
    parser.add_argument("--value", type=float, default=5.0, help="Parameter value")
    parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        help="Timeout (seconds) for heartbeat/ack",
    )
    parser.add_argument(
        "--wait-heartbeat",
        action="store_true",
        help="Wait for autopilot heartbeat before writing",
    )
    return parser.parse_args()


def _param_id_text(raw):
    if raw is None:
        return ""
    if isinstance(raw, (bytes, bytearray)):
        return raw.decode("utf-8", errors="ignore").rstrip("\x00")
    return str(raw).rstrip("\x00")


def _wait_param_value(conn, expected_name, timeout_s):
    deadline = time.time() + float(timeout_s)
    expected_name = str(expected_name).strip()
    while time.time() < deadline:
        msg = conn.recv_match(type="PARAM_VALUE", blocking=True, timeout=1.0)
        if msg is None:
            continue
        got_name = _param_id_text(msg.param_id)
        if got_name == expected_name:
            return msg
    return None


def main():
    args = parse_args()

    conn = mavutil.mavlink_connection(args.port, baud=args.baud)
    print(f"Connected on {args.port} @ {args.baud}")

    if args.wait_heartbeat:
        print("Waiting for heartbeat...")
        hb = conn.wait_heartbeat(timeout=args.timeout)
        if hb is None:
            print("ERROR: heartbeat timeout", file=sys.stderr)
            sys.exit(1)
        print("Heartbeat received.")

    param_name = str(args.param).strip()
    param_name_bytes = param_name.encode("utf-8")

    print(f"Setting {param_name} = {args.value}")
    conn.mav.param_set_send(
        conn.target_system,
        conn.target_component,
        param_name_bytes,
        float(args.value),
        mavutil.mavlink.MAV_PARAM_TYPE_REAL32,
    )

    msg = _wait_param_value(conn, param_name, args.timeout)
    if msg is None:
        print("ERROR: no PARAM_VALUE ack after set", file=sys.stderr)
        sys.exit(2)

    print(f"ACK: {param_name} = {msg.param_value}")

    print(f"Reading back {param_name}...")
    conn.mav.param_request_read_send(
        conn.target_system,
        conn.target_component,
        param_name_bytes,
        -1,
    )
    msg = _wait_param_value(conn, param_name, args.timeout)
    if msg is None:
        print("ERROR: readback failed", file=sys.stderr)
        sys.exit(3)

    print(f"READBACK: {param_name} = {msg.param_value}")

    if abs(float(msg.param_value) - float(args.value)) > 1e-6:
        print("ERROR: value mismatch after write", file=sys.stderr)
        sys.exit(4)

    print("Done.")


if __name__ == "__main__":
    main()
