from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .system_profile import HardwareProfile


@dataclass(frozen=True)
class ExecutionProfile:
    name: str
    reason: str
    backend_module: Optional[str]


def select_profile(hw: HardwareProfile) -> ExecutionProfile:
    if hw.cuda_available:
        return ExecutionProfile(
            name="cuda",
            reason="CUDA driver detected",
            backend_module="mission_planner_cuda",
        )

    is_arm = hw.arch in {"arm64", "aarch64", "armv7l", "arm"}
    if is_arm:
        return ExecutionProfile(
            name="arm_cpu",
            reason="ARM platform detected",
            backend_module="mission_planner_cpu",
        )

    simd = set(flag.lower() for flag in hw.simd)
    if "avx512" in simd or "avx2" in simd:
        return ExecutionProfile(
            name="x86_simd",
            reason="x86 SIMD detected",
            backend_module="mission_planner_simd",
        )

    return ExecutionProfile(
        name="cpu",
        reason="Default CPU fallback",
        backend_module="mission_planner_cpu",
    )
