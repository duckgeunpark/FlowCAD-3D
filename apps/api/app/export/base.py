"""Exporter strategy interface (plan §2.4 Export Engine).

Every concrete exporter consumes the same canonical :class:`SceneDocument` and
emits bytes for one format. Heavy CAD backends are detected at runtime via
:meth:`is_available` so the engine degrades gracefully instead of failing import.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from ..domain.enums import ExportFormat
from ..domain.scene import SceneDocument


class ExporterError(RuntimeError):
    """Raised when an export cannot be produced (bad input or backend failure)."""


class BackendUnavailableError(ExporterError):
    """Raised when the format's underlying CAD/BIM library is not installed."""


class Exporter(ABC):
    """Strategy: SceneDocument -> bytes for a single export format."""

    format: ExportFormat
    media_type: str
    file_ext: str

    @classmethod
    @abstractmethod
    def is_available(cls) -> bool:
        """Whether the backing library is importable in this environment."""

    @abstractmethod
    def export(self, scene: SceneDocument) -> bytes:
        """Serialise the scene to this format's bytes."""

    # -- shared helpers -------------------------------------------------------
    @staticmethod
    def run_id_of(element_id: str) -> str:
        """Assembly grouping key: ``"R0-SEG003"`` -> ``"R0"`` (plan: 어셈블리 계층)."""
        return element_id.split("-", 1)[0] if "-" in element_id else element_id

    @staticmethod
    def safe_name(element_id: str, user_data: dict[str, str]) -> str:
        """Human-friendly part name for the assembly tree."""
        joint = user_data.get("jointNo")
        return f"{element_id}_{joint}" if joint else element_id
