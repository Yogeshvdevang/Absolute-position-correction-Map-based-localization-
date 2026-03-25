from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from ..ai_engine.coarse_match import coarse_match
from .interfaces import BenchmarkSample, CandidateScore, MethodResult, MethodSummary, TileCandidate
from .utils import center_crop, cosine_similarity, ensure_size, image_embedding


class BenchmarkMethod(ABC):
  name: str = "unknown"
  track: str = "local"

  def summary(self) -> MethodSummary:
    available, reason = self.is_available()
    return MethodSummary(name=self.name, track=self.track, available=available, reason=reason)

  def is_available(self) -> Tuple[bool, Optional[str]]:
    return True, None

  @abstractmethod
  def run(
    self,
    sample: BenchmarkSample,
    frame_gray: np.ndarray,
    candidates: Dict[str, np.ndarray],
    top_k: int,
  ) -> MethodResult:
    raise NotImplementedError

  def _select_top(
    self,
    sample: BenchmarkSample,
    scores: List[CandidateScore],
    started_at: float,
  ) -> MethodResult:
    if not scores:
      return MethodResult(
        method=self.name,
        track=self.track,
        sample_id=sample.sample_id,
        success=False,
        runtime_ms=(time.perf_counter() - started_at) * 1000.0,
        error="No candidate scores produced",
      )

    best = max(scores, key=lambda item: item.score)
    return MethodResult(
      method=self.name,
      track=self.track,
      sample_id=sample.sample_id,
      success=True,
      predicted_lat=best.center_lat,
      predicted_lon=best.center_lon,
      confidence=best.score,
      runtime_ms=(time.perf_counter() - started_at) * 1000.0,
      selected_tile_id=best.tile_id,
      top_k_tile_ids=[item.tile_id for item in sorted(scores, key=lambda item: item.score, reverse=True)[:5]],
      scores=sorted(scores, key=lambda item: item.score, reverse=True),
    )


class TemplateMatcher(BenchmarkMethod):
  name = "template"
  track = "local"

  def run(self, sample: BenchmarkSample, frame_gray: np.ndarray, candidates: Dict[str, np.ndarray], top_k: int) -> MethodResult:
    started_at = time.perf_counter()
    tile = center_crop(frame_gray, crop_fraction=0.5)
    scores: List[CandidateScore] = []

    for candidate in sample.candidate_tiles:
      candidate_img = candidates[candidate.tile_id]
      score, _ = coarse_match(tile, candidate_img)
      scores.append(CandidateScore(
        tile_id=candidate.tile_id,
        score=float(score),
        runtime_ms=0.0,
        center_lat=candidate.center_lat,
        center_lon=candidate.center_lon,
      ))

    return self._select_top(sample, scores, started_at)


class ORBMatcher(BenchmarkMethod):
  name = "orb"
  track = "local"

  def __init__(self):
    self.detector = cv2.ORB_create(1500)
    self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)

  def run(self, sample: BenchmarkSample, frame_gray: np.ndarray, candidates: Dict[str, np.ndarray], top_k: int) -> MethodResult:
    started_at = time.perf_counter()
    kp1, des1 = self.detector.detectAndCompute(frame_gray, None)
    scores: List[CandidateScore] = []

    for candidate in sample.candidate_tiles:
      candidate_img = ensure_size(candidates[candidate.tile_id], frame_gray.shape[:2])
      kp2, des2 = self.detector.detectAndCompute(candidate_img, None)
      if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
        scores.append(CandidateScore(
          tile_id=candidate.tile_id,
          score=0.0,
          runtime_ms=0.0,
          center_lat=candidate.center_lat,
          center_lon=candidate.center_lon,
          metadata={"reason": "insufficient_features"},
        ))
        continue

      knn = self.matcher.knnMatch(des1, des2, k=2)
      good = []
      for pair in knn:
        if len(pair) < 2:
          continue
        m, n = pair
        if m.distance < 0.75 * n.distance:
          good.append(m)

      score = 0.0
      metadata = {
        "keypoints_frame": len(kp1),
        "keypoints_candidate": len(kp2),
        "good_matches": len(good),
      }

      if len(good) >= 4:
        src = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
        inliers = int(mask.sum()) if mask is not None else 0
        inlier_ratio = inliers / max(len(good), 1)
        score = 0.6 * inlier_ratio + 0.4 * min(len(good) / 100.0, 1.0)
        metadata["inliers"] = inliers
        metadata["inlier_ratio"] = inlier_ratio

      scores.append(CandidateScore(
        tile_id=candidate.tile_id,
        score=float(score),
        runtime_ms=0.0,
        center_lat=candidate.center_lat,
        center_lon=candidate.center_lon,
        metadata=metadata,
      ))

    return self._select_top(sample, scores, started_at)


class OptionalMethod(BenchmarkMethod):
  import_error_reason: str = "optional dependency not installed"

  def is_available(self) -> Tuple[bool, Optional[str]]:
    return False, self.import_error_reason

  def run(self, sample: BenchmarkSample, frame_gray: np.ndarray, candidates: Dict[str, np.ndarray], top_k: int) -> MethodResult:
    return MethodResult(
      method=self.name,
      track=self.track,
      sample_id=sample.sample_id,
      success=False,
      error=self.import_error_reason,
    )


class SuperPointLightGlueMatcher(OptionalMethod):
  name = "superpoint_lightglue"
  track = "local"
  import_error_reason = "Install a LightGlue-compatible local feature stack before enabling this matcher"

  def __init__(self):
    self._backend_ready = False
    self._backend_error: Optional[str] = None
    self._torch = None
    self._device = None
    self._extractor = None
    self._matcher = None
    self._rbd = None

  def _ensure_backend(self) -> Tuple[bool, Optional[str]]:
    if self._backend_ready:
      return True, None
    if self._backend_error:
      return False, self._backend_error

    try:
      import torch
      from lightglue import LightGlue, SuperPoint
      from lightglue.utils import rbd

      self._torch = torch
      self._device = "cuda" if torch.cuda.is_available() else "cpu"
      self._extractor = SuperPoint(max_num_keypoints=2048).eval().to(self._device)
      self._matcher = LightGlue(features="superpoint").eval().to(self._device)
      self._rbd = rbd
      self._backend_ready = True
      return True, None
    except Exception as exc:
      self._backend_error = f"LightGlue backend unavailable: {exc}"
      return False, self._backend_error

  def is_available(self) -> Tuple[bool, Optional[str]]:
    return self._ensure_backend()

  def _to_rgb_tensor(self, image: np.ndarray):
    tensor = self._torch.from_numpy(image.astype("float32") / 255.0)
    tensor = tensor.to(self._device)
    tensor = tensor.unsqueeze(0).repeat(3, 1, 1)
    return tensor

  def run(self, sample: BenchmarkSample, frame_gray: np.ndarray, candidates: Dict[str, np.ndarray], top_k: int) -> MethodResult:
    ok, reason = self._ensure_backend()
    if not ok:
      return MethodResult(
        method=self.name,
        track=self.track,
        sample_id=sample.sample_id,
        success=False,
        error=reason,
      )

    started_at = time.perf_counter()
    scores: List[CandidateScore] = []

    with self._torch.inference_mode():
      image0 = self._to_rgb_tensor(frame_gray)
      feats0 = self._extractor.extract(image0)

      for candidate in sample.candidate_tiles:
        image1 = self._to_rgb_tensor(candidates[candidate.tile_id])
        feats1 = self._extractor.extract(image1)
        matches01 = self._matcher({"image0": feats0, "image1": feats1})
        feats0_rbd, feats1_rbd, matches01_rbd = [self._rbd(x) for x in [feats0, feats1, matches01]]
        matches = matches01_rbd.get("matches")
        metadata = {
          "device": self._device,
          "backend": "lightglue",
          "num_matches": 0,
        }
        score = 0.0

        if matches is not None and len(matches) >= 4:
          points0 = feats0_rbd["keypoints"][matches[..., 0]].detach().cpu().numpy().astype("float32")
          points1 = feats1_rbd["keypoints"][matches[..., 1]].detach().cpu().numpy().astype("float32")
          _, mask = cv2.findHomography(points0, points1, cv2.RANSAC, 5.0)
          inliers = int(mask.sum()) if mask is not None else 0
          inlier_ratio = inliers / max(len(matches), 1)
          score = 0.7 * inlier_ratio + 0.3 * min(len(matches) / 200.0, 1.0)
          metadata["num_matches"] = int(len(matches))
          metadata["inliers"] = inliers
          metadata["inlier_ratio"] = inlier_ratio

        scores.append(CandidateScore(
          tile_id=candidate.tile_id,
          score=float(score),
          runtime_ms=0.0,
          center_lat=candidate.center_lat,
          center_lon=candidate.center_lon,
          metadata=metadata,
        ))

    return self._select_top(sample, scores, started_at)


class LoFTRMatcher(OptionalMethod):
  name = "loftr"
  track = "local"
  import_error_reason = "Install a LoFTR-compatible matcher backend before enabling this matcher"

  def __init__(self):
    self._backend_ready = False
    self._backend_error: Optional[str] = None
    self._torch = None
    self._matcher = None
    self._device = None

  def _ensure_backend(self) -> Tuple[bool, Optional[str]]:
    if self._backend_ready:
      return True, None
    if self._backend_error:
      return False, self._backend_error

    try:
      import torch
      from kornia.feature import LoFTR

      self._torch = torch
      self._device = "cuda" if torch.cuda.is_available() else "cpu"
      self._matcher = LoFTR(pretrained="outdoor").eval().to(self._device)
      self._backend_ready = True
      return True, None
    except Exception as exc:
      self._backend_error = f"LoFTR backend unavailable: {exc}"
      return False, self._backend_error

  def is_available(self) -> Tuple[bool, Optional[str]]:
    return self._ensure_backend()

  def _to_input_tensor(self, image: np.ndarray):
    tensor = self._torch.from_numpy(image.astype("float32") / 255.0)
    tensor = tensor.to(self._device)
    return tensor.unsqueeze(0).unsqueeze(0)

  def run(self, sample: BenchmarkSample, frame_gray: np.ndarray, candidates: Dict[str, np.ndarray], top_k: int) -> MethodResult:
    ok, reason = self._ensure_backend()
    if not ok:
      return MethodResult(
        method=self.name,
        track=self.track,
        sample_id=sample.sample_id,
        success=False,
        error=reason,
      )

    started_at = time.perf_counter()
    image0 = self._to_input_tensor(frame_gray)
    scores: List[CandidateScore] = []

    with self._torch.inference_mode():
      for candidate in sample.candidate_tiles:
        image1 = self._to_input_tensor(candidates[candidate.tile_id])
        correspondences = self._matcher({"image0": image0, "image1": image1})
        keypoints0 = correspondences.get("keypoints0")
        keypoints1 = correspondences.get("keypoints1")
        confidence = correspondences.get("confidence")
        num_matches = int(keypoints0.shape[0]) if keypoints0 is not None else 0
        metadata = {
          "device": self._device,
          "backend": "loftr",
          "num_matches": num_matches,
        }
        score = 0.0

        if keypoints0 is not None and keypoints1 is not None and num_matches >= 4:
          points0 = keypoints0.detach().cpu().numpy().astype("float32")
          points1 = keypoints1.detach().cpu().numpy().astype("float32")
          _, mask = cv2.findHomography(points0, points1, cv2.RANSAC, 5.0)
          inliers = int(mask.sum()) if mask is not None else 0
          inlier_ratio = inliers / max(num_matches, 1)
          mean_conf = float(confidence.mean().item()) if confidence is not None and confidence.numel() else 0.0
          score = 0.5 * inlier_ratio + 0.3 * min(num_matches / 200.0, 1.0) + 0.2 * mean_conf
          metadata["inliers"] = inliers
          metadata["inlier_ratio"] = inlier_ratio
          metadata["mean_match_confidence"] = mean_conf

        scores.append(CandidateScore(
          tile_id=candidate.tile_id,
          score=float(score),
          runtime_ms=0.0,
          center_lat=candidate.center_lat,
          center_lon=candidate.center_lon,
          metadata=metadata,
        ))

    return self._select_top(sample, scores, started_at)


class TransGeoRetriever(BenchmarkMethod):
  name = "transgeo"
  track = "retrieval"

  def run(self, sample: BenchmarkSample, frame_gray: np.ndarray, candidates: Dict[str, np.ndarray], top_k: int) -> MethodResult:
    started_at = time.perf_counter()
    frame_vec = image_embedding(frame_gray)
    scores: List[CandidateScore] = []

    for candidate in sample.candidate_tiles:
      candidate_vec = image_embedding(candidates[candidate.tile_id])
      score = cosine_similarity(frame_vec, candidate_vec)
      scores.append(CandidateScore(
        tile_id=candidate.tile_id,
        score=score,
        runtime_ms=0.0,
        center_lat=candidate.center_lat,
        center_lon=candidate.center_lon,
        metadata={"encoder": "fallback_embedding"},
      ))

    result = self._select_top(sample, scores, started_at)
    result.metadata["mode"] = "retrieval_baseline"
    result.metadata["note"] = "Replace fallback_embedding with a TransGeo encoder for learned cross-view retrieval"
    result.top_k_tile_ids = [item.tile_id for item in sorted(scores, key=lambda item: item.score, reverse=True)[:max(top_k, 1)]]
    return result


class TransGeoLoFTRHybrid(BenchmarkMethod):
  name = "transgeo_loftr"
  track = "hybrid"

  def __init__(self):
    self.retriever = TransGeoRetriever()
    self.loftr = LoFTRMatcher()
    self.orb = ORBMatcher()

  def run(self, sample: BenchmarkSample, frame_gray: np.ndarray, candidates: Dict[str, np.ndarray], top_k: int) -> MethodResult:
    started_at = time.perf_counter()
    retrieval = self.retriever.run(sample, frame_gray, candidates, top_k)
    if not retrieval.success:
      retrieval.method = self.name
      retrieval.track = self.track
      return retrieval

    shortlist = retrieval.top_k_tile_ids[:max(top_k, 1)]
    shortlisted_candidates = [
      candidate for candidate in sample.candidate_tiles if candidate.tile_id in shortlist
    ]
    refined_sample = BenchmarkSample(
      sample_id=sample.sample_id,
      frame_path=sample.frame_path,
      ground_truth_lat=sample.ground_truth_lat,
      ground_truth_lon=sample.ground_truth_lon,
      yaw_deg=sample.yaw_deg,
      altitude_m=sample.altitude_m,
      candidate_tiles=shortlisted_candidates,
      metadata=sample.metadata,
    )
    loftr_available, _ = self.loftr.is_available()
    refiner = self.loftr if loftr_available else self.orb
    refined = refiner.run(refined_sample, frame_gray, candidates, top_k)
    refined.method = self.name
    refined.track = self.track
    refined.runtime_ms = (time.perf_counter() - started_at) * 1000.0
    refined.metadata["retrieval_top_k"] = shortlist
    refined.metadata["refiner"] = refiner.name
    refined.metadata["note"] = "Hybrid uses TransGeo-style retrieval first, then dense or sparse local refinement"
    return refined


def build_methods() -> Dict[str, BenchmarkMethod]:
  methods: List[BenchmarkMethod] = [
    TemplateMatcher(),
    ORBMatcher(),
    SuperPointLightGlueMatcher(),
    LoFTRMatcher(),
    TransGeoRetriever(),
    TransGeoLoFTRHybrid(),
  ]
  return {method.name: method for method in methods}
