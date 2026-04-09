#!/usr/bin/env python3
import argparse
import sys
import time

from pymavlink import mavutil


def parse_args():
    parser = argparse.ArgumentParser(
        description="Configure optical-flow + rangefinder + EKF params over MAVLink."
    )
    parser.add_argument("--port", default="/dev/ttyACM0", help="MAVLink serial port")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baud rate")
    parser.add_argument(
        "--serial-index",
        type=int,
        default=2,
        help="Serial index used for SERIALn_PROTOCOL (default: 2)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=12.0,
        help="Timeout in seconds for heartbeat/param ack",
    )
    parser.add_argument(
        "--reboot-wait",
        type=float,
        default=18.0,
        help="Seconds to wait before reconnect after reboot command",
    )
    parser.add_argument(
        "--skip-reboot",
        action="store_true",
        help="Skip reboot between phase-1 and phase-2/3 config",
    )
    return parser.parse_args()


def _param_id_text(raw):
    if isinstance(raw, (bytes, bytearray)):
        return raw.decode("utf-8", errors="ignore").rstrip("\x00")
    return str(raw).rstrip("\x00")


def connect(port, baud, timeout_s):
    conn = mavutil.mavlink_connection(port, baud=baud)
    print(f"Connecting on {port} @ {baud} ...")
    hb = conn.wait_heartbeat(timeout=timeout_s)
    if hb is None:
        raise RuntimeError("heartbeat timeout")
    print(
        f"Connected: sysid={conn.target_system} compid={conn.target_component}"
    )
    return conn


def wait_param_value(conn, name, timeout_s):
    deadline = time.time() + float(timeout_s)
    while time.time() < deadline:
        msg = conn.recv_match(type="PARAM_VALUE", blocking=True, timeout=1.0)
        if msg is None:
            continue
        if _param_id_text(msg.param_id) == name:
            return msg
    return None


def set_param(conn, name, value, timeout_s):
    param_id = name.encode("utf-8")
    conn.mav.param_set_send(
        conn.target_system,
        conn.target_component,
        param_id,
        float(value),
        mavutil.mavlink.MAV_PARAM_TYPE_REAL32,
    )
    ack = wait_param_value(conn, name, timeout_s)
    if ack is None:
        conn.mav.param_request_read_send(
            conn.target_system,
            conn.target_component,
            param_id,
            -1,
        )
        ack = wait_param_value(conn, name, timeout_s)
    if ack is None:
        raise RuntimeError(f"no ack for {name}")
    actual = float(ack.param_value)
    if abs(actual - float(value)) > 1e-5:
        raise RuntimeError(f"{name} mismatch (wanted {value}, got {actual})")
    print(f"OK  {name} = {actual}")


def set_block(conn, block_name, params, timeout_s):
    print(f"\nApplying {block_name} ...")
    for name, value in params:
        set_param(conn, name, value, timeout_s)


def reboot_fc(conn):
    print("\nSending flight-controller reboot command ...")
    conn.mav.command_long_send(
        conn.target_system,
        conn.target_component,
        mavutil.mavlink.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN,
        0,
        1,  # reboot autopilot
        0,
        0,
        0,
        0,
        0,
        0,
    )


def main():
    args = parse_args()
    serial_proto_name = f"SERIAL{args.serial_index}_PROTOCOL"

    phase1 = [
        ("SERIAL2_BAUD", 115),
        ("SERIAL2_OPTIONS", 1024),
        (serial_proto_name, 1),
        ("FLOW_TYPE", 5),
        ("RNGFND1_TYPE", 10),
    ]
    phase2 = [
        ("RNGFND1_MAX_CM", 800),
        ("RNGFND1_MIN_CM", 1),
        ("RNGFND1_ORIENT", 25),
    ]
    phase3 = [
        ("AHRS_EKF_TYPE", 3),
        ("EK3_SRC_OPTIONS", 0),
        ("EK3_SRC1_POSXY", 0),
        ("EK3_SRC1_POSZ", 2),
        ("EK3_SRC1_VELXY", 5),
        ("EK3_SRC1_VELZ", 0),
        ("EK3_SRC1_YAW", 1),
    ]

    conn = None
    try:
        conn = connect(args.port, args.baud, args.timeout)
        set_block(conn, "Phase-1 (serial/flow/rangefinder type)", phase1, args.timeout)

        if not args.skip_reboot:
            reboot_fc(conn)
            try:
                conn.close()
            except Exception:
                pass
            conn = None
            print(f"Waiting {args.reboot_wait:.1f}s for reboot ...")
            time.sleep(args.reboot_wait)
            conn = connect(args.port, args.baud, args.timeout)
        else:
            print("\nSkipping reboot as requested (--skip-reboot).")

        set_block(conn, "Phase-2 (rangefinder geometry)", phase2, args.timeout)
        set_block(conn, "Phase-3 (EKF source config)", phase3, args.timeout)

        print("\nDone. In Mission Planner Status page, check:")
        print("  - opt_qua")
        print("  - rangefinder1")
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
