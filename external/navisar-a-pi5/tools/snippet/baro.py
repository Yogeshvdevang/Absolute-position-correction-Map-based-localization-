import argparse
import sys
import time

try:
    from pymavlink import mavutil
except ModuleNotFoundError:
    mavutil = None


def parse_args():
    parser = argparse.ArgumentParser(description="Read Pixhawk barometer data via MAVLink.")
    parser.add_argument("--port", default="/dev/ttyACM0", help="Serial port to Pixhawk")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baudrate")
    parser.add_argument("--rate", type=float, default=5.0, help="Print rate in Hz")
    parser.add_argument(
        "--message",
        default="SCALED_PRESSURE",
        choices=["SCALED_PRESSURE", "SCALED_PRESSURE2", "SCALED_PRESSURE3", "HIGHRES_IMU"],
        help="MAVLink message to use for barometer data",
    )
    parser.add_argument(
        "--output",
        default="raw",
        choices=["raw", "alt", "gps_input"],
        help="Output format: raw=pressure/temp, alt=altitude only, gps_input=GPS_INPUT-style alt field",
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


def pressure_to_alt_m(pressure_hpa, temp_c):
    if pressure_hpa <= 0:
        return None
    t_k = temp_c + 273.15
    return (t_k / 0.0065) * (1.0 - (pressure_hpa / 1013.25) ** (1.0 / 5.255))


def request_message_interval(conn, message_name, rate_hz):
    if rate_hz <= 0:
        return
    msg_id_name = f"MAVLINK_MSG_ID_{message_name}"
    msg_id = getattr(mavutil.mavlink, msg_id_name, None)
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


def extract_baro_sample(msg):
    msg_type = msg.get_type()
    if msg_type.startswith("SCALED_PRESSURE"):
        pressure_hpa = getattr(msg, "press_abs", None)
        temperature_raw = getattr(msg, "temperature", None)
        temp_c = None if temperature_raw is None else (temperature_raw / 100.0)
    elif msg_type == "HIGHRES_IMU":
        pressure_hpa = getattr(msg, "abs_pressure", None)
        temp_c = getattr(msg, "temperature", None)
    else:
        return None, None

    if pressure_hpa is None:
        return None, None
    return pressure_hpa, temp_c


def read_baro(args):
    if mavutil is None:
        raise RuntimeError(
            "Missing dependency 'pymavlink'. Install it with: python3 -m pip install -r requirements.txt"
        )

    mavutil.mavlink.MAVLINK20 = 1
    conn = mavutil.mavlink_connection(args.port, baud=args.baud, source_system=245)

    if args.wait_heartbeat:
        print("Waiting for autopilot heartbeat...", flush=True)
    if maybe_wait_heartbeat(conn, args.heartbeat_timeout, args.wait_heartbeat):
        request_message_interval(conn, args.message, args.rate)

    msg_type = args.message
    print(f"Listening for {msg_type} on {args.port} @ {args.baud}...", flush=True)
    last_status = time.time()
    last_print = 0.0
    min_print_interval = 1.0 / max(args.rate, 0.1)
    while True:
        msg = conn.recv_match(type=msg_type, blocking=True, timeout=1.0)
        if msg is None:
            now = time.time()
            if now - last_status >= 5.0:
                print(f"No {msg_type} message received yet...", flush=True)
                last_status = now
            continue

        pressure_hpa, temp_c = extract_baro_sample(msg)
        if pressure_hpa is None:
            continue

        alt_m = None
        if temp_c is not None:
            alt_m = pressure_to_alt_m(pressure_hpa, temp_c)

        if args.output == "raw":
            out = f"pressure_hpa={pressure_hpa:.2f}"
            out += " temp_c=nan" if temp_c is None else f" temp_c={temp_c:.2f}"
            if alt_m is not None:
                out += f" alt_m={alt_m:.2f}"
            else:
                out += " alt_m=nan"
        elif args.output == "alt":
            out = "alt_m=nan" if alt_m is None else f"alt_m={alt_m:.2f}"
        else:
            out = "alt=nan" if alt_m is None else f"alt={alt_m:.2f}"
        now = time.time()
        if now - last_print >= min_print_interval:
            print(out, flush=True)
            last_print = now


def main():
    args = parse_args()
    try:
        read_baro(args)
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
