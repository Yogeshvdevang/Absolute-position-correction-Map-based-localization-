import asyncio
import base64
from typing import Set

import cv2
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from .ai_engine.frame_buffer import FrameBuffer


frame_buffer = FrameBuffer()
camera_subscribers: Set[WebSocket] = set()
camera_subscribers_lock = asyncio.Lock()
CAMERA_SUBSCRIBE_MESSAGE = "__subscribe__"


def _decode_frame(jpg_b64: str):
  jpg_bytes = base64.b64decode(jpg_b64)
  np_arr = np.frombuffer(jpg_bytes, np.uint8)
  frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
  if frame is None:
    raise ValueError("Camera frame decode failed")
  return frame


def _encode_latest_frame_b64() -> str | None:
  frame = frame_buffer.get()
  if frame is None:
    return None

  success, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
  if not success:
    return None

  return base64.b64encode(encoded.tobytes()).decode("ascii")


async def _remove_subscribers(dead: list[WebSocket]):
  if not dead:
    return
  async with camera_subscribers_lock:
    for websocket in dead:
      camera_subscribers.discard(websocket)


async def broadcast_camera_frame(jpg_b64: str):
  async with camera_subscribers_lock:
    subscribers = list(camera_subscribers)

  dead: list[WebSocket] = []
  for websocket in subscribers:
    try:
      await websocket.send_text(jpg_b64)
    except Exception:
      dead.append(websocket)

  await _remove_subscribers(dead)


async def push_camera_frame(jpg_b64: str):
  frame = _decode_frame(jpg_b64)
  frame_buffer.update(frame)
  await broadcast_camera_frame(jpg_b64)


async def _register_camera_subscriber(websocket: WebSocket):
  async with camera_subscribers_lock:
    camera_subscribers.add(websocket)

  latest = _encode_latest_frame_b64()
  if latest:
    await websocket.send_text(latest)

  try:
    while True:
      message = await websocket.receive()
      if message.get("type") == "websocket.disconnect":
        break
  except WebSocketDisconnect:
    pass
  finally:
    await _remove_subscribers([websocket])


async def camera_receiver(websocket: WebSocket):
  await websocket.accept()

  try:
    first_message = await websocket.receive()
  except WebSocketDisconnect:
    return

  if first_message.get("type") == "websocket.disconnect":
    return

  first_text = first_message.get("text")
  if isinstance(first_text, str) and first_text.strip() == CAMERA_SUBSCRIBE_MESSAGE:
    await _register_camera_subscriber(websocket)
    return

  if isinstance(first_text, str) and first_text.strip():
    try:
      await push_camera_frame(first_text)
    except Exception:
      return

  try:
    while True:
      message = await websocket.receive_text()
      if not message:
        continue
      await push_camera_frame(message)
  except WebSocketDisconnect:
    return
