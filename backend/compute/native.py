from __future__ import annotations

import importlib
from dataclasses import dataclass
from typing import List, Tuple

from ..execution_policy import ExecutionProfile


class PythonBackend:
    def vector_sum(self, values: List[float]) -> float:
        return float(sum(values))


@dataclass
class RustBackend:
    module: object

    def vector_sum(self, values: List[float]) -> float:
        return float(self.module.vector_sum(values))


def _try_import(module_name: str):
    try:
        return importlib.import_module(module_name)
    except Exception:
        return None


def load_backend(profile: ExecutionProfile) -> Tuple[object, bool]:
    if profile.backend_module:
        module = _try_import(profile.backend_module)
        if module is not None:
            return RustBackend(module=module), False
    return PythonBackend(), True
