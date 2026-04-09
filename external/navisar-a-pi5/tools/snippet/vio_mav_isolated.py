#!/usr/bin/env python3
"""Isolated NAVISAR VO pipeline -> VISION_POSITION_ESTIMATE bridge.

Uses the same VO pipeline construction as the main project (`build_vo_pipeline`),
then publishes VISION_POSITION_ESTIMATE at fixed rate:
- x, y: from NAVISAR VO integrated position
- z: from Pixhawk DISTANCE_SENSOR (rangefinder / optical-flow range)
- roll, pitch, yaw: from Pixhawk ATTITUDE (inbuilt IMU estimate)
"""


from pathlib import Path
import argparse
import csv
import json
import struct
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
from pymavlink import mavutil
import serial

DEFAULT_ORIGIN_LAT = 12.5316
DEFAULT_ORIGIN_LON = 77.3835


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run NAVISAR VO, fuse it with Pixhawk IMU, and emit VPE + NMEA GPS."
    )
    parser.add_argument("--send-rate-hz", type=float, default=30.0, help="VISION_POSITION_ESTIMATE rate")
    parser.add_argument("--att-rate-hz", type=float, default=50.0, help="Requested ATTITUDE stream rate")
    parser.add_argument("--imu-rate-hz", type=float, default=50.0, help="Requested IMU stream rate")
    parser.add_argument(
        "--gps-rate-hz",
        type=float,
        default=10.0,
        help="NMEA GPS send rate to Pixhawk GPS port",
    )
    parser.add_argument(
        "--range-rate-hz",
        type=float,
        default=30.0,
        help="Requested DISTANCE_SENSOR stream rate",
    )
    parser.add_argument(
        "--z-fallback-m",
        type=float,
        default=1.0,
        help="Fallback z if no DISTANCE_SENSOR message is available",
    )
    parser.add_argument(
        "--gps-port",
        default="/dev/ttyAMA0",
        help="Pixhawk GPS serial port for outbound NMEA",
    )
    parser.add_argument(
        "--gps-baud",
        type=int,
        default=230400,
        help="Pixhawk GPS serial baud rate",
    )
    parser.add_argument(
        "--origin-lat",
        type=float,
        default=DEFAULT_ORIGIN_LAT,
        help="GPS origin latitude",
    )
    parser.add_argument(
        "--origin-lon",
        type=float,
        default=DEFAULT_ORIGIN_LON,
        help="GPS origin longitude",
    )
    parser.add_argument("--origin-alt-m", type=float, default=0.0, help="GPS origin altitude")
    parser.add_argument(
        "--origin-msg-rate-hz",
        type=float,
        default=2.0,
        help="Requested rate for autopilot position messages used to auto-seed GPS origin",
    )
    parser.add_argument(
        "--vo-velocity-weight",
        type=float,
        default=0.85,
        help="Weight for VO velocity in [0,1]; remainder comes from Pixhawk IMU",
    )
    parser.add_argument(
        "--position-correction-alpha",
        type=float,
        default=0.9,
        help="How strongly fused position is pulled back toward VO drift in [0,1]",
    )
    parser.add_argument(
        "--imu-damping",
        type=float,
        default=0.98,
        help="Damping factor for integrated IMU velocity",
    )
    parser.add_argument(
        "--vo-motion-threshold-mps",
        type=float,
        default=None,
        help="Minimum VO speed before camera is treated as moving",
    )
    parser.add_argument(
        "--imu-motion-threshold-mps",
        type=float,
        default=None,
        help="Minimum IMU speed before IMU is treated as moving",
    )
    parser.add_argument(
        "--calibrate-motion-thresholds",
        action="store_true",
        help="Collect stationary VO/IMU noise and save recommended motion thresholds",
    )
    parser.add_argument(
        "--calibration-duration-s",
        type=float,
        default=15.0,
        help="Seconds to hold the vehicle still during calibration mode",
    )
    parser.add_argument(
        "--calibration-margin",
        type=float,
        default=1.35,
        help="Multiplier applied to measured stationary noise when saving thresholds",
    )
    parser.add_argument(
        "--calibration-file",
        default=None,
        help="Optional path for saved calibration JSON",
    )
    parser.add_argument(
        "--min-sats",
        type=int,
        default=10,
        help="Synthetic satellite count used in NMEA output",
    )
    parser.add_argument("--show-window", action="store_true", help="Show VO debug window")
    parser.add_argument(
        "--web-host",
        default="0.0.0.0",
        help="Host for built-in camera web view",
    )
    parser.add_argument(
        "--web-port",
        type=int,
        default=8787,
        help="Port for built-in camera web view",
    )
    parser.add_argument(
        "--of-port",
        default="/dev/ttyAMA3",
        help="MTF-01 optical flow sensor serial port",
    )
    parser.add_argument(
        "--of-baud",
        type=int,
        default=115200,
        help="MTF-01 optical flow sensor baud rate",
    )
    return parser.parse_args()


def ensure_repo_import_path():
    repo_root = Path(__file__).resolve().parents[2]
    src_path = repo_root / "src"
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))
    return repo_root


def request_message_interval(master, msg_id, rate_hz):
    if rate_hz <= 0:
        return
    interval_us = int(1_000_000 / float(rate_hz))
    master.mav.command_long_send(
        master.target_system,
        master.target_component,
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


def send_vpe(master, usec, x, y, z, roll, pitch, yaw):
    covariance = [0.05] * 21
    try:
        # Newer pymavlink variants: include covariance + reset_counter.
        master.mav.vision_position_estimate_send(
            int(usec),
            float(x),
            float(y),
            float(z),
            float(roll),
            float(pitch),
            float(yaw),
            covariance,
            0,
        )
        return
    except TypeError:
        # Older pymavlink variants: no covariance field in this message.
        master.mav.vision_position_estimate_send(
            int(usec),
            float(x),
            float(y),
            float(z),
            float(roll),
            float(pitch),
            float(yaw),
        )


def _clamp(value, low, high):
    return max(low, min(high, value))


def _default_calibration_path():
    return Path(__file__).resolve().with_name("vio_mav_isolated.calibration.json")


def _load_saved_calibration(path):
    path = Path(path)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[CAL] failed to read calibration file {path}: {exc}")
        return None


def _save_calibration(path, payload):
    path = Path(path)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


# ============================================================================
# MTF-01 Optical Flow Sensor (Micolink protocol) - embedded from oftical_flow.py
# ============================================================================
_MICOLINK_MSG_HEAD = 0xEF
_MICOLINK_MSG_ID_RANGE_SENSOR = 0x51
_MICOLINK_MAX_PAYLOAD_LEN = 64
_MICOLINK_RANGE_PAYLOAD_LEN = struct.calcsize("<IIBBBBhhBBH")


class _MicolinkMessage:
    __slots__ = ("head", "dev_id", "sys_id", "msg_id", "seq", "len",
                 "payload", "checksum", "status", "payload_cnt")

    def __init__(self):
        self.head = self.dev_id = self.sys_id = self.msg_id = 0
        self.seq = self.len = self.checksum = self.status = self.payload_cnt = 0
        self.payload = bytearray(_MICOLINK_MAX_PAYLOAD_LEN)

    def reset(self):
        self.status = 0
        self.payload_cnt = 0


class _MicolinkParser:
    def __init__(self):
        self.msg = _MicolinkMessage()

    @staticmethod
    def _checksum(msg):
        s = msg.head + msg.dev_id + msg.sys_id + msg.msg_id + msg.seq + msg.len
        for i in range(msg.len):
            s += msg.payload[i]
        return s & 0xFF

    def parse_char(self, data):
        msg = self.msg
        if msg.status == 0:
            if data == _MICOLINK_MSG_HEAD:
                msg.head = data
                msg.status = 1
        elif msg.status == 1:
            msg.dev_id = data; msg.status = 2
        elif msg.status == 2:
            msg.sys_id = data; msg.status = 3
        elif msg.status == 3:
            msg.msg_id = data; msg.status = 4
        elif msg.status == 4:
            msg.seq = data; msg.status = 5
        elif msg.status == 5:
            msg.len = data
            if msg.len == 0:
                msg.status = 7
            elif msg.len > _MICOLINK_MAX_PAYLOAD_LEN:
                msg.reset()
            else:
                msg.status = 6
        elif msg.status == 6:
            msg.payload[msg.payload_cnt] = data
            msg.payload_cnt += 1
            if msg.payload_cnt == msg.len:
                msg.payload_cnt = 0
                msg.status = 7
        elif msg.status == 7:
            msg.checksum = data
            msg.status = 0
            if self._checksum(msg) == msg.checksum:
                return True
            msg.reset()
        else:
            msg.reset()
        return False

    def decode_range_sensor(self):
        if self.msg.msg_id != _MICOLINK_MSG_ID_RANGE_SENSOR:
            return None
        raw = bytes(self.msg.payload[: self.msg.len])
        if len(raw) != _MICOLINK_RANGE_PAYLOAD_LEN:
            return None
        d = struct.unpack("<IIBBBBhhBBH", raw)
        time_ms, distance, strength, precision, dis_status = d[0], d[1], d[2], d[3], d[4]
        flow_vel_x, flow_vel_y, flow_quality, flow_status = d[6], d[7], d[8], d[9]
        dist_valid = distance > 0 and dis_status == 1
        dist_mm = distance if dist_valid else 0
        height_m = dist_mm / 1000.0 if dist_valid else 0.0
        return {
            "time_ms": time_ms,
            "distance_mm": dist_mm,
            "distance_cm": dist_mm / 10.0 if dist_valid else 0.0,
            "height_m": height_m,
            "dis_status": dis_status,
            "strength": strength,
            "precision": precision,
            "flow_vx": flow_vel_x,
            "flow_vy": flow_vel_y,
            "flow_quality": flow_quality,
            "flow_status": 1 if flow_status == 1 else 0,
            "speed_x": flow_vel_x * height_m,
            "speed_y": flow_vel_y * height_m,
        }


def _mtf01_heartbeat_packet(seq):
    """Build a Micolink heartbeat to keep MTF-01 alive."""
    time_ms = int(time.time() * 1000) & 0xFFFFFFFF
    msg = bytearray([
        0xEF, 0x01, 0x00, 0x01, seq & 0xFF, 0x0D,
    ])
    msg.extend(struct.pack('<I', time_ms))
    msg.extend(bytes([0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]))
    msg.append(sum(msg) & 0xFF)
    return bytes(msg)


def _wake_mtf01_sensor(ser, start_seq=0, burst_count=3):
    """Prime the MTF-01 by asserting lines, clearing buffers, and sending heartbeats."""
    ser.setDTR(True)
    ser.setRTS(True)
    time.sleep(0.1)
    ser.reset_input_buffer()
    ser.reset_output_buffer()
    for i in range(int(burst_count)):
        ser.write(_mtf01_heartbeat_packet(start_seq + i))
        ser.flush()
        time.sleep(0.1)
    time.sleep(0.3)
    ser.reset_input_buffer()
    return start_seq + int(burst_count)


def main():
    args = parse_args()
    ensure_repo_import_path()
    calibration_path = (
        Path(args.calibration_file) if args.calibration_file else _default_calibration_path()
    )
    saved_calibration = _load_saved_calibration(calibration_path)
    if args.vo_motion_threshold_mps is None:
        if saved_calibration and "vo_motion_threshold_mps" in saved_calibration:
            args.vo_motion_threshold_mps = float(saved_calibration["vo_motion_threshold_mps"])
        else:
            args.vo_motion_threshold_mps = 0.03
    if args.imu_motion_threshold_mps is None:
        if saved_calibration and "imu_motion_threshold_mps" in saved_calibration:
            args.imu_motion_threshold_mps = float(saved_calibration["imu_motion_threshold_mps"])
        else:
            args.imu_motion_threshold_mps = 0.03

    from navisar.main import build_vo_pipeline
    from navisar.pixhawk.fake_gps_nmea import (
        enu_to_gps,
        gga_sentence,
        rmc_sentence,
        speed_course_from_enu,
    )
    from navisar.vps.vio_imu import ImuVelocityEstimator

    vo, mavlink_interface, _yaw_offset_deg = build_vo_pipeline()
    if mavlink_interface is None:
        raise RuntimeError("VO pipeline did not provide MAVLink interface.")

    master = mavlink_interface.master
    mav_io_lock = threading.Lock()
    with mav_io_lock:
        request_message_interval(master, mavutil.mavlink.MAVLINK_MSG_ID_ATTITUDE, args.att_rate_hz)
        request_message_interval(master, mavutil.mavlink.MAVLINK_MSG_ID_HIGHRES_IMU, args.imu_rate_hz)
        request_message_interval(master, mavutil.mavlink.MAVLINK_MSG_ID_RAW_IMU, args.imu_rate_hz)
        request_message_interval(
            master, mavutil.mavlink.MAVLINK_MSG_ID_DISTANCE_SENSOR, args.range_rate_hz
        )
        request_message_interval(
            master,
            mavutil.mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT,
            args.origin_msg_rate_hz,
        )
        request_message_interval(
            master,
            mavutil.mavlink.MAVLINK_MSG_ID_GPS_RAW_INT,
            args.origin_msg_rate_hz,
        )
        request_message_interval(
            master,
            mavutil.mavlink.MAVLINK_MSG_ID_OPTICAL_FLOW,
            args.imu_rate_hz,
        )
        try:
            request_message_interval(
                master,
                mavutil.mavlink.MAVLINK_MSG_ID_OPTICAL_FLOW_RAD,
                args.imu_rate_hz,
            )
        except AttributeError:
            pass  # OPTICAL_FLOW_RAD not in all pymavlink versions

    send_dt = 1.0 / max(float(args.send_rate_hz), 0.1)
    gps_send_dt = 1.0 / max(float(args.gps_rate_hz), 0.1)
    vo_velocity_weight = _clamp(float(args.vo_velocity_weight), 0.0, 1.0)
    imu_velocity_weight = 1.0 - vo_velocity_weight
    position_correction_alpha = _clamp(float(args.position_correction_alpha), 0.0, 1.0)
    imu_estimator = ImuVelocityEstimator(vel_damping=float(args.imu_damping))
    origin_locked = args.origin_lat is not None and args.origin_lon is not None

    gps_serial = None
    if args.gps_port:
        try:
            gps_serial = serial.Serial(args.gps_port, int(args.gps_baud), timeout=1)
            print(f"[GPS] NMEA output -> {args.gps_port} @ {args.gps_baud}")
        except Exception as exc:
            print(f"[GPS] failed to open {args.gps_port}: {exc}")

    # --- CSV data logging setup ---
    import datetime as _dt_mod
    csv_dir = Path(__file__).resolve().parent / "vio_logs"
    csv_dir.mkdir(parents=True, exist_ok=True)
    run_ts = _dt_mod.datetime.now().strftime("%Y%m%d_%H%M%S")
    gps_csv_path = csv_dir / f"gps_port_parameters_{run_ts}.csv"
    gps_sensor_csv_path = csv_dir / f"gps_sensor_data_{run_ts}.csv"
    mav_of_csv_path = csv_dir / f"mavlink_optical_flow_{run_ts}.csv"

    gps_csv_file = open(gps_csv_path, "w", newline="", encoding="utf-8")
    gps_csv_writer = csv.writer(gps_csv_file)
    gps_csv_writer.writerow([
        "timestamp",
        # VO Pipeline / Image Drift
        "dx_drift_px_m", "dy_drift_px_m", "dt_s",
        "dvx_drift_vel_mps", "dvy_drift_vel_mps",
        "vo_x_m", "vo_y_m", "vo_z_m",
        "imu_vx_enu_mps", "imu_vy_enu_mps",
        "vo_speed_mps", "imu_speed_mps", "motion_gate_open",
        "fused_vx_mps", "fused_vy_mps", "fused_x_m", "fused_y_m",
        # GPS Port Formatting
        "origin_lat", "origin_lon", "origin_alt_m",
        "origin_source",
        "lat", "lon", "alt_m",
        "hdop", "satellites", "fix_quality",
        "speed_mps", "course_deg",
        "gps_tx_status", "gps_tx_error",
        "gga_sentence", "rmc_sentence",
    ])
    gps_csv_file.flush()

    gps_sensor_csv_file = open(gps_sensor_csv_path, "w", newline="", encoding="utf-8")
    gps_sensor_csv_writer = csv.writer(gps_sensor_csv_file)
    gps_sensor_csv_writer.writerow([
        "timestamp",
        "msg_type",
        "fix_type",
        "lat", "lon",
        "alt_msl_m", "alt_rel_m",
        "hdop", "vdop",
        "satellites_visible",
        "ground_speed_mps", "course_over_ground_deg",
        "vx_mps", "vy_mps", "vz_mps",
        "heading_deg",
    ])
    gps_sensor_csv_file.flush()

    mav_of_csv_file = open(mav_of_csv_path, "w", newline="", encoding="utf-8")
    mav_of_csv_writer = csv.writer(mav_of_csv_file)
    mav_of_csv_writer.writerow([
        "timestamp",
        "msg_type",
        "time_usec",
        "flow_x", "flow_y",
        "flow_comp_m_x", "flow_comp_m_y",
        "quality",
        "ground_distance_m",
        "flow_rate_x_rad", "flow_rate_y_rad",
    ])
    mav_of_csv_file.flush()

    of_sensor_csv_path = csv_dir / f"optical_flow_sensor_{run_ts}.csv"
    of_sensor_csv_file = open(of_sensor_csv_path, "w", newline="", encoding="utf-8")
    of_sensor_csv_writer = csv.writer(of_sensor_csv_file)
    of_sensor_csv_writer.writerow([
        "timestamp",
        "sensor_time_ms",
        "distance_mm", "distance_cm", "height_m",
        "dis_status", "strength", "precision",
        "flow_vel_x", "flow_vel_y",
        "flow_quality", "flow_status",
        "speed_x_mps", "speed_y_mps",
    ])
    of_sensor_csv_file.flush()
    print(f"[CSV] 1. GPS sensor data      -> {gps_sensor_csv_path}")
    print(f"[CSV] 2. OF sensor (AMA3)       -> {of_sensor_csv_path}")
    print(f"[CSV] 3. GPS port params (+VO)  -> {gps_csv_path}")
    print(f"[CSV] 4. MAVLink optical flow   -> {mav_of_csv_path}")

    def log_gps_port_row(
        *,
        vo_dbg,
        motion_gate_open,
        vo_x,
        vo_y,
        z_vo_m,
        fused_x,
        fused_y,
        fused_vx,
        fused_vy,
        origin,
        lat,
        lon,
        alt_m,
        hdop_val,
        sats_val,
        fix_val,
        speed_mps,
        course_deg,
        gps_tx_status,
        gps_tx_error,
        gga,
        rmc,
    ):
        try:
            gps_csv_writer.writerow([
                f"{time.time():.6f}",
                f"{vo_dbg['dx']:.8f}", f"{vo_dbg['dy']:.8f}", f"{vo_dbg['dt']:.8f}",
                f"{vo_dbg['dvx']:.8f}", f"{vo_dbg['dvy']:.8f}",
                f"{vo_x:.6f}", f"{vo_y:.6f}", f"{z_vo_m:.4f}",
                f"{vo_dbg['imu_vx_enu']:.8f}", f"{vo_dbg['imu_vy_enu']:.8f}",
                f"{vo_dbg['vo_speed']:.8f}", f"{vo_dbg['imu_speed']:.8f}",
                motion_gate_open,
                f"{fused_vx:.8f}", f"{fused_vy:.8f}",
                f"{fused_x:.6f}", f"{fused_y:.6f}",
                f"{origin['lat']:.10f}" if origin["lat"] is not None else "",
                f"{origin['lon']:.10f}" if origin["lon"] is not None else "",
                f"{float(origin['alt_m']):.4f}" if origin["alt_m"] is not None else "",
                origin.get("source", ""),
                f"{lat:.10f}" if lat is not None else "",
                f"{lon:.10f}" if lon is not None else "",
                f"{alt_m:.4f}" if alt_m is not None else "",
                f"{hdop_val:.1f}" if hdop_val is not None else "",
                sats_val if sats_val is not None else "",
                fix_val if fix_val is not None else "",
                f"{speed_mps:.6f}" if speed_mps is not None else "",
                f"{course_deg:.2f}" if course_deg is not None else "",
                gps_tx_status,
                gps_tx_error,
                gga.strip() if gga else "",
                rmc.strip() if rmc else "",
            ])
            gps_csv_file.flush()
        except Exception as exc:
            print(f"[GPS] CSV write error: {exc}")

    state = {
        "last_print_t": 0.0,
        "att": {"roll": 0.0, "pitch": 0.0, "yaw": 0.0},
        "z_range_m": None,
        "x": 0.0,
        "y": 0.0,
        "z": float(args.z_fallback_m),
        "z_vo": float(args.z_fallback_m),
        "vo_x": 0.0,
        "vo_y": 0.0,
        "vo_vx": 0.0,
        "vo_vy": 0.0,
        "last_vo_x": None,
        "last_vo_y": None,
        "last_vo_t": None,
        "imu_vx_n": 0.0,
        "imu_vy_e": 0.0,
        "imu_vz_d": 0.0,
        "fused_vx": 0.0,
        "fused_vy": 0.0,
        "fused_x": 0.0,
        "fused_y": 0.0,
        "motion_gate_open": False,
        "vo_dbg": {
            "dx": 0.0, "dy": 0.0, "dt": 0.0,
            "dvx": 0.0, "dvy": 0.0,
            "vo_speed": 0.0, "imu_speed": 0.0,
            "imu_vx_enu": 0.0, "imu_vy_enu": 0.0,
        },
        "origin": {
            "lat": float(args.origin_lat) if args.origin_lat is not None else None,
            "lon": float(args.origin_lon) if args.origin_lon is not None else None,
            "alt_m": float(args.origin_alt_m),
            "source": "cli" if origin_locked else "auto",
        },
        "gps": {
            "lat": None,
            "lon": None,
            "alt_m": None,
            "speed_mps": 0.0,
            "course_deg": 0.0,
            "send_count": 0,
            "send_error_count": 0,
            "last_send_error": "",
            "send_rate_hz": 0.0,
        },
        "last_frame_jpg": None,
        "last_frame_ts": 0.0,
        "send_count": 0,
        "send_error_count": 0,
        "last_send_error": "",
        "send_rate_hz": 0.0,
        "calibration": {
            "active": bool(args.calibrate_motion_thresholds),
            "start_time": None,
            "samples": 0,
            "vo_max": 0.0,
            "imu_max": 0.0,
            "done": False,
        },
        "running": True,
        "lock": threading.Lock(),
    }

    html_path = Path(__file__).resolve().with_name("vio_mav_view.html")
    if html_path.exists():
        view_html = html_path.read_text(encoding="utf-8")
    else:
        view_html = """<!doctype html><html><body style='background:#000;color:#fff;font-family:sans-serif'>
<h3>VIO MAV Isolated View</h3><img src='/video' style='max-width:100%;border:1px solid #333'/>
<pre id='s'></pre><script>
setInterval(async()=>{try{const r=await fetch('/state');document.getElementById('s').textContent=JSON.stringify(await r.json(),null,2);}catch(e){}},500);
</script></body></html>"""

    class VioWebHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path in {"/", "/index.html"}:
                body = view_html.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path.startswith("/state"):
                with state["lock"]:
                    payload = {
                        "x": state["x"],
                        "y": state["y"],
                        "vo_x": state["vo_x"],
                        "vo_y": state["vo_y"],
                        "vo_vx": state["vo_vx"],
                        "vo_vy": state["vo_vy"],
                        "imu_vx_n": state["imu_vx_n"],
                        "imu_vy_e": state["imu_vy_e"],
                        "fused_vx": state["fused_vx"],
                        "fused_vy": state["fused_vy"],
                        "motion_gate_open": state["motion_gate_open"],
                        "z": state["z"],
                        "roll": state["att"]["roll"],
                        "pitch": state["att"]["pitch"],
                        "yaw": state["att"]["yaw"],
                        "origin": dict(state["origin"]),
                        "gps": dict(state["gps"]),
                        "calibration": dict(state["calibration"]),
                        "frame_age_s": max(0.0, time.time() - state["last_frame_ts"]),
                        "send_rate_hz": state["send_rate_hz"],
                        "send_count": state["send_count"],
                        "send_error_count": state["send_error_count"],
                        "last_send_error": state["last_send_error"],
                    }
                body = json.dumps(payload).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path.startswith("/video"):
                self.send_response(200)
                self.send_header("Age", "0")
                self.send_header("Cache-Control", "no-cache, private")
                self.send_header("Pragma", "no-cache")
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.end_headers()
                try:
                    while True:
                        with state["lock"]:
                            jpg = state["last_frame_jpg"]
                        if jpg:
                            self.wfile.write(b"--frame\r\n")
                            self.wfile.write(b"Content-Type: image/jpeg\r\n")
                            self.wfile.write(f"Content-Length: {len(jpg)}\r\n\r\n".encode("utf-8"))
                            self.wfile.write(jpg)
                            self.wfile.write(b"\r\n")
                        time.sleep(0.03)
                except (BrokenPipeError, ConnectionResetError):
                    return
            self.send_error(404)

        def log_message(self, _fmt, *_args):
            return

    web = ThreadingHTTPServer((args.web_host, int(args.web_port)), VioWebHandler)
    web_thread = threading.Thread(target=web.serve_forever, daemon=True)
    web_thread.start()
    print(f"[WEB] camera view: http://127.0.0.1:{args.web_port}/")

    print(
        f"[VIO] starting with NAVISAR pipeline; sending VISION_POSITION_ESTIMATE @ {args.send_rate_hz:.1f}Hz"
    )
    if saved_calibration is not None:
        print(
            "[CAL] loaded saved thresholds "
            f"vo={args.vo_motion_threshold_mps:.4f} imu={args.imu_motion_threshold_mps:.4f} "
            f"from {calibration_path}"
        )
    if args.calibrate_motion_thresholds:
        print(
            "[CAL] calibration mode enabled. Keep the vehicle fully still for "
            f"{args.calibration_duration_s:.1f}s."
        )

    def update_origin_from_msg(msg):
        if origin_locked:
            return
        mtype = msg.get_type()
        lat = lon = alt_m = None
        if mtype == "GLOBAL_POSITION_INT":
            lat = float(getattr(msg, "lat", 0.0)) / 1e7
            lon = float(getattr(msg, "lon", 0.0)) / 1e7
            alt_m = float(getattr(msg, "alt", 0.0)) / 1000.0
        elif mtype == "GPS_RAW_INT":
            fix_type = int(getattr(msg, "fix_type", 0) or 0)
            if fix_type >= 2:
                lat = float(getattr(msg, "lat", 0.0)) / 1e7
                lon = float(getattr(msg, "lon", 0.0)) / 1e7
                alt_m = float(getattr(msg, "alt", 0.0)) / 1000.0
        if lat is None or lon is None:
            return
        if abs(lat) < 1e-6 and abs(lon) < 1e-6:
            return
        with state["lock"]:
            if state["origin"]["lat"] is None or state["origin"]["lon"] is None:
                state["origin"] = {
                    "lat": lat,
                    "lon": lon,
                    "alt_m": alt_m if alt_m is not None else float(args.origin_alt_m),
                    "source": mtype.lower(),
                }
                print(
                    "[GPS] origin locked from Pixhawk: "
                    f"lat={lat:.7f} lon={lon:.7f} alt={state['origin']['alt_m']:.2f}m"
                )

    def heartbeat_loop():
        while True:
            with state["lock"]:
                if not state["running"]:
                    break
            try:
                with mav_io_lock:
                    master.mav.heartbeat_send(
                        mavutil.mavlink.MAV_TYPE_ONBOARD_CONTROLLER,
                        mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                        0,
                        0,
                        mavutil.mavlink.MAV_STATE_ACTIVE,
                    )
            except Exception:
                pass
            time.sleep(1.0)

    def sender_loop():
        next_t = time.monotonic()
        last_rate_wall = time.time()
        last_count = 0
        while True:
            with state["lock"]:
                if not state["running"]:
                    break
                x_m = float(state["x"])
                y_m = float(state["y"])
                z_vo_m = float(state["z_vo"])
                z_range_m = state["z_range_m"]
                att = dict(state["att"])
            z_send_m = (
                float(z_range_m)
                if z_range_m is not None
                else float(z_vo_m if z_vo_m is not None else args.z_fallback_m)
            )
            try:
                with mav_io_lock:
                    send_vpe(
                        master,
                        int(time.time() * 1e6),
                        x_m,
                        y_m,
                        z_send_m,
                        float(att["roll"]),
                        float(att["pitch"]),
                        float(att["yaw"]),
                    )
                with state["lock"]:
                    state["z"] = z_send_m
                    state["send_count"] += 1
            except Exception as exc:
                with state["lock"]:
                    state["send_error_count"] += 1
                    state["last_send_error"] = str(exc)
            now_wall = time.time()
            if now_wall - last_rate_wall >= 1.0:
                with state["lock"]:
                    current_count = int(state["send_count"])
                    state["send_rate_hz"] = (current_count - last_count) / (now_wall - last_rate_wall)
                last_count = current_count
                last_rate_wall = now_wall
            next_t += send_dt
            sleep_s = next_t - time.monotonic()
            if sleep_s > 0:
                time.sleep(sleep_s)
            else:
                next_t = time.monotonic()

    def gps_sender_loop():
        if gps_serial is None:
            return
        next_t = time.monotonic()
        last_rate_wall = time.time()
        last_count = 0
        while True:
            with state["lock"]:
                if not state["running"]:
                    break
                fused_x = float(state["fused_x"])
                fused_y = float(state["fused_y"])
                fused_vx = float(state["fused_vx"])
                fused_vy = float(state["fused_vy"])
                z_vo_m = float(state["z_vo"])
                z_range_m = state["z_range_m"]
                origin = dict(state["origin"])
                vo_dbg = dict(state["vo_dbg"])
                motion_gate_open = state["motion_gate_open"]
                vo_x = float(state["vo_x"])
                vo_y = float(state["vo_y"])
            if origin["lat"] is None or origin["lon"] is None:
                log_gps_port_row(
                    vo_dbg=vo_dbg,
                    motion_gate_open=motion_gate_open,
                    vo_x=vo_x,
                    vo_y=vo_y,
                    z_vo_m=z_vo_m,
                    fused_x=fused_x,
                    fused_y=fused_y,
                    fused_vx=fused_vx,
                    fused_vy=fused_vy,
                    origin=origin,
                    lat=None,
                    lon=None,
                    alt_m=None,
                    hdop_val=None,
                    sats_val=None,
                    fix_val=None,
                    speed_mps=None,
                    course_deg=None,
                    gps_tx_status="skipped_no_origin",
                    gps_tx_error="origin_lat_lon_unavailable",
                    gga="",
                    rmc="",
                )
                now_wall = time.time()
                if now_wall - last_rate_wall >= 1.0:
                    with state["lock"]:
                        state["gps"]["send_rate_hz"] = 0.0
                    last_rate_wall = now_wall
                time.sleep(0.1)
                continue

            z_send_m = (
                float(z_range_m)
                if z_range_m is not None
                else float(z_vo_m if z_vo_m is not None else args.z_fallback_m)
            )
            # Compute lat/lon from ENU position (z=0 keeps origin altitude untouched)
            lat, lon, _alt_enu = enu_to_gps(
                fused_x,
                fused_y,
                0.0,
                float(origin["lat"]),
                float(origin["lon"]),
                float(origin["alt_m"]),
            )
            # Use lidar height directly as the GPS altitude
            alt_m = z_send_m
            speed_mps, course_deg = speed_course_from_enu(fused_vx, fused_vy)
            hdop_val = 0.9
            sats_val = max(0, int(args.min_sats))
            fix_val = 1
            gga = ""
            rmc = ""
            try:
                gga = gga_sentence(
                    lat,
                    lon,
                    alt_m,
                    fix_quality=fix_val,
                    satellites=sats_val,
                    hdop=hdop_val,
                )
                rmc = rmc_sentence(
                    lat,
                    lon,
                    speed_mps,
                    course_deg,
                    status="A",
                )
                gps_serial.write(gga.encode("ascii"))
                gps_serial.write(rmc.encode("ascii"))
                with state["lock"]:
                    state["gps"]["lat"] = float(lat)
                    state["gps"]["lon"] = float(lon)
                    state["gps"]["alt_m"] = float(alt_m)
                    state["gps"]["speed_mps"] = float(speed_mps)
                    state["gps"]["course_deg"] = float(course_deg)
                    state["gps"]["send_count"] += 1
                    state["gps"]["last_send_error"] = ""
                log_gps_port_row(
                    vo_dbg=vo_dbg,
                    motion_gate_open=motion_gate_open,
                    vo_x=vo_x,
                    vo_y=vo_y,
                    z_vo_m=z_vo_m,
                    fused_x=fused_x,
                    fused_y=fused_y,
                    fused_vx=fused_vx,
                    fused_vy=fused_vy,
                    origin=origin,
                    lat=lat,
                    lon=lon,
                    alt_m=alt_m,
                    hdop_val=hdop_val,
                    sats_val=sats_val,
                    fix_val=fix_val,
                    speed_mps=speed_mps,
                    course_deg=course_deg,
                    gps_tx_status="sent",
                    gps_tx_error="",
                    gga=gga,
                    rmc=rmc,
                )
            except Exception as exc:
                with state["lock"]:
                    state["gps"]["send_error_count"] += 1
                    state["gps"]["last_send_error"] = str(exc)
                log_gps_port_row(
                    vo_dbg=vo_dbg,
                    motion_gate_open=motion_gate_open,
                    vo_x=vo_x,
                    vo_y=vo_y,
                    z_vo_m=z_vo_m,
                    fused_x=fused_x,
                    fused_y=fused_y,
                    fused_vx=fused_vx,
                    fused_vy=fused_vy,
                    origin=origin,
                    lat=lat,
                    lon=lon,
                    alt_m=alt_m,
                    hdop_val=hdop_val,
                    sats_val=sats_val,
                    fix_val=fix_val,
                    speed_mps=speed_mps,
                    course_deg=course_deg,
                    gps_tx_status="send_error",
                    gps_tx_error=str(exc),
                    gga=gga,
                    rmc=rmc,
                )
            now_wall = time.time()
            if now_wall - last_rate_wall >= 1.0:
                with state["lock"]:
                    current_count = int(state["gps"]["send_count"])
                    state["gps"]["send_rate_hz"] = (current_count - last_count) / (
                        now_wall - last_rate_wall
                    )
                last_count = current_count
                last_rate_wall = now_wall
            next_t += gps_send_dt
            sleep_s = next_t - time.monotonic()
            if sleep_s > 0:
                time.sleep(sleep_s)
            else:
                next_t = time.monotonic()

    # --- MTF-01 optical flow sensor reader thread (AMA3) ---
    of_serial = None
    if args.of_port:
        try:
            of_serial = serial.Serial(
                args.of_port, int(args.of_baud),
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=1,
                xonxoff=False, rtscts=False, dsrdtr=False,
            )
            _wake_mtf01_sensor(of_serial)
            print(f"[OF] MTF-01 sensor -> {args.of_port} @ {args.of_baud}")
        except Exception as exc:
            print(f"[OF] failed to open {args.of_port}: {exc}")
            of_serial = None

    def of_heartbeat_loop():
        """Send heartbeat to MTF-01 every 600ms to keep it alive."""
        seq = 10
        while True:
            with state["lock"]:
                if not state["running"]:
                    break
            try:
                of_serial.write(_mtf01_heartbeat_packet(seq))
                of_serial.flush()
                seq += 1
            except Exception:
                break
            time.sleep(0.6)

    def of_reader_loop():
        """Read MTF-01 data from AMA3 serial and log to CSV."""
        parser = _MicolinkParser()
        start_time = time.time()
        last_recovery_t = 0.0
        data_received = False
        first_valid_msg = False
        recovery_seq = 100
        while True:
            with state["lock"]:
                if not state["running"]:
                    break
            try:
                waiting = of_serial.in_waiting
                if waiting > 0:
                    chunk = of_serial.read(waiting)
                    if chunk:
                        if not data_received:
                            data_received = True
                            print(
                                f"[OF] raw data detected on {args.of_port} after "
                                f"{time.time() - start_time:.2f}s"
                            )
                        for byte in chunk:
                            if parser.parse_char(byte):
                                if not first_valid_msg:
                                    first_valid_msg = True
                                    print(
                                        f"[OF] synchronized with MTF-01 stream after "
                                        f"{time.time() - start_time:.2f}s"
                                    )
                                d = parser.decode_range_sensor()
                                if d is not None:
                                    try:
                                        of_sensor_csv_writer.writerow([
                                            f"{time.time():.6f}",
                                            d["time_ms"],
                                            d["distance_mm"],
                                            f"{d['distance_cm']:.1f}",
                                            f"{d['height_m']:.4f}",
                                            d["dis_status"], d["strength"], d["precision"],
                                            d["flow_vx"], d["flow_vy"],
                                            d["flow_quality"], d["flow_status"],
                                            f"{d['speed_x']:.6f}",
                                            f"{d['speed_y']:.6f}",
                                        ])
                                        of_sensor_csv_file.flush()
                                    except Exception as exc:
                                        print(f"[OF] CSV write error: {exc}")
                else:
                    now = time.time()
                    if not data_received and (now - start_time) > 5.0 and (now - last_recovery_t) > 5.0:
                        print(f"[OF] no data on {args.of_port}; retrying sensor wake-up")
                        try:
                            of_serial.setDTR(False)
                            of_serial.setRTS(False)
                            time.sleep(0.1)
                            recovery_seq = _wake_mtf01_sensor(of_serial, start_seq=recovery_seq)
                            parser = _MicolinkParser()
                            start_time = time.time()
                            last_recovery_t = now
                        except Exception as exc:
                            print(f"[OF] wake-up retry failed: {exc}")
                    time.sleep(0.001)
            except Exception as exc:
                print(f"[OF] reader error: {exc}")
                time.sleep(0.01)

    sender_thread = threading.Thread(target=sender_loop, daemon=True, name="vpe-sender")
    hb_thread = threading.Thread(target=heartbeat_loop, daemon=True, name="vpe-heartbeat")
    gps_thread = threading.Thread(target=gps_sender_loop, daemon=True, name="nmea-gps-sender")
    sender_thread.start()
    hb_thread.start()
    gps_thread.start()

    of_hb_thread = None
    of_reader_thread = None
    if of_serial is not None:
        of_hb_thread = threading.Thread(target=of_heartbeat_loop, daemon=True, name="of-heartbeat")
        of_reader_thread = threading.Thread(target=of_reader_loop, daemon=True, name="of-reader")
        of_hb_thread.start()
        of_reader_thread.start()

    def on_update(
        x_m,
        y_m,
        z_vo_m,
        _dx_m,
        _dy_m,
        _dz_m,
        *_rest,
    ):
        # Capture the incoming pixel-drift deltas for CSV logging
        csv_dx_m = float(_dx_m) if _dx_m is not None else 0.0
        csv_dy_m = float(_dy_m) if _dy_m is not None else 0.0
        # Drain fresh Pixhawk messages and keep the latest attitude, range, IMU, and GPS-origin state.
        with mav_io_lock:
            for _ in range(120):
                msg = master.recv_match(
                    type=[
                        "ATTITUDE",
                        "DISTANCE_SENSOR",
                        "HIGHRES_IMU",
                        "RAW_IMU",
                        "GLOBAL_POSITION_INT",
                        "GPS_RAW_INT",
                        "OPTICAL_FLOW",
                        "OPTICAL_FLOW_RAD",
                    ],
                    blocking=False,
                )
                if msg is None:
                    break
                mtype = msg.get_type()
                if mtype == "ATTITUDE":
                    imu_estimator.process_message(msg)
                    with state["lock"]:
                        state["att"] = {
                            "roll": float(getattr(msg, "roll", state["att"]["roll"])),
                            "pitch": float(getattr(msg, "pitch", state["att"]["pitch"])),
                            "yaw": float(getattr(msg, "yaw", state["att"]["yaw"])),
                        }
                elif mtype == "DISTANCE_SENSOR":
                    cur_cm = float(getattr(msg, "current_distance", 0.0))
                    if cur_cm > 0.0:
                        with state["lock"]:
                            state["z_range_m"] = cur_cm / 100.0
                elif mtype in ("HIGHRES_IMU", "RAW_IMU"):
                    imu_result = imu_estimator.process_message(msg)
                    if imu_result is not None:
                        vx_n, vy_e, vz_d, _frame = imu_result
                        with state["lock"]:
                            state["imu_vx_n"] = float(vx_n)
                            state["imu_vy_e"] = float(vy_e)
                            state["imu_vz_d"] = float(vz_d)
                elif mtype in ("GLOBAL_POSITION_INT", "GPS_RAW_INT"):
                    update_origin_from_msg(msg)
                    # Log raw GPS sensor data to CSV
                    try:
                        if mtype == "GPS_RAW_INT":
                            gps_sensor_csv_writer.writerow([
                                f"{time.time():.6f}",
                                "GPS_RAW_INT",
                                int(getattr(msg, "fix_type", 0) or 0),
                                f"{float(getattr(msg, 'lat', 0)) / 1e7:.10f}",
                                f"{float(getattr(msg, 'lon', 0)) / 1e7:.10f}",
                                f"{float(getattr(msg, 'alt', 0)) / 1000.0:.4f}",
                                "",  # no relative alt in GPS_RAW_INT
                                f"{float(getattr(msg, 'eph', 0)) / 100.0:.2f}",
                                f"{float(getattr(msg, 'epv', 0)) / 100.0:.2f}",
                                int(getattr(msg, "satellites_visible", 0) or 0),
                                f"{float(getattr(msg, 'vel', 0)) / 100.0:.4f}",
                                f"{float(getattr(msg, 'cog', 0)) / 100.0:.2f}",
                                "", "", "",  # no vx/vy/vz in GPS_RAW_INT
                                "",  # no heading in GPS_RAW_INT
                            ])
                        else:  # GLOBAL_POSITION_INT
                            gps_sensor_csv_writer.writerow([
                                f"{time.time():.6f}",
                                "GLOBAL_POSITION_INT",
                                "",  # no fix_type in GLOBAL_POSITION_INT
                                f"{float(getattr(msg, 'lat', 0)) / 1e7:.10f}",
                                f"{float(getattr(msg, 'lon', 0)) / 1e7:.10f}",
                                f"{float(getattr(msg, 'alt', 0)) / 1000.0:.4f}",
                                f"{float(getattr(msg, 'relative_alt', 0)) / 1000.0:.4f}",
                                "", "",  # no hdop/vdop in GLOBAL_POSITION_INT
                                "",  # no satellites in GLOBAL_POSITION_INT
                                "", "",  # no ground speed/cog directly
                                f"{float(getattr(msg, 'vx', 0)) / 100.0:.4f}",
                                f"{float(getattr(msg, 'vy', 0)) / 100.0:.4f}",
                                f"{float(getattr(msg, 'vz', 0)) / 100.0:.4f}",
                                f"{float(getattr(msg, 'hdg', 0)) / 100.0:.2f}",
                            ])
                        gps_sensor_csv_file.flush()
                    except Exception:
                        pass
                elif mtype in ("OPTICAL_FLOW", "OPTICAL_FLOW_RAD"):
                    # Log MAVLink optical flow data to CSV
                    try:
                        mav_of_csv_writer.writerow([
                            f"{time.time():.6f}",
                            mtype,
                            int(getattr(msg, "time_usec", 0) or 0),
                            int(getattr(msg, "flow_x", 0) or 0),
                            int(getattr(msg, "flow_y", 0) or 0),
                            f"{float(getattr(msg, 'flow_comp_m_x', 0)):.6f}",
                            f"{float(getattr(msg, 'flow_comp_m_y', 0)):.6f}",
                            int(getattr(msg, "quality", 0) or 0),
                            f"{float(getattr(msg, 'ground_distance', 0)):.4f}",
                            f"{float(getattr(msg, 'flow_rate_x', 0)):.8f}",
                            f"{float(getattr(msg, 'flow_rate_y', 0)):.8f}",
                        ])
                        mav_of_csv_file.flush()
                    except Exception:
                        pass

        with state["lock"]:
            now_wall = time.time()
            last_vo_t = state["last_vo_t"]
            last_vo_x = state["last_vo_x"]
            last_vo_y = state["last_vo_y"]
            vo_vx = state["vo_vx"]
            vo_vy = state["vo_vy"]
            if (
                last_vo_t is not None
                and last_vo_x is not None
                and last_vo_y is not None
                and now_wall > last_vo_t
            ):
                dt = now_wall - last_vo_t
                if 0.0 < dt <= 1.0:
                    vo_vx = (float(x_m) - float(last_vo_x)) / dt
                    vo_vy = (float(y_m) - float(last_vo_y)) / dt
            state["last_vo_t"] = now_wall
            state["last_vo_x"] = float(x_m)
            state["last_vo_y"] = float(y_m)
            state["vo_x"] = float(x_m)
            state["vo_y"] = float(y_m)
            state["vo_vx"] = float(vo_vx)
            state["vo_vy"] = float(vo_vy)
            state["z_vo"] = float(z_vo_m if z_vo_m is not None else state["z_vo"])

            imu_vx_enu = float(state["imu_vy_e"])
            imu_vy_enu = float(state["imu_vx_n"])
            vo_speed = (float(vo_vx) ** 2 + float(vo_vy) ** 2) ** 0.5
            imu_speed = (imu_vx_enu ** 2 + imu_vy_enu ** 2) ** 0.5
            calibration_finished = False
            calibration_payload = None
            if state["calibration"]["active"] and not state["calibration"]["done"]:
                if state["calibration"]["start_time"] is None:
                    state["calibration"]["start_time"] = now_wall
                state["calibration"]["samples"] += 1
                state["calibration"]["vo_max"] = max(
                    float(state["calibration"]["vo_max"]),
                    float(vo_speed),
                )
                state["calibration"]["imu_max"] = max(
                    float(state["calibration"]["imu_max"]),
                    float(imu_speed),
                )
                elapsed = now_wall - float(state["calibration"]["start_time"])
                if elapsed >= float(args.calibration_duration_s):
                    calibration_payload = {
                        "saved_at_unix_s": now_wall,
                        "calibration_duration_s": float(args.calibration_duration_s),
                        "calibration_margin": float(args.calibration_margin),
                        "sample_count": int(state["calibration"]["samples"]),
                        "vo_noise_max_mps": float(state["calibration"]["vo_max"]),
                        "imu_noise_max_mps": float(state["calibration"]["imu_max"]),
                        "vo_motion_threshold_mps": max(
                            0.01,
                            float(state["calibration"]["vo_max"]) * float(args.calibration_margin),
                        ),
                        "imu_motion_threshold_mps": max(
                            0.01,
                            float(state["calibration"]["imu_max"]) * float(args.calibration_margin),
                        ),
                    }
                    state["calibration"]["done"] = True
                    calibration_finished = True
            motion_gate_open = (
                vo_speed >= float(args.vo_motion_threshold_mps)
                and imu_speed >= float(args.imu_motion_threshold_mps)
            )
            if motion_gate_open:
                fused_vx = vo_velocity_weight * float(vo_vx) + imu_velocity_weight * imu_vx_enu
                fused_vy = vo_velocity_weight * float(vo_vy) + imu_velocity_weight * imu_vy_enu
            else:
                fused_vx = 0.0
                fused_vy = 0.0
            state["fused_vx"] = fused_vx
            state["fused_vy"] = fused_vy
            state["motion_gate_open"] = motion_gate_open

            dt = 0.0
            if state["last_vo_t"] is not None and last_vo_t is not None and now_wall > last_vo_t:
                dt = now_wall - last_vo_t
                pred_x = float(state["fused_x"]) + fused_vx * dt
                pred_y = float(state["fused_y"]) + fused_vy * dt
            else:
                pred_x = float(x_m)
                pred_y = float(y_m)

            state["fused_x"] = (
                position_correction_alpha * float(x_m)
                + (1.0 - position_correction_alpha) * pred_x
            )
            state["fused_y"] = (
                position_correction_alpha * float(y_m)
                + (1.0 - position_correction_alpha) * pred_y
            )
            state["x"] = float(state["fused_x"])
            state["y"] = float(state["fused_y"])

            # Store computed VO values that should be logged in the GPS thread
            state["vo_dbg"] = {
                "dx": csv_dx_m,
                "dy": csv_dy_m,
                "dt": dt,
                "dvx": float(vo_vx),
                "dvy": float(vo_vy),
                "vo_speed": float(vo_speed),
                "imu_speed": float(imu_speed),
                "imu_vx_enu": float(imu_vx_enu),
                "imu_vy_enu": float(imu_vy_enu),
            }

        wall_now = time.time()  # noqa: E305 – resume debug print logic
        if wall_now - state["last_print_t"] >= 1.0:
            with state["lock"]:
                state["last_print_t"] = wall_now
                x_dbg = state["x"]
                y_dbg = state["y"]
                vo_x_dbg = state["vo_x"]
                vo_y_dbg = state["vo_y"]
                vo_vx_dbg = state["vo_vx"]
                vo_vy_dbg = state["vo_vy"]
                imu_vx_dbg = state["imu_vy_e"]
                imu_vy_dbg = state["imu_vx_n"]
                fused_vx_dbg = state["fused_vx"]
                fused_vy_dbg = state["fused_vy"]
                motion_gate_dbg = state["motion_gate_open"]
                z_dbg = state["z"]
                att_dbg = dict(state["att"])
                origin_dbg = dict(state["origin"])
                gps_dbg = dict(state["gps"])
                calibration_dbg = dict(state["calibration"])
                send_rate_dbg = float(state["send_rate_hz"])
            print(
                "[VIO+IMU] "
                f"fused_xy=({x_dbg:.3f}, {y_dbg:.3f}) vo_xy=({vo_x_dbg:.3f}, {vo_y_dbg:.3f}) "
                f"vo_v=({vo_vx_dbg:.3f}, {vo_vy_dbg:.3f}) imu_v_enu=({imu_vx_dbg:.3f}, {imu_vy_dbg:.3f}) "
                f"fused_v=({fused_vx_dbg:.3f}, {fused_vy_dbg:.3f}) gate={motion_gate_dbg} z={z_dbg:.3f} "
                f"roll={att_dbg['roll']:.3f} pitch={att_dbg['pitch']:.3f} yaw={att_dbg['yaw']:.3f} "
                f"gps=({gps_dbg['lat']}, {gps_dbg['lon']}) origin={origin_dbg['source']} "
                f"vpe_tx={send_rate_dbg:.1f}Hz gps_tx={gps_dbg['send_rate_hz']:.1f}Hz "
                f"cal_samples={calibration_dbg['samples']}"
            )
        if calibration_finished and calibration_payload is not None:
            _save_calibration(calibration_path, calibration_payload)
            print(
                "[CAL] saved calibration to "
                f"{calibration_path} "
                f"(vo={calibration_payload['vo_motion_threshold_mps']:.4f}, "
                f"imu={calibration_payload['imu_motion_threshold_mps']:.4f})"
            )
            args.vo_motion_threshold_mps = float(calibration_payload["vo_motion_threshold_mps"])
            args.imu_motion_threshold_mps = float(calibration_payload["imu_motion_threshold_mps"])
            raise KeyboardInterrupt

    def frame_callback(frame):
        if frame is None:
            return
        try:
            ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if not ok:
                return
            jpg = buf.tobytes()
            with state["lock"]:
                state["last_frame_jpg"] = jpg
                state["last_frame_ts"] = time.time()
        except Exception:
            return

    try:
        try:
            vo.run(
                window_name="NAVISAR VO Isolated",
                on_update=on_update,
                frame_callback=frame_callback,
                show_window=bool(args.show_window),
            )
        except TypeError:
            # MedianFlowVO.run has no window_name kwarg.
            vo.run(
                on_update=on_update,
                frame_callback=frame_callback,
                show_window=bool(args.show_window),
            )
    except KeyboardInterrupt:
        print("\nStopped by user.")
    finally:
        with state["lock"]:
            state["running"] = False
        try:
            sender_thread.join(timeout=1.0)
        except Exception:
            pass
        try:
            hb_thread.join(timeout=1.0)
        except Exception:
            pass
        try:
            gps_thread.join(timeout=1.0)
        except Exception:
            pass
        if of_reader_thread is not None:
            try:
                of_reader_thread.join(timeout=1.0)
            except Exception:
                pass
        if of_hb_thread is not None:
            try:
                of_hb_thread.join(timeout=1.0)
            except Exception:
                pass
        try:
            web.shutdown()
        except Exception:
            pass
        if gps_serial is not None:
            try:
                gps_serial.close()
            except Exception:
                pass
        if of_serial is not None:
            try:
                of_serial.setDTR(False)
                of_serial.setRTS(False)
                of_serial.close()
            except Exception:
                pass
        # Close CSV log files
        for csv_f in (gps_csv_file, gps_sensor_csv_file,
                      mav_of_csv_file, of_sensor_csv_file):
            try:
                csv_f.flush()
                csv_f.close()
            except Exception:
                pass
        print(
            f"[CSV] logs saved:\n"
            f"  - {gps_sensor_csv_path}\n"
            f"  - {of_sensor_csv_path}\n"
            f"  - {gps_csv_path}\n"
            f"  - {mav_of_csv_path}\n"
        )
        try:
            vo.camera_driver.release()
        except Exception:
            pass


if __name__ == "__main__":
    main()
