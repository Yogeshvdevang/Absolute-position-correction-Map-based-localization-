import cv2


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
