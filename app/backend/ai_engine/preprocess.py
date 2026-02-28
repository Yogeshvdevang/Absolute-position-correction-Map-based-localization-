import cv2


class Preprocessor:
  def __init__(self, raster_manager=None, reference_height: float = 100.0):
    self.raster = raster_manager
    self.reference_height = reference_height

  def rotate_to_north(self, frame, yaw_deg: float | None):
    if frame is None or yaw_deg is None:
      return frame
    h, w = frame.shape[:2]
    center = (w / 2, h / 2)
    rot = cv2.getRotationMatrix2D(center, -yaw_deg, 1.0)
    return cv2.warpAffine(frame, rot, (w, h), flags=cv2.INTER_LINEAR)

  def correct_altitude(self, lat: float, lon: float, baro_alt: float, initial_alt: float):
    if self.raster is None:
      return baro_alt
    ground_alt = self.raster.get_ground_alt(lat, lon)
    return baro_alt + (initial_alt - ground_alt)

  def compute_scale(self, current_height: float):
    if not current_height or not self.reference_height:
      return 1.0
    scale = current_height / self.reference_height
    return max(0.5, min(scale, 2.0))

  def scale_frame(self, frame, scale: float):
    if frame is None or not scale or scale == 1.0:
      return frame
    return cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR)

  def run(self, frame, yaw: float | None, lat: float | None, lon: float | None, baro_alt: float | None, initial_alt: float | None):
    if frame is None:
      return {
        "frame": None,
        "scale": 1.0,
        "true_height": None
      }

    frame_north = self.rotate_to_north(frame, yaw)

    if lat is None or lon is None or baro_alt is None or initial_alt is None:
      return {
        "frame": frame_north,
        "scale": 1.0,
        "true_height": None
      }

    try:
      true_height = self.correct_altitude(lat, lon, baro_alt, initial_alt)
      scale = self.compute_scale(true_height)
      frame_scaled = self.scale_frame(frame_north, scale)
      return {
        "frame": frame_scaled,
        "scale": scale,
        "true_height": true_height
      }
    except Exception:
      return {
        "frame": frame_north,
        "scale": 1.0,
        "true_height": None
      }


# Backward-compatible helper
def preprocess_frame(frame, yaw_deg: float | None = None):
  if frame is None:
    return None
  output = frame

  if yaw_deg is not None:
    h, w = output.shape[:2]
    center = (w / 2, h / 2)
    rot = cv2.getRotationMatrix2D(center, -yaw_deg, 1.0)
    output = cv2.warpAffine(output, rot, (w, h), flags=cv2.INTER_LINEAR)

  return output
