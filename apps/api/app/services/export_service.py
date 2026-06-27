"""Application service: generate a scene then export it to a CAD/BIM format.

Reuses :class:`GenerationService` so export always reflects the exact same
geometry the viewer shows (single source of truth).
"""
from __future__ import annotations

from dataclasses import dataclass

from ..domain.enums import DesignMode, ExportFormat
from ..export.base import BackendUnavailableError
from ..export.factory import ExporterFactory
from ..parsing.base import Row
from .generation_service import GenerationService


@dataclass(frozen=True, slots=True)
class ExportResult:
    content: bytes
    media_type: str
    filename: str


class ExportService:
    def __init__(
        self,
        generation: GenerationService,
        exporters: ExporterFactory | None = None,
    ) -> None:
        self._generation = generation
        self._exporters = exporters or ExporterFactory()

    def export(self, mode: DesignMode, rows: list[Row], fmt: ExportFormat) -> ExportResult:
        exporter = self._exporters.for_format(fmt)
        # Uniformly surface missing backends as BackendUnavailableError (HTTP 501),
        # regardless of which exporter it is.
        if not exporter.is_available():
            raise BackendUnavailableError(
                f"{fmt.value.upper()} export backend is not installed on the server")
        scene = self._generation.generate(mode, rows)
        content = exporter.export(scene)
        return ExportResult(
            content=content,
            media_type=exporter.media_type,
            filename=f"flowcad_{mode.value}.{exporter.file_ext}",
        )

    def availability(self) -> dict[str, bool]:
        return self._exporters.availability()
