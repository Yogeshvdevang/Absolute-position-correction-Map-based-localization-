import base64
import cv2
import numpy as np
from fastapi import WebSocket

from .ai_engine.frame_buffer import FrameBuffer


frame_buffer = FrameBuffer()


async def camera_receiver(websocket: WebSocket):
  await websocket.accept()

  while True:
    data = await websocket.receive_text()

    jpg_bytes = base64.b64decode(data)
    np_arr = np.frombuffer(jpg_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    frame_buffer.update(frame)
