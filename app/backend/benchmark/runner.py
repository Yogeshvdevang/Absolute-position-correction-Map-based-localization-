from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from ..ai_engine.preprocess import Preprocessor
from .interfaces import BenchmarkManifest, BenchmarkRequest, BenchmarkSample, MethodResult, TileCandidate
from .methods import build_methods
from .utils import haversine_m, load_grayscale, summarize_errors, top_k_accuracy


class BenchmarkRunner:
  def __init__(self, reference_height_m: float = 100.0):
    self.reference_height_m = reference_height_m
    self.methods = build_methods()
    self.preprocessor = Preprocessor(reference_height=reference_height_m)

  def list_methods(self) -> List[dict]:
    return [summary.model_dump() for summary in (method.summary() for method in self.methods.values())]

  def load_manifest(self, manifest_path: str | Path) -> BenchmarkManifest:
    payload = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    return BenchmarkManifest.model_validate(payload)

  def run(self, request: BenchmarkRequest) -> Dict[str, Any]:
    manifest = self.load_manifest(request.manifest_path)
    self.preprocessor.reference_height = manifest.reference_height_m

    selected_methods = []
    for name in request.methods:
      method = self.methods.get(name)
      if method is None:
        raise ValueError(f"Unknown benchmark method: {name}")
      available, reason = method.is_available()
      if not available and request.fail_on_unavailable:
        raise RuntimeError(f"Method '{name}' unavailable: {reason}")
      selected_methods.append(method)

    samples = [self._convert_sample(model) for model in manifest.samples]
    records: List[Dict[str, Any]] = []

    for sample in samples:
      frame_gray = load_grayscale(sample.frame_path)
      processed = self.preprocessor.run(
        frame=frame_gray,
        yaw=sample.yaw_deg,
        lat=None,
        lon=None,
        baro_alt=sample.altitude_m,
        initial_alt=manifest.reference_height_m,
      )
      frame_ready = processed["frame"]
      candidates = {
        candidate.tile_id: load_grayscale(candidate.image_path)
        for candidate in sample.candidate_tiles
      }

      for method in selected_methods:
        result = method.run(sample, frame_ready, candidates, manifest.top_k)
        if result.success and result.predicted_lat is not None and result.predicted_lon is not None:
          result.error_m = haversine_m(
            sample.ground_truth_lat,
            sample.ground_truth_lon,
            result.predicted_lat,
            result.predicted_lon,
          )
        records.append(self._record_for_result(sample, result))

    summary = self._summarize(records)
    output = {
      "benchmark": manifest.name,
      "description": manifest.description,
      "methods": self.list_methods(),
      "summary": summary,
      "results": records,
    }

    if request.output_path:
      Path(request.output_path).write_text(json.dumps(output, indent=2), encoding="utf-8")

    return output

  def _convert_sample(self, model) -> BenchmarkSample:
    return BenchmarkSample(
      sample_id=model.sample_id,
      frame_path=Path(model.frame_path),
      ground_truth_lat=model.ground_truth_lat,
      ground_truth_lon=model.ground_truth_lon,
      yaw_deg=model.yaw_deg,
      altitude_m=model.altitude_m,
      candidate_tiles=[
        TileCandidate(
          tile_id=candidate.tile_id,
          image_path=Path(candidate.image_path),
          center_lat=candidate.center_lat,
          center_lon=candidate.center_lon,
        )
        for candidate in model.candidate_tiles
      ],
      metadata=model.metadata,
    )

  def _record_for_result(self, sample: BenchmarkSample, result: MethodResult) -> Dict[str, Any]:
    gt_tile_rank = None
    target_tile_ids = [
      candidate.tile_id
      for candidate in sample.candidate_tiles
      if abs(candidate.center_lat - sample.ground_truth_lat) < 1e-9 and abs(candidate.center_lon - sample.ground_truth_lon) < 1e-9
    ]
    target_tile = target_tile_ids[0] if target_tile_ids else None
    if target_tile:
      ordered_tile_ids = [score.tile_id for score in result.scores]
      if target_tile in ordered_tile_ids:
        gt_tile_rank = ordered_tile_ids.index(target_tile) + 1

    return {
      "sample_id": sample.sample_id,
      "method": result.method,
      "track": result.track,
      "success": result.success,
      "predicted_lat": result.predicted_lat,
      "predicted_lon": result.predicted_lon,
      "ground_truth_lat": sample.ground_truth_lat,
      "ground_truth_lon": sample.ground_truth_lon,
      "confidence": result.confidence,
      "runtime_ms": result.runtime_ms,
      "error_m": result.error_m,
      "selected_tile_id": result.selected_tile_id,
      "top_k_tile_ids": result.top_k_tile_ids,
      "ground_truth_rank": gt_tile_rank,
      "metadata": result.metadata,
      "error": result.error,
    }

  def _summarize(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_method: Dict[str, Dict[str, Any]] = {}

    for record in records:
      bucket = by_method.setdefault(record["method"], {
        "track": record["track"],
        "errors": [],
        "runtimes": [],
        "successes": 0,
        "count": 0,
        "retrieval_ranks": [],
      })
      bucket["count"] += 1
      bucket["runtimes"].append(record["runtime_ms"])
      if record["success"]:
        bucket["successes"] += 1
      if record["error_m"] is not None:
        bucket["errors"].append(record["error_m"])
      if record["ground_truth_rank"] is not None:
        bucket["retrieval_ranks"].append(record["ground_truth_rank"])

    summary: Dict[str, Any] = {}
    for method, bucket in by_method.items():
      error_summary = summarize_errors(bucket["errors"])
      runtimes = summarize_errors(bucket["runtimes"])
      summary[method] = {
        "track": bucket["track"],
        "samples": bucket["count"],
        "success_rate": bucket["successes"] / bucket["count"] if bucket["count"] else 0.0,
        "mean_runtime_ms": runtimes["mean_error_m"],
        "median_runtime_ms": runtimes["median_error_m"],
        "mean_error_m": error_summary["mean_error_m"],
        "median_error_m": error_summary["median_error_m"],
        "p95_error_m": error_summary["p95_error_m"],
        "top_1_accuracy": top_k_accuracy(bucket["retrieval_ranks"], 1),
        "top_5_accuracy": top_k_accuracy(bucket["retrieval_ranks"], 5),
      }
    return summary
