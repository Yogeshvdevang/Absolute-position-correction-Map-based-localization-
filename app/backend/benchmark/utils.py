from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable, List, Tuple

import cv2
import numpy as np


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
  radius_m = 6371000.0
  phi1 = math.radians(lat1)
  phi2 = math.radians(lat2)
  dphi = math.radians(lat2 - lat1)
  dlambda = math.radians(lon2 - lon1)
  a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
  return 2.0 * radius_m * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def load_grayscale(path: Path) -> np.ndarray:
  image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
  if image is None:
    raise FileNotFoundError(f"Could not read image: {path}")
  return image


def ensure_size(image: np.ndarray, target_shape: Tuple[int, int]) -> np.ndarray:
  target_h, target_w = target_shape
  if image.shape[:2] == (target_h, target_w):
    return image
  return cv2.resize(image, (target_w, target_h), interpolation=cv2.INTER_LINEAR)


def center_crop(image: np.ndarray, crop_fraction: float = 0.5) -> np.ndarray:
  h, w = image.shape[:2]
  crop_h = max(16, int(h * crop_fraction))
  crop_w = max(16, int(w * crop_fraction))
  y0 = max(0, (h - crop_h) // 2)
  x0 = max(0, (w - crop_w) // 2)
  return image[y0:y0 + crop_h, x0:x0 + crop_w]


def image_embedding(image: np.ndarray, size: Tuple[int, int] = (32, 32)) -> np.ndarray:
  resized = cv2.resize(image, size, interpolation=cv2.INTER_AREA)
  vector = resized.astype("float32").reshape(-1)
  norm = np.linalg.norm(vector)
  if norm <= 1e-6:
    return vector
  return vector / norm


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
  denom = float(np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
  if denom <= 1e-6:
    return 0.0
  return float(np.dot(vec_a, vec_b) / denom)


def summarize_errors(errors: Iterable[float]) -> dict:
  values = [float(v) for v in errors]
  if not values:
    return {
      "count": 0,
      "mean_error_m": None,
      "median_error_m": None,
      "p95_error_m": None,
    }

  arr = np.array(values, dtype="float32")
  return {
    "count": int(arr.size),
    "mean_error_m": float(arr.mean()),
    "median_error_m": float(np.median(arr)),
    "p95_error_m": float(np.percentile(arr, 95)),
  }


def top_k_accuracy(ranks: List[int], k: int) -> float:
  if not ranks:
    return 0.0
  hits = sum(1 for rank in ranks if rank <= k)
  return hits / len(ranks)
