from __future__ import annotations

from dataclasses import dataclass
import ctypes
import os
import platform
import re
import sys
from pathlib import Path
from typing import List, Optional


@dataclass(frozen=True)
class HardwareProfile:
    arch: str
    cpu_cores: int
    threads: int
    simd: List[str]
    ram_gb: float
    cuda_available: bool
    gpu_name: Optional[str]
    is_raspberry_pi: bool
    cpu_model: Optional[str]


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def _detect_simd_flags_linux(cpuinfo: str) -> List[str]:
    flags = []
    for line in cpuinfo.splitlines():
        if line.startswith("flags"):
            _, value = line.split(":", 1)
            flags.extend(value.strip().split())
        if line.startswith("Features"):
            _, value = line.split(":", 1)
            flags.extend(value.strip().split())
    return sorted(set(flags))


def _detect_simd_flags_windows() -> List[str]:
    proc = os.environ.get("PROCESSOR_IDENTIFIER", "")
    flags = []
    for token in ("AVX512", "AVX2", "AVX", "SSE4_2", "SSE4_1", "SSE2"):
        if token in proc.upper():
            flags.append(token.lower())
    return flags


def _detect_ram_gb() -> float:
    if sys.platform.startswith("linux"):
        try:
            page_size = os.sysconf("SC_PAGE_SIZE")
            pages = os.sysconf("SC_PHYS_PAGES")
            return round((page_size * pages) / (1024 ** 3), 2)
        except Exception:
            return 0.0
    if sys.platform.startswith("win"):
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]
        status = MEMORYSTATUSEX()
        status.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return round(status.ullTotalPhys / (1024 ** 3), 2)
        return 0.0
    if sys.platform == "darwin":
        try:
            import subprocess
            out = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip()
            return round(int(out) / (1024 ** 3), 2)
        except Exception:
            return 0.0
    return 0.0


def _detect_cuda() -> tuple[bool, Optional[str]]:
    lib_names = ["nvcuda.dll", "libcuda.so", "libcuda.dylib"]
    for name in lib_names:
        try:
            ctypes.CDLL(name)
            return True, None
        except Exception:
            continue
    return False, None


def _detect_rpi_model() -> Optional[str]:
    for path in (
        Path("/proc/device-tree/model"),
        Path("/sys/firmware/devicetree/base/model"),
    ):
        text = _read_text(path)
        if text:
            return text.strip("\x00\n")
    return None


def profile_hardware() -> HardwareProfile:
    arch = platform.machine().lower()
    cpu_cores = os.cpu_count() or 1
    threads = cpu_cores
    cpu_model = None

    simd_flags: List[str] = []
    if sys.platform.startswith("linux"):
        cpuinfo = _read_text(Path("/proc/cpuinfo"))
        simd_flags = _detect_simd_flags_linux(cpuinfo)
        match = re.search(r"model name\s*:\s*(.+)", cpuinfo)
        if match:
            cpu_model = match.group(1).strip()
    elif sys.platform.startswith("win"):
        simd_flags = _detect_simd_flags_windows()
        cpu_model = os.environ.get("PROCESSOR_IDENTIFIER")
    else:
        cpu_model = platform.processor() or None

    ram_gb = _detect_ram_gb()
    cuda_available, gpu_name = _detect_cuda()
    rpi_model = _detect_rpi_model()
    is_raspberry_pi = bool(rpi_model and "raspberry" in rpi_model.lower())

    return HardwareProfile(
        arch=arch,
        cpu_cores=cpu_cores,
        threads=threads,
        simd=simd_flags,
        ram_gb=ram_gb,
        cuda_available=cuda_available,
        gpu_name=gpu_name,
        is_raspberry_pi=is_raspberry_pi,
        cpu_model=cpu_model,
    )
