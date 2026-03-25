from __future__ import annotations

import argparse
import json

from .interfaces import BenchmarkRequest
from .runner import BenchmarkRunner


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Run APC benchmark pipelines from a manifest JSON file")
  parser.add_argument("manifest_path", help="Path to benchmark manifest JSON")
  parser.add_argument("--methods", nargs="*", default=None, help="Subset of benchmark methods to run")
  parser.add_argument("--output", dest="output_path", default=None, help="Optional output JSON path")
  parser.add_argument("--fail-on-unavailable", action="store_true", help="Exit if an optional method is unavailable")
  return parser


def main() -> int:
  parser = build_parser()
  args = parser.parse_args()
  request = BenchmarkRequest(
    manifest_path=args.manifest_path,
    methods=args.methods or BenchmarkRequest().methods,
    output_path=args.output_path,
    fail_on_unavailable=args.fail_on_unavailable,
  )
  runner = BenchmarkRunner()
  result = runner.run(request)
  print(json.dumps(result["summary"], indent=2))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
