import threading


class FrameBuffer:
  def __init__(self):
    self.frame = None
    self.lock = threading.Lock()

  def update(self, frame):
    with self.lock:
      self.frame = frame

  def get(self):
    with self.lock:
      return self.frame
