import argparse
import sys
import time

try:
    from pymavlink import mavutil
except ModuleNotFoundError:
    mavutil = None


MESSAGE_CHOICES = ("GLOBAL_POSITION_INT", "ALTITUDE", "VFR_HUD")
FIELD_CHOICES = (
    "relative",
    "amsl",
    "local",
    "monotonic",
    "terrain",
    "bottom_clearance",
    "vfr",
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Read altitude already estimated by Pixhawk from MAVLink."
    )
    parser.add_argument("--port", default="/dev/ttyACM0", help="Serial port to Pixhawk")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baudrate")
    parser.add_argument("--rate", type=float, default=5.0, help="Requested/printed rate in Hz")
    parser.add_argument(
        "--message",
        default="GLOBAL_POSITION_INT",
        choices=MESSAGE_CHOICES,
        help="MAVLink message to use as the altitude source",
    )
    parser.add_argument(
        "--field",
        default="relative",
        choices=FIELD_CHOICES,
        help="Altitude field to print in meters",
    )
    parser.add_argument(
        "--wait-heartbeat",
        action="store_true",
        help="Require an autopilot heartbeat before listening",
    )
    parser.add_argument(
        "--heartbeat-timeout",
        type=float,
        default=15.0,
        help="Heartbeat wait timeout in seconds",
    )
    return parser.parse_args()


def request_message_interval(conn, message_name, rate_hz):
    if rate_hz <= 0:
        return
    msg_id = getattr(mavutil.mavlink, f"MAVLINK_MSG_ID_{message_name}", None)
    if msg_id is None:
        return
    interval_us = int(1_000_000 / rate_hz)
    conn.mav.command_long_send(
        conn.target_system,
        conn.target_component,
        mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
        0,
        msg_id,
        interval_us,
        0,
        0,
        0,
        0,
        0,
    )


def maybe_wait_heartbeat(conn, timeout_s, required):
    try:
        conn.wait_heartbeat(timeout=timeout_s)
        print("Heartbeat received.", flush=True)
        return True
    except Exception:
        if required:
            raise RuntimeError(
                f"Timed out waiting for heartbeat after {timeout_s:.1f}s"
            ) from None
        print(
            f"No heartbeat seen within {timeout_s:.1f}s; listening anyway.",
            flush=True,
        )
        return False


def extract_altitude_m(msg, field_name):
    msg_type = msg.get_type()

    if msg_type == "GLOBAL_POSITION_INT":
        field_map = {
            "relative": ("relative_alt", 1000.0),
            "amsl": ("alt", 1000.0),
        }
    elif msg_type == "ALTITUDE":
        field_map = {
            "monotonic": ("altitude_monotonic", 1.0),
            "amsl": ("altitude_amsl", 1.0),
            "local": ("altitude_local", 1.0),
            "relative": ("altitude_relative", 1.0),
            "terrain": ("altitude_terrain", 1.0),
            "bottom_clearance": ("bottom_clearance", 1.0),
        }
    elif msg_type == "VFR_HUD":
        field_map = {
            "vfr": ("alt", 1.0),
        }
    else:
        return None

    target = field_map.get(field_name)
    if target is None:
        return None

    attr_name, scale = target
    value = getattr(msg, attr_name, None)
    if value is None:
        return None
    return value / scale


def format_output(msg, field_name, altitude_m):
    msg_type = msg.get_type()
    label = "altitude_m"
    if msg_type == "GLOBAL_POSITION_INT":
        label = "relative_alt_m" if field_name == "relative" else "amsl_alt_m"
    elif msg_type == "ALTITUDE":
        label = f"{field_name}_alt_m"
    elif msg_type == "VFR_HUD":
        label = "vfr_alt_m"
    return f"{label}={altitude_m:.2f} source={msg_type}"


def read_altitude(args):
    if mavutil is None:
        raise RuntimeError(
            "Missing dependency 'pymavlink'. Install it with: python3 -m pip install -r requirements.txt"
        )

    valid_fields_by_message = {
        "GLOBAL_POSITION_INT": {"relative", "amsl"},
        "ALTITUDE": {"relative", "amsl", "local", "monotonic", "terrain", "bottom_clearance"},
        "VFR_HUD": {"vfr"},
    }
    if args.field not in valid_fields_by_message[args.message]:
        allowed = ", ".join(sorted(valid_fields_by_message[args.message]))
        raise RuntimeError(
            f"Field '{args.field}' is not valid for {args.message}. Use one of: {allowed}"
        )

    mavutil.mavlink.MAVLINK20 = 1
    conn = mavutil.mavlink_connection(args.port, baud=args.baud, source_system=245)

    if args.wait_heartbeat:
        print("Waiting for autopilot heartbeat...", flush=True)
    if maybe_wait_heartbeat(conn, args.heartbeat_timeout, args.wait_heartbeat):
        request_message_interval(conn, args.message, args.rate)

    print(
        f"Listening for {args.message} ({args.field}) on {args.port} @ {args.baud}...",
        flush=True,
    )
    min_print_interval = 1.0 / max(args.rate, 0.1)
    last_print = 0.0
    last_status = time.time()

    while True:
        msg = conn.recv_match(type=args.message, blocking=True, timeout=1.0)
        if msg is None:
            now = time.time()
            if now - last_status >= 5.0:
                print(f"No {args.message} message received yet...", flush=True)
                last_status = now
            continue

        altitude_m = extract_altitude_m(msg, args.field)
        if altitude_m is None:
            continue

        now = time.time()
        if now - last_print >= min_print_interval:
            print(format_output(msg, args.field, altitude_m), flush=True)
            last_print = now


def main():
    args = parse_args()
    try:
        read_altitude(args)
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
