"""Factory selecting an Exporter strategy for a requested format."""
from __future__ import annotations

from ..domain.enums import ExportFormat
from .base import Exporter
from .dxf_exporter import DxfExporter
from .ifc_exporter import IfcExporter
from .pdf_exporter import PdfExporter
from .step_exporter import StepExporter

_REGISTRY: dict[ExportFormat, type[Exporter]] = {
    ExportFormat.DXF: DxfExporter,
    ExportFormat.PDF: PdfExporter,
    ExportFormat.IFC: IfcExporter,
    ExportFormat.STEP: StepExporter,
}


class ExporterFactory:
    def for_format(self, fmt: ExportFormat) -> Exporter:
        try:
            return _REGISTRY[fmt]()
        except KeyError as exc:
            raise ValueError(f"unsupported export format: {fmt}") from exc

    def availability(self) -> dict[str, bool]:
        """Report which formats' backends are installed (for the UI)."""
        return {fmt.value: cls.is_available() for fmt, cls in _REGISTRY.items()}
