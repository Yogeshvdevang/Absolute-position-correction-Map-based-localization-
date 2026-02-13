from __future__ import annotations

from dataclasses import dataclass
from typing import List

from ..execution_policy import ExecutionProfile
from .native import load_backend


class ComputeBackend:
    def vector_sum(self, values: List[float]) -> float:
        raise NotImplementedError


@dataclass
class BackendRouter:
    profile: ExecutionProfile
    backend: ComputeBackend
    fallback_used: bool


def init_router(profile: ExecutionProfile) -> BackendRouter:
    backend, fallback = load_backend(profile)
    return BackendRouter(profile=profile, backend=backend, fallback_used=fallback)
