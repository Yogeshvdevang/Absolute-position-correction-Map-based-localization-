#!/usr/bin/env python3
"""
MTF-01 Optical Flow + Rangefinder → Pixhawk MAVLink Bridge
============================================================
Sensor  : MTF-01  on /dev/ttyAMA3  @ 115200
Pixhawk : MAVLink on /dev/ttyACM0  @ 115200

MAVLink messages sent:
  • OPTICAL_FLOW   (#100) — flow_comp_m_x/y, flow_rate_x/y, flow_x/y,
                            ground_distance, quality, sensor_id, time_usec
  • DISTANCE_SENSOR (#132)— rangefinder height in cm

Install deps once:
    pip3 install pymavlink pyserial
"""

import struct
import time
import threading
import sys
from pymavlink import mavutil

# ─────────────────────────── CONFIGURATION ──────────────────────────────────
SENSOR_PORT   = "/dev/ttyAMA3"   # MTF-01 optical flow sensor
SENSOR_BAUD   = 115200

MAVLINK_PORT  = "/dev/ttyACM0"   # Pixhawk USB / telemetry
MAVLINK_BAUD  = 115200

# Rangefinder limits (match your MTF-01 spec)
RANGEFINDER_MIN_CM = 2     # 2 cm
RANGEFINDER_MAX_CM = 800   # 8 m

# Source system/component IDs for MAVLink messages we send
GCS_SYSTEM_ID    = 1
GCS_COMPONENT_ID = mavutil.mavlink.MAV_COMP_ID_PERIPHERAL   # 158
# ─────────────────────────────────────────────────────────────────────────────

# ── Micolink / MTF-01 protocol constants ────────────────────────────────────
MICOLINK_MSG_HEAD          = 0xEF
MICOLINK_MSG_ID_RANGE_SENSOR = 0x51
MICOLINK_MAX_PAYLOAD_LEN   = 64


class MicolinkMessage:
    def __init__(self):
        self.head = self.dev_id = self.sys_id = 0
        self.msg_id = self.seq = self.len = 0
        self.payload = bytearray(MICOLINK_MAX_PAYLOAD_LEN)
        self.checksum = self.status = self.payload_cnt = 0

    def reset(self):
        self.status = self.payload_cnt = 0


class MTF01Data:
    """Decoded MTF-01 payload (message ID 0x51)."""

    def __init__(self, payload_bytes):
        data = struct.unpack('<IIBBBBhhBBH', payload_bytes[:24])
        self.time_ms      = data[0]
        self.distance_mm  = data[1]   # raw distance in mm
        self.strength     = data[2]
        self.precision    = data[3]
        self.dis_status   = data[4]   # 1 = valid
        self.flow_vel_x   = data[6]   # rad/s × scale (see below)
        self.flow_vel_y   = data[7]
        self.flow_quality = data[8]   # 0-255
        self.flow_status  = data[9]   # 1 = valid

    # ── derived ──────────────────────────────────────────────────────────────
    @property
    def dist_valid(self):
        return self.distance_mm > 0 and self.dis_status == 1

    @property
    def height_m(self):
        return (self.distance_mm / 1000.0) if self.dist_valid else 0.0

    @property
    def height_cm(self):
        return (self.distance_mm / 10.0) if self.dist_valid else 0.0

    # flow_vel_x/y from MTF-01 are in units where:
    #   speed_m_s = flow_vel * height_m
    # so flow_vel  ≡  flow_rate in rad/s (body frame)
    @property
    def flow_rate_x(self):
        return float(self.flow_vel_x)   # rad/s

    @property
    def flow_rate_y(self):
        return float(self.flow_vel_y)   # rad/s

    @property
    def flow_comp_m_x(self):
        return self.flow_rate_x * self.height_m   # m/s

    @property
    def flow_comp_m_y(self):
        return self.flow_rate_y * self.height_m   # m/s


class MicolinkParser:
    def __init__(self):
        self.msg = MicolinkMessage()

    def _checksum(self, msg):
        cs = msg.head + msg.dev_id + msg.sys_id + msg.msg_id + msg.seq + msg.len
        for i in range(msg.len):
            cs += msg.payload[i]
        return cs & 0xFF

    def parse_char(self, byte):
        m = self.msg
        s = m.status

        if s == 0:
            if byte == MICOLINK_MSG_HEAD:
                m.head = byte; m.status = 1
        elif s == 1:
            m.dev_id = byte; m.status = 2
        elif s == 2:
            m.sys_id = byte; m.status = 3
        elif s == 3:
            m.msg_id = byte; m.status = 4
        elif s == 4:
            m.seq = byte; m.status = 5
        elif s == 5:
            m.len = byte
            if m.len == 0:
                m.status = 7
            elif m.len > MICOLINK_MAX_PAYLOAD_LEN:
                m.reset()
            else:
                m.status = 6
        elif s == 6:
            m.payload[m.payload_cnt] = byte
            m.payload_cnt += 1
            if m.payload_cnt == m.len:
                m.payload_cnt = 0
                m.status = 7
        elif s == 7:
            m.checksum = byte
            m.status = 0
            if self._checksum(m) == m.checksum:
                return True
            else:
                m.reset()
        else:
            m.reset()
        return False

    def decode(self):
        if self.msg.msg_id == MICOLINK_MSG_ID_RANGE_SENSOR:
            return MTF01Data(bytes(self.msg.payload[:self.msg.len]))
        return None


# ── Heartbeat sender (keeps MTF-01 alive) ───────────────────────────────────
class HeartbeatSender:
    def __init__(self, ser):
        self._ser = ser
        self._seq = 0
        self._running = False
        self._thread = None

    def _packet(self):
        t = int(time.time() * 1000) & 0xFFFFFFFF
        msg = bytearray([0xEF, 0x01, 0x00, 0x01, self._seq & 0xFF, 0x0D])
        msg += struct.pack('<I', t)
        msg += bytes([0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00])
        msg.append(sum(msg) & 0xFF)
        self._seq += 1
        return bytes(msg)

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False

    def _loop(self):
        while self._running:
            try:
                self._ser.write(self._packet())
                self._ser.flush()
            except Exception as e:
                print(f"[HB] error: {e}")
                break
            time.sleep(0.6)


# ── MAVLink sender ───────────────────────────────────────────────────────────
class MAVLinkBridge:
    def __init__(self, port, baud):
        print(f"[MAV] Connecting to Pixhawk on {port} @ {baud}…")
        self.mav = mavutil.mavlink_connection(
            port,
            baud=baud,
            source_system=GCS_SYSTEM_ID,
            source_component=GCS_COMPONENT_ID,
        )
        # Wait for a heartbeat so we know the connection is alive
        print("[MAV] Waiting for Pixhawk heartbeat…")
        self.mav.wait_heartbeat(timeout=10)
        print(f"[MAV] ✓ Pixhawk found — system {self.mav.target_system} "
              f"component {self.mav.target_component}")

    def send_optical_flow(self, data: MTF01Data):
        """
        OPTICAL_FLOW (#100)
        Matches what you see on the Telem2 screen:
          flow_comp_m_x, flow_comp_m_y  — velocity compensated (m/s)
          flow_rate_x,   flow_rate_y    — body angular rate   (rad/s)
          flow_x,        flow_y         — raw pixel flow      (int16, 1/10 px)
          ground_distance               — AGL height          (m)
          quality                       — 0-255
          sensor_id                     — 0
          time_usec                     — µs timestamp
        """
        time_usec = int(time.time() * 1e6)

        # flow_x/y: integer "1/10 pixel" units — scale from rad/s
        # MTF-01 uses ~small values; multiply by 10 for the int16 field
        flow_x = int(data.flow_vel_x * 10)   # keeps it in 1/10-pixel convention
        flow_y = int(data.flow_vel_y * 10)

        self.mav.mav.optical_flow_send(
            time_usec,            # time_usec  [µs]
            0,                    # sensor_id
            flow_x,               # flow_x     [dpix × 10]
            flow_y,               # flow_y     [dpix × 10]
            data.flow_comp_m_x,   # flow_comp_m_x [m/s]
            data.flow_comp_m_y,   # flow_comp_m_y [m/s]
            data.flow_quality,    # quality    [0-255]
            data.height_m,        # ground_distance [m]
            data.flow_rate_x,     # flow_rate_x [rad/s]
            data.flow_rate_y,     # flow_rate_y [rad/s]
        )
        return {
            "time_usec": time_usec,
            "sensor_id": 0,
            "flow_x": flow_x,
            "flow_y": flow_y,
            "flow_comp_m_x": data.flow_comp_m_x,
            "flow_comp_m_y": data.flow_comp_m_y,
            "quality": data.flow_quality,
            "ground_distance": data.height_m,
            "flow_rate_x": data.flow_rate_x,
            "flow_rate_y": data.flow_rate_y,
        }

    def send_distance_sensor(self, data: MTF01Data):
        """
        DISTANCE_SENSOR (#132)
        Sends the rangefinder distance so Pixhawk shows it under RANGEFINDER
        exactly as you saw on Telem2 (distance field in metres → stored in cm).
        """
        dist_cm = max(RANGEFINDER_MIN_CM,
                      min(int(data.height_cm), RANGEFINDER_MAX_CM))
        time_boot_ms = int(time.time() * 1000) & 0xFFFFFFFF

        self.mav.mav.distance_sensor_send(
            time_boot_ms,                           # time_boot_ms
            RANGEFINDER_MIN_CM,                     # min_distance [cm]
            RANGEFINDER_MAX_CM,                     # max_distance [cm]
            dist_cm,                                # current_distance [cm]
            mavutil.mavlink.MAV_DISTANCE_SENSOR_LASER,  # type
            0,                                      # id
            mavutil.mavlink.MAV_SENSOR_ROTATION_PITCH_270,  # orientation (down)
            255,                                    # covariance (unknown)
        )
        return {
            "time_boot_ms": time_boot_ms,
            "min_distance": RANGEFINDER_MIN_CM,
            "max_distance": RANGEFINDER_MAX_CM,
            "current_distance": dist_cm,
            "type": int(mavutil.mavlink.MAV_DISTANCE_SENSOR_LASER),
            "id": 0,
            "orientation": int(mavutil.mavlink.MAV_SENSOR_ROTATION_PITCH_270),
            "covariance": 255,
        }


# ── Main bridge loop ─────────────────────────────────────────────────────────
def main():
    import serial

    sensor_port  = sys.argv[1] if len(sys.argv) > 1 else SENSOR_PORT
    mavlink_port = sys.argv[2] if len(sys.argv) > 2 else MAVLINK_PORT

    # ── Open sensor serial ───────────────────────────────────────────────────
    print(f"[SEN] Opening {sensor_port} @ {SENSOR_BAUD}…")
    ser = serial.Serial(
        sensor_port, SENSOR_BAUD,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=serial.STOPBITS_ONE,
        timeout=1,
        xonxoff=False, rtscts=False, dsrdtr=False,
    )
    ser.setDTR(True)
    ser.setRTS(True)
    time.sleep(0.1)
    ser.reset_input_buffer()
    ser.reset_output_buffer()

    # ── Wake sensor with 3 quick heartbeats ─────────────────────────────────
    hb = HeartbeatSender(ser)
    print("[SEN] Waking sensor…")
    for _ in range(3):
        ser.write(hb._packet())
        ser.flush()
        time.sleep(0.1)
    time.sleep(0.3)
    ser.reset_input_buffer()

    # ── Start continuous heartbeat thread ────────────────────────────────────
    hb.start()
    print("[SEN] ✓ Heartbeat thread running (600 ms)")

    # ── Connect to Pixhawk ───────────────────────────────────────────────────
    bridge = MAVLinkBridge(mavlink_port, MAVLINK_BAUD)

    # ── Parse & forward ──────────────────────────────────────────────────────
    parser  = MicolinkParser()
    count   = 0
    synced  = False
    print("\n[RUN] Bridge running — press Ctrl+C to stop\n")

    try:
        while True:
            if ser.in_waiting > 0:
                byte = ser.read(1)
                if not byte:
                    continue

                if parser.parse_char(byte[0]):
                    sensor_data = parser.decode()
                    if sensor_data is None:
                        continue

                    if not synced:
                        synced = True
                        print("[SEN] ✓ Synchronised with sensor\n")

                    # ── Send both MAVLink messages ───────────────────────────
                    of_payload = bridge.send_optical_flow(sensor_data)
                    ds_payload = bridge.send_distance_sensor(sensor_data)

                    count += 1
                    if count % 10 == 0:   # print every 10th packet (~1 Hz at 10 Hz)
                        print(
                            f"[TX #{count:06d}] "
                            f"OPTICAL_FLOW "
                            f"flow_x={of_payload['flow_x']} "
                            f"flow_y={of_payload['flow_y']} "
                            f"comp_x={of_payload['flow_comp_m_x']:+.4f}m/s "
                            f"comp_y={of_payload['flow_comp_m_y']:+.4f}m/s "
                            f"rate_x={of_payload['flow_rate_x']:+.2f}rad/s "
                            f"rate_y={of_payload['flow_rate_y']:+.2f}rad/s "
                            f"quality={of_payload['quality']} "
                            f"ground={of_payload['ground_distance']:.3f}m | "
                            f"DISTANCE_SENSOR current={ds_payload['current_distance']}cm "
                            f"min={ds_payload['min_distance']}cm "
                            f"max={ds_payload['max_distance']}cm"
                        )
            else:
                time.sleep(0.001)   # 1 ms yield when nothing to read

    except KeyboardInterrupt:
        print("\n[RUN] Stopped by user")
    finally:
        hb.stop()
        ser.setDTR(False)
        ser.setRTS(False)
        ser.close()
        print("[SEN] Port closed")


if __name__ == "__main__":
    main()
